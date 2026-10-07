// Envio do vídeo direto do navegador para o S3, em partes (Etapa 3, bloco 3).
// - Partes de 5 MB, até 3 ao mesmo tempo; o progresso soma os bytes já enviados.
// - Uma parte que falha é tentada de novo (até 5 vezes, esperando cada vez mais).
// - Retomada: o andamento fica guardado neste aparelho (por conta e por arquivo). Se
//   a conexão cair ou a página fechar, escolher o mesmo arquivo de novo continua de
//   onde parou: o servidor diz quais partes já chegaram ao S3.
// - Os limites do plano são do servidor (rotas em app/servidor/envio.ts); aqui só se
//   mede a duração antes, para avisar sem gastar dados.
// - O erro diz em que etapa o envio parou; 30 s sem andamento avisam a tela.
import {pedir} from "./api";
import {usuarioDaSessao} from "./sessao";

export class ErroDeEnvio extends Error {
  constructor(
    mensagem: string,
    readonly status?: number,
  ) {
    super(mensagem);
  }
}

// A tela escuta este evento: o envio está parado há 30 s (detail: nome da etapa).
export const EVENTO_ENVIO_PARADO = "envio-parado";
const PARADO_MS = 30_000;

const statusDo = (erro: unknown) => (erro instanceof ErroDeEnvio ? erro.status : undefined);

type Andamento = {
  chave: string;
  envio: string;
  tamanhoDaParte: number;
  partes: number;
  // Partes já no S3: número → ETag.
  feitas: Record<number, string>;
  quando: number;
};

const PARALELO = 3;
const TENTATIVAS = 5;
const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Cada arquivo, de cada conta, tem o seu andamento guardado.
const chaveDoAndamento = (arquivo: File) =>
  `envio:${usuarioDaSessao() ?? "?"}:${arquivo.name}:${arquivo.size}:${arquivo.lastModified}`;
const lerAndamento = (arquivo: File): Andamento | undefined => {
  try {
    const texto = localStorage.getItem(chaveDoAndamento(arquivo));
    return texto ? (JSON.parse(texto) as Andamento) : undefined;
  } catch {
    return undefined;
  }
};
const guardarAndamento = (arquivo: File, andamento: Andamento | undefined) => {
  try {
    if (andamento) {
      localStorage.setItem(chaveDoAndamento(arquivo), JSON.stringify(andamento));
    } else {
      localStorage.removeItem(chaveDoAndamento(arquivo));
    }
  } catch {
    // Sem armazenamento no aparelho: o envio funciona, só não retoma depois de fechar.
  }
};

// Envios interrompidos desta conta, para a tela lembrar (nome e quanto já foi).
export const enviosInterrompidos = (): {nome: string; fracao: number}[] => {
  const prefixo = `envio:${usuarioDaSessao() ?? "?"}:`;
  const lista: {nome: string; fracao: number}[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i) ?? "";
      if (!chave.startsWith(prefixo)) continue;
      const andamento = JSON.parse(localStorage.getItem(chave) ?? "{}") as Andamento;
      // O S3 apaga envios abandonados em 2 dias: depois disso não há o que retomar.
      if (Date.now() - andamento.quando > 2 * 24 * 3600 * 1000) {
        localStorage.removeItem(chave);
        continue;
      }
      const nome = chave.slice(prefixo.length).split(":").slice(0, -2).join(":");
      lista.push({nome, fracao: Object.keys(andamento.feitas).length / Math.max(1, andamento.partes)});
    }
  } catch {
    return [];
  }
  return lista;
};

const lerResposta = async <T>(resposta: Response): Promise<T> => {
  const dados = (await resposta.json().catch(() => ({}))) as T & {mensagem?: string};
  if (!resposta.ok) {
    throw new ErroDeEnvio(dados.mensagem ?? `Erro ${resposta.status}`, resposta.status);
  }
  return dados;
};
const postar = <T>(rota: string, corpo: unknown) =>
  pedir(`/api/envio/${rota}`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(corpo)}).then((r) => lerResposta<T>(r));

// Duração pelo próprio navegador (sem enviar nada). Sem conseguir ler em 10 s (alguns
// formatos), fica para o servidor conferir no fim.
const medirDuracao = (arquivo: File): Promise<number | undefined> =>
  new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(arquivo);
    const terminar = (duracao?: number) => {
      URL.revokeObjectURL(url);
      resolve(duracao !== undefined && Number.isFinite(duracao) && duracao > 0 ? duracao : undefined);
    };
    const prazo = setTimeout(() => terminar(), 10_000);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      clearTimeout(prazo);
      terminar(video.duration);
    };
    video.onerror = () => {
      clearTimeout(prazo);
      terminar();
    };
    video.src = url;
  });

// Envia uma parte ao endereço assinado; devolve a ETag. onBytes: bytes desta parte já enviados.
const enviarParte = (url: string, corpo: Blob, onBytes: (bytes: number) => void): Promise<string> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (event) => onBytes(event.loaded);
    xhr.onload = () => {
      const etag = xhr.getResponseHeader("ETag");
      if (xhr.status >= 200 && xhr.status < 300 && etag) {
        resolve(etag);
      } else {
        // Aceita pelo S3, mas sem a ETag visível: o CORS do bucket não a expõe.
        const motivo = xhr.status >= 200 && xhr.status < 300 ? " sem ETag" : "";
        reject(new ErroDeEnvio(`Parte recusada pelo armazenamento (${xhr.status}${motivo}).`, xhr.status));
      }
    };
    xhr.onerror = () => reject(new ErroDeEnvio("Conexão interrompida.", xhr.status));
    xhr.ontimeout = () => reject(new ErroDeEnvio("Conexão lenta demais.", xhr.status));
    xhr.timeout = 10 * 60 * 1000;
    xhr.send(corpo);
  });

// Envia o arquivo; devolve o nome com que ficou na lista. ErroDeEnvio com status 409:
// já existe um vídeo com esse nome (substituir: true para trocar).
export const enviarDireto = async (
  arquivo: File,
  substituir: boolean,
  onProgresso: (fracao: number) => void,
): Promise<string> => {
  // A etapa atual entra na mensagem de erro e no aviso de "parado há 30 s".
  let etapa = "escolha do arquivo";
  let ultimoSinal = Date.now();
  let avisouParado = false;
  const sinal = () => {
    ultimoSinal = Date.now();
    avisouParado = false;
  };
  const mudarEtapa = (nova: string) => {
    etapa = nova;
    sinal();
  };
  const vigia = setInterval(() => {
    if (!avisouParado && Date.now() - ultimoSinal > PARADO_MS) {
      avisouParado = true;
      window.dispatchEvent(new CustomEvent(EVENTO_ENVIO_PARADO, {detail: etapa}));
    }
  }, 5000);

  try {
    let andamento = lerAndamento(arquivo);
    if (andamento) {
      // Retomada: o que vale é o que já está no S3.
      mudarEtapa("retomada (partes já enviadas)");
      const {existe, partes} = await pedir(
        `/api/envio/partes?chave=${encodeURIComponent(andamento.chave)}&envio=${encodeURIComponent(andamento.envio)}`,
      ).then((r) => lerResposta<{existe: boolean; partes: {numero: number; etag: string}[]}>(r));
      andamento = existe ? {...andamento, feitas: Object.fromEntries(partes.map((p) => [p.numero, p.etag]))} : undefined;
      guardarAndamento(arquivo, andamento);
    }
    if (!andamento) {
      mudarEtapa("leitura da duração");
      const duracaoS = await medirDuracao(arquivo);
      mudarEtapa("abertura do envio");
      const aberto = await postar<{chave: string; envio: string; tamanhoDaParte: number; partes: number}>("iniciar", {
        nome: arquivo.name,
        tamanho: arquivo.size,
        duracaoS,
        substituir,
      });
      andamento = {...aberto, feitas: {}, quando: Date.now()};
      guardarAndamento(arquivo, andamento);
    }

    const atual = andamento;
    const tamanhoDa = (numero: number) => Math.min(atual.tamanhoDaParte, arquivo.size - (numero - 1) * atual.tamanhoDaParte);
    const emAndamento = new Map<number, number>();
    const informar = () => {
      const prontos = Object.keys(atual.feitas).reduce((soma, n) => soma + tamanhoDa(Number(n)), 0);
      const parciais = [...emAndamento.values()].reduce((soma, bytes) => soma + bytes, 0);
      onProgresso(Math.min(0.999, (prontos + parciais) / arquivo.size));
    };
    informar();

    const faltam = Array.from({length: atual.partes}, (_, i) => i + 1).filter((n) => !atual.feitas[n]);
    const enderecos = new Map<number, string>();
    // Assina em lotes (endereços valem 1 hora; um que vencer é pedido de novo).
    const assinar = async (numeros: number[]) => {
      const {enderecos: lista} = await postar<{enderecos: {numero: number; url: string}[]}>("assinar", {
        chave: atual.chave,
        envio: atual.envio,
        partes: numeros,
      });
      for (const {numero, url} of lista) enderecos.set(numero, url);
      sinal();
    };

    mudarEtapa("envio das partes");
    let proxima = 0;
    const trabalhador = async () => {
      while (proxima < faltam.length) {
        const numero = faltam[proxima++];
        for (let tentativa = 1; ; tentativa++) {
          try {
            if (!enderecos.has(numero)) {
              await assinar(faltam.slice(faltam.indexOf(numero), faltam.indexOf(numero) + 6).filter((n) => !enderecos.has(n) && !atual.feitas[n]));
            }
            const comeco = (numero - 1) * atual.tamanhoDaParte;
            const etag = await enviarParte(enderecos.get(numero)!, arquivo.slice(comeco, comeco + tamanhoDa(numero)), (bytes) => {
              sinal();
              emAndamento.set(numero, bytes);
              informar();
            });
            emAndamento.delete(numero);
            atual.feitas[numero] = etag;
            guardarAndamento(arquivo, atual);
            informar();
            break;
          } catch (erro) {
            emAndamento.delete(numero);
            informar();
            // Endereço vencido ou recusado: assina de novo na próxima tentativa.
            enderecos.delete(numero);
            // Recusa definitiva do servidor (fora o endereço vencido, 403): sem repetir.
            if (erro instanceof ErroDeEnvio && erro.status && erro.status >= 400 && erro.status < 500 && erro.status !== 403) {
              throw erro;
            }
            if (tentativa >= TENTATIVAS) {
              throw new ErroDeEnvio(
                `A conexão caiu durante o envio (${Math.round((Object.keys(atual.feitas).length / atual.partes) * 100)}% enviado). ` +
                  "Toque em Importar e escolha o mesmo vídeo para continuar de onde parou.",
              );
            }
            // Sem internet: espera ela voltar (até 30 s) antes de tentar de novo.
            if (!navigator.onLine) {
              await Promise.race([new Promise((resolve) => window.addEventListener("online", resolve, {once: true})), esperar(30_000)]);
            }
            await esperar(1000 * 2 ** (tentativa - 1));
          }
        }
      }
    };
    await Promise.all(Array.from({length: Math.min(PARALELO, faltam.length)}, trabalhador));

    // Fecha o envio; o servidor confere o tamanho e a duração de verdade.
    mudarEtapa("conclusão (aviso ao servidor)");
    try {
      const {nome} = await postar<{nome: string}>("concluir", {
        chave: atual.chave,
        envio: atual.envio,
        partes: Object.entries(atual.feitas).map(([numero, etag]) => ({numero: Number(numero), etag})),
      });
      guardarAndamento(arquivo, undefined);
      onProgresso(1);
      return nome;
    } catch (erro) {
      // O servidor respondeu (recusou e apagou): não há o que retomar. Sem resposta
      // (conexão caiu ao fechar), o andamento fica para tentar de novo.
      if (erro instanceof ErroDeEnvio && erro.status) {
        guardarAndamento(arquivo, undefined);
        throw erro;
      }
      throw new ErroDeEnvio("A conexão caiu ao terminar o envio. Toque em Importar e escolha o mesmo vídeo para terminar.");
    }
  } catch (erro) {
    // "Já existe" (409) segue como está: a tela pergunta se quer substituir.
    if (statusDo(erro) === 409) {
      throw erro;
    }
    throw new ErroDeEnvio(`${erro instanceof Error ? erro.message : String(erro)} (parou na etapa: ${etapa})`, statusDo(erro));
  } finally {
    clearInterval(vigia);
  }
};

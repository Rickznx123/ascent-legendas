// Projetos (PLANO-CORTES.md, Blocos 1 a 6), no computador e no celular: a lista dos
// projetos com "Novo projeto" e o editor de cortes na tela inteira (a mídia do projeto,
// a prévia e a timeline; "Gerar legendas" monta o vídeo dos cortes e transcreve só ele;
// com um vídeo inteiro, "Pular" legenda o próprio vídeo, sem montar).
// Só com login (os projetos ficam no Supabase); no modo local, o Início de sempre.
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {api, tituloDoVideo} from "./api";
import type {Catalogo, Montagem, ProjetoComTimeline, ResumoDeProjeto} from "./api";
import {Cartao} from "./celular/Inicio";
import {plataforma} from "./plataforma";
import {editorDeCortes} from "./sessao";
import type {VideoEscolhido} from "./plataforma";
import {EditorDaTimeline, LerVideo, TIPO_DO_ARRASTO, useTimeline} from "./Timeline";
import type {InfoDoVideo} from "./Timeline";
import {comTentativas} from "./tentativas";
import {assinaturaDosTrechos, novoId, removerPausas} from "./trechos";
import type {Duracoes} from "./trechos";
import type {Editor} from "./useEditor";

// Abrir: um projeto com o vídeo das legendas já escolhido (ou um vídeo antigo, sem
// projeto) vai para as legendas; um projeto ainda na timeline, para os cortes.
// id junto do vídeo: as legendas mostram "Cortes" para voltar a este projeto.
export type Abrir = (alvo: {video: string; id?: string} | {id: string}) => void;

const PERGUNTAR_DE_NOVO_MS = 2000;
const AVISO_DE_NOVOS_CORTES =
  "Se mudar os cortes, as legendas serão geradas de novo (conta 1 transcrição do dia) e as edições de legenda deste projeto serão perdidas.";

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", {day: "2-digit", month: "2-digit", year: "numeric"});
const quantosVideos = (n: number) => (n === 1 ? "1 vídeo" : `${n} vídeos`);

// "Novo projeto": só o nome. Criado, abre os cortes.
const NovoProjeto: React.FC<{ocupado: boolean; onCriado: (id: string) => void}> = ({ocupado, onCriado}) => {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string>();
  const [criando, setCriando] = useState(false);
  if (!aberto) {
    return (
      <button type="button" className="bt primario cel-cheio" disabled={ocupado} onClick={() => setAberto(true)}>
        ＋ Novo projeto
      </button>
    );
  }
  return (
    <form
      className="novo-projeto"
      onSubmit={(event) => {
        event.preventDefault();
        setCriando(true);
        setErro(undefined);
        api
          .criarProjeto(nome)
          .then(({id}) => onCriado(id))
          .catch((error: unknown) => setErro(error instanceof Error ? error.message : String(error)))
          .finally(() => setCriando(false));
      }}
    >
      <label htmlFor="nome-do-projeto">Nome do projeto</label>
      <input id="nome-do-projeto" type="text" maxLength={80} autoFocus value={nome} onChange={(event) => setNome(event.target.value)} />
      <div className="novo-projeto-botoes">
        <button type="submit" className="bt primario" disabled={criando || !nome.trim()}>
          {criando ? "Criando…" : "Criar"}
        </button>
        <button type="button" className="bt" disabled={criando} onClick={() => setAberto(false)}>
          Cancelar
        </button>
      </div>
      {erro ? <p className="login-erro" role="alert">{erro}</p> : null}
    </form>
  );
};

export const ListaDeProjetos: React.FC<{e: Editor; onAbrir: Abrir}> = ({e, onAbrir}) => {
  const [lista, setLista] = useState<{projetos: ResumoDeProjeto[]; soltos: string[]}>();
  const [erro, setErro] = useState<string>();
  // De novo quando a lista de vídeos muda (um envio, um vídeo removido).
  useEffect(() => {
    api
      .projetos()
      .then(setLista)
      .catch((error: unknown) => setErro(error instanceof Error ? error.message : String(error)));
  }, [e.catalogo]);
  // Editor de cortes desligado (EDITOR_CORTES=off): o fluxo antigo, enviar o vídeo e
  // legendar direto. Os projetos continuam na lista e abrem nas legendas do seu vídeo.
  const cortes = editorDeCortes();
  const importar = async () => {
    const nome = await e.escolherEImportar({galeria: true});
    if (nome) onAbrir({video: nome});
  };
  return (
    <>
      {cortes ? (
        <NovoProjeto ocupado={e.ocupado} onCriado={(id) => onAbrir({id})} />
      ) : (
        <button type="button" className="bt primario cel-cheio" disabled={e.ocupado} onClick={() => void importar()}>
          ＋ Importar vídeo
        </button>
      )}
      <div className="titulo">Seus projetos</div>
      {erro ? <p className="login-erro" role="alert">{erro}</p> : null}
      {lista && lista.projetos.length + lista.soltos.length === 0 ? <p className="vazio">Nenhum projeto ainda. Toque em Novo projeto.</p> : null}
      <div className="cel-videos">
        {lista?.projetos.map((p) => {
          const video = p.video ?? p.capa;
          if (!cortes && !video) return null;
          return (
          <Cartao
            key={p.id}
            nome={p.capa ?? ""}
            titulo={p.nome}
            situacao={`${p.etapa === "legendado" ? "Legendado" : "Em edição"} · ${quantosVideos(p.videos)} · ${dataCurta(p.atualizadoEm)}`}
            atual={false}
            ocupado={e.ocupado}
            onAbrir={() => onAbrir(!cortes && video ? {video} : p.video ? {video: p.video, id: p.id} : {id: p.id})}
          />
          );
        })}
        {/* Vídeos enviados antes dos projetos: abrem as legendas, como antes. */}
        {lista?.soltos.map((nome) => (
          <Cartao
            key={nome}
            nome={nome}
            titulo={tituloDoVideo(e.catalogo, nome)}
            situacao="Em edição · 1 vídeo"
            atual={false}
            ocupado={e.ocupado}
            onAbrir={() => onAbrir({video: nome})}
          />
        ))}
      </div>
    </>
  );
};

// Um vídeo escolhido para o projeto, do momento em que é escolhido até chegar (ou falhar).
type Envio = {chave: string; escolhido: VideoEscolhido; estado: "fila" | "enviando" | "enviado" | "falhou"; fracao?: number; mensagem?: string};

// O vídeo montado (Bloco 4) é do projeto, mas não é mídia para pôr na timeline.
const MONTADO = /^projeto-[0-9a-f]{8}-v\d+\.mp4$/u;
const duracaoCurta = (ms?: number) => (ms ? `${Math.floor(ms / 60_000)}:${String(Math.round((ms % 60_000) / 1000)).padStart(2, "0")}` : "");
// A forma de onda vem do servidor em base64 (1 byte por pico).
const picosDe = (base64: string) => Uint8Array.from(atob(base64), (letra) => letra.charCodeAt(0));
const picosDeTodos = (ondas: Record<string, string> = {}) => Object.fromEntries(Object.entries(ondas).map(([nome, onda]) => [nome, picosDe(onda)]));

type PropsDaMidia = {
  arquivos: string[];
  envios: Envio[];
  usados: Set<string>;
  infos: Record<string, InfoDoVideo>;
  catalogo: Catalogo;
  celular: boolean;
  travado: boolean;
  aviso?: string;
  onImportar: () => void;
  onAdicionar: (nome: string) => void;
  onTentarDeNovo: (envio: Envio) => void;
  onApagar: () => void;
};

// A mídia do projeto: importar, os vídeos sendo enviados (com o estado) e os arquivos.
// ＋ põe um arquivo no fim da timeline; no computador, arrastá-lo para a timeline o põe
// onde cair; no celular (na folha), tocar nele o põe no fim.
const Midia: React.FC<PropsDaMidia> = ({arquivos, envios, usados, infos, catalogo, celular, travado, aviso, onImportar, onAdicionar, onTentarDeNovo, onApagar}) => {
  const indo = envios.filter((envio) => envio.estado !== "enviado");
  return (
    <>
      <button type="button" className="ec-importar" disabled={travado} onClick={onImportar}>
        ＋ <b>{celular ? "Importar da galeria" : "Importar vídeos"}</b>
        {celular ? null : <small>ou arraste os arquivos para cá</small>}
      </button>
      <div className="ec-grade">
        {indo.map((envio) => (
          <div key={envio.chave} className={`ec-arq ec-arq-${envio.estado}`} role={envio.estado === "falhou" ? "alert" : undefined}>
            <span className="ec-arq-capa" />
            <div className="ec-arq-info">
              <span>{envio.escolhido.nome}</span>
            </div>
            <div className="ec-arq-estado">
              {envio.estado === "fila" ? "Na fila" : null}
              {envio.estado === "enviando" ? (
                <>
                  Enviando {Math.round((envio.fracao ?? 0) * 100)}%
                  <progress max={1} value={envio.fracao ?? 0} />
                </>
              ) : null}
              {envio.estado === "falhou" ? (
                <>
                  Falhou: {envio.mensagem}
                  <button type="button" className="bt" onClick={() => onTentarDeNovo(envio)}>
                    Tentar de novo
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ))}
        {arquivos.map((nome) => {
          const capa = infos[nome]?.capa;
          return (
            <div
              key={nome}
              className={`ec-arq${usados.has(nome) ? " ec-usado" : ""}`}
              draggable={!celular && !travado}
              onDragStart={(event) => event.dataTransfer.setData(TIPO_DO_ARRASTO, nome)}
              // Celular: o arquivo inteiro é o botão de pôr no fim da timeline.
              {...(celular ? {role: "button", tabIndex: 0, onClick: () => !travado && onAdicionar(nome)} : {})}
            >
              <span className="ec-arq-capa" style={capa ? {backgroundImage: `url("${capa}")`} : undefined} />
              {usados.has(nome) ? <span className="ec-selo">na timeline</span> : null}
              {celular ? null : (
                <button type="button" className="ec-add" aria-label="Pôr no fim da timeline" title="Pôr no fim da timeline" disabled={travado} onClick={() => onAdicionar(nome)}>
                  ＋
                </button>
              )}
              <div className="ec-arq-info">
                <span>{tituloDoVideo(catalogo, nome)}</span>
                <span className="suave">{duracaoCurta(infos[nome]?.duracaoMs)}</span>
              </div>
              <div className="ec-arq-estado">Enviado</div>
            </div>
          );
        })}
      </div>
      {arquivos.length + indo.length === 0 ? <p className="vazio">Nenhum vídeo no projeto ainda.</p> : null}
      {aviso ? <p className="suave ec-aviso">{aviso}</p> : null}
      <button type="button" className="bt ec-apagar" disabled={travado} onClick={onApagar}>
        Apagar projeto
      </button>
    </>
  );
};

type PropsDosCortes = {e: Editor; id: string; celular: boolean; onVoltar: () => void; onLegendar: (video: string) => void; onApagado: () => void};

// O editor de cortes de um projeto, na tela inteira (editor-cortes-referencia.html):
// topo, mídia, prévia, controles e timeline.
export const EditorDeCortes: React.FC<PropsDosCortes> = (props) => {
  const [projeto, setProjeto] = useState<ProjetoComTimeline>();
  const [erro, setErro] = useState<string>();
  useEffect(() => {
    api
      .projetoComTimeline(props.id)
      .then(setProjeto)
      .catch((error: unknown) => setErro(error instanceof Error ? error.message : String(error)));
  }, [props.id]);
  if (projeto) return <CortesDoProjeto key={projeto.id} {...props} projeto={projeto} />;
  return (
    <div className={`ec ec-carregando${props.celular ? " ec-celular" : ""}`}>
      <header className="ec-topo">
        <button type="button" className="ec-voltar" aria-label="Voltar para os projetos" onClick={props.onVoltar}>
          ‹
        </button>
        <h1>Projeto</h1>
      </header>
      {erro ? (
        <p className="login-erro" role="alert">
          {erro}
        </p>
      ) : (
        <p className="suave">Abrindo o projeto…</p>
      )}
    </div>
  );
};

const TEXTO_DO_SALVAMENTO = {salvo: "Salvo", pendente: "Salvando…", salvando: "Salvando…", erro: "Erro ao salvar"};

const CortesDoProjeto: React.FC<PropsDosCortes & {projeto: ProjetoComTimeline}> = ({e, id, celular, projeto, onVoltar, onLegendar, onApagado}) => {
  const [ocupado, setOcupado] = useState(false);
  const t = useTimeline(id, projeto.timeline.trechos);
  const trechos = t.lista;
  const listaAtual = useRef(trechos);
  listaAtual.current = trechos;

  // Avisos curtos por cima da tela; um erro fica até ser fechado.
  const [nota, setNota] = useState<{texto: string; erro?: boolean}>();
  useEffect(() => {
    if (!nota || nota.erro) return;
    const timer = window.setTimeout(() => setNota(undefined), 1800);
    return () => window.clearTimeout(timer);
  }, [nota]);
  const mostrarErro = (error: unknown) => setNota({texto: error instanceof Error ? error.message : String(error), erro: true});

  // Saiu da tela: a fila de envios para e a montagem deixa de ser acompanhada (e não
  // abre as legendas sozinha). Volta a true ao montar: no desenvolvimento o React
  // monta, desmonta e monta de novo (StrictMode).
  const naTela = useRef(true);
  useEffect(() => {
    naTela.current = true;
    return () => {
      naTela.current = false;
    };
  }, []);

  // Os arquivos do projeto: os que já passaram pela timeline (o servidor guarda), os
  // dela e os enviados agora. A duração, a capa e a prévia de cada um vêm dos leitores.
  const [enviadosAgora, setEnviadosAgora] = useState<string[]>([]);
  const arquivos = useMemo(
    () => [...new Set([...(projeto.timeline.midia ?? []), ...trechos.map((trecho) => trecho.video), ...enviadosAgora])].filter((nome) => !MONTADO.test(nome)),
    [projeto.timeline.midia, trechos, enviadosAgora],
  );
  const usados = useMemo(() => new Set(trechos.map((trecho) => trecho.video)), [trechos]);
  const [infos, setInfos] = useState<Record<string, InfoDoVideo>>({});
  const aoInfo = useCallback((nome: string, info: InfoDoVideo) => setInfos((atual) => ({...atual, [nome]: info})), []);
  const duracoes = useMemo(
    () => Object.fromEntries(Object.entries(infos).flatMap(([nome, info]) => (info.duracaoMs ? [[nome, info.duracaoMs]] : []))) as Duracoes,
    [infos],
  );

  // Áudio dos vídeos da timeline (pausas e forma de onda), lido uma vez no servidor e
  // guardado no projeto: pedido quando entra um vídeo ainda sem onda.
  const [pausas, setPausas] = useState<Record<string, [number, number][]>>(projeto.timeline.pausas ?? {});
  const [ondas, setOndas] = useState<Record<string, Uint8Array>>(() => picosDeTodos(projeto.timeline.ondas));
  const lerAudio = async () => {
    await t.salvarAgora();
    const audio = await api.audio(id);
    setPausas((atual) => ({...atual, ...audio.pausas}));
    setOndas((atual) => ({...atual, ...picosDeTodos(audio.ondas)}));
    return audio.pausas;
  };
  const semOnda = [...usados].filter((nome) => !ondas[nome]).join("|");
  const audioPedidoPara = useRef("");
  useEffect(() => {
    // Uma vez por conjunto de vídeos sem onda (uma falha não fica tentando sem parar: a onda só não aparece).
    if (!semOnda || audioPedidoPara.current === semOnda) return;
    audioPedidoPara.current = semOnda;
    lerAudio().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semOnda]);

  const [removendoPausas, setRemovendoPausas] = useState(false);
  const removerAsPausas = async () => {
    setRemovendoPausas(true);
    try {
      const conhecidas = [...usados].every((nome) => pausas[nome]) ? pausas : {...pausas, ...(await lerAudio())};
      const atual = listaAtual.current;
      const nova = removerPausas(atual, duracoes, conhecidas);
      if (nova === atual) {
        setNota({texto: "Nenhuma pausa para remover."});
      } else {
        t.mudar(() => nova);
        setNota({texto: "Pausas removidas. Desfazer volta tudo."});
      }
    } catch (error) {
      mostrarErro(error);
    } finally {
      setRemovendoPausas(false);
    }
  };

  // Pôr um arquivo na timeline: no fim (＋, folha) ou onde foi solto (arrastado da mídia).
  const inserir = (nome: string, posicao = listaAtual.current.length) => {
    t.mudar((lista) => [...lista.slice(0, posicao), {id: novoId(), video: nome, inicioMs: 0}, ...lista.slice(posicao)]);
    setNota({texto: "Adicionado à timeline"});
  };

  // Vários vídeos (escolhidos ou arrastados): numa fila, enviados um por vez na ordem
  // (mais vídeos escolhidos no meio entram no fim da fila), cada um com o seu estado na
  // mídia desde que é escolhido. Cada um entra no fim da timeline assim que chega. Falha
  // passageira: tenta mais 2 vezes sozinho (o envio continua de onde parou); se não
  // der, só aquele vídeo mostra "Tentar de novo".
  const fila = useRef<Envio[]>([]);
  const enviandoAFila = useRef(false);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const mudarEnvio = (chave: string, mudanca: Partial<Envio>) =>
    setEnvios((lista) => lista.map((envio) => (envio.chave === chave ? {...envio, ...mudanca} : envio)));
  const editor = useRef(e);
  editor.current = e;
  const esvaziarAFila = async () => {
    if (enviandoAFila.current) return;
    enviandoAFila.current = true;
    let feitos = 0;
    try {
      while (fila.current.length > 0 && naTela.current) {
        const {chave, escolhido} = fila.current.shift()!;
        feitos++;
        const posicao = `${feitos} de ${feitos + fila.current.length}`;
        mudarEnvio(chave, {estado: "enviando", fracao: 0});
        try {
          const video = await comTentativas(() =>
            editor.current.importarVideo(escolhido, {posicao, onProgresso: (fracao) => mudarEnvio(chave, {fracao})}),
          );
          if (!video) {
            // Não quis substituir um vídeo com o mesmo nome.
            setEnvios((lista) => lista.filter((envio) => envio.chave !== chave));
            continue;
          }
          const trecho = {id: novoId(), video, inicioMs: 0};
          if (naTela.current) {
            setEnviadosAgora((lista) => [...lista, video]);
            t.mudar((lista) => [...lista, trecho]);
          } else {
            // Saiu da tela durante o envio: o vídeo entra no projeto direto no servidor.
            const {timeline} = await api.projetoComTimeline(id);
            await api.salvarProjetoComTimeline(id, {timeline: {trechos: [...timeline.trechos, trecho]}});
          }
          mudarEnvio(chave, {estado: "enviado", fracao: 1});
        } catch (error) {
          mudarEnvio(chave, {estado: "falhou", mensagem: error instanceof Error ? error.message.replace(/ \(parou na etapa: .*\)$/u, "") : String(error)});
        }
      }
    } finally {
      // Saiu da tela: os que não começaram ficam de fora (o envio mexeria no editor de outra tela).
      fila.current = [];
      enviandoAFila.current = false;
    }
  };
  const enfileirar = (novos: Envio[]) => {
    fila.current.push(...novos);
    void esvaziarAFila();
  };
  const adicionar = (escolhidos: VideoEscolhido[]) => {
    const novos = escolhidos.map((escolhido): Envio => ({chave: novoId(), escolhido, estado: "fila"}));
    // Os já enviados saem da lista; os que falharam ficam até tentar de novo.
    setEnvios((lista) => [...lista.filter((envio) => envio.estado !== "enviado"), ...novos]);
    enfileirar(novos);
  };
  const tentarDeNovo = (envio: Envio) => {
    const deNovo: Envio = {...envio, estado: "fila", fracao: undefined, mensagem: undefined};
    mudarEnvio(envio.chave, deNovo);
    enfileirar([deNovo]);
  };
  const importar = () => void plataforma.escolherVideos({galeria: true}).then(adicionar);
  const soltarArquivos = (arquivosSoltos: File[]) => {
    const escolhidos = arquivosSoltos.map(plataforma.videoArrastado).filter((video): video is VideoEscolhido => Boolean(video));
    if (escolhidos.length < arquivosSoltos.length) setNota({texto: "Só vídeos .mp4, .mov, .mkv ou .webm entram no projeto.", erro: true});
    adicionar(escolhidos);
  };
  const [arquivosPorCima, setArquivosPorCima] = useState(false);

  const inteiro = trechos.length === 1 && trechos[0].inicioMs === 0 && trechos[0].fimMs === undefined;
  const {montado} = projeto.timeline;
  // Os cortes de agora são os do vídeo das legendas: só abrir.
  const jaLegendado =
    Boolean(projeto.video) && (inteiro ? trechos[0].video === projeto.video : montado?.video === projeto.video && montado.dosTrechos === assinaturaDosTrechos(trechos));
  // Já há legendas de outros cortes: gerar de novo troca as legendas.
  const trocaAsLegendas = Boolean(projeto.video) && !jaLegendado;

  const [etapa, setEtapa] = useState<string>();
  // Acompanha a montagem; pronta, abre as legendas do montado e pede a transcrição.
  const acompanhar = async (tarefa: Montagem | {estado: "nenhuma"}) => {
    let atual = tarefa;
    while (atual.estado === "andamento" && naTela.current) {
      setEtapa(atual.etapa ?? "Montando o vídeo...");
      await new Promise((resolve) => window.setTimeout(resolve, PERGUNTAR_DE_NOVO_MS));
      atual = await api.montagem(id);
    }
    setEtapa(undefined);
    if (!naTela.current) return;
    if (atual.estado === "falhou") throw new Error(atual.mensagem ?? "Não foi possível montar o vídeo.");
    if (atual.estado === "pronta" && atual.montado) {
      onLegendar(atual.montado);
      void e.transcreverNovo(atual.montado);
    }
  };
  // Voltou para a tela com uma montagem em curso: retoma o acompanhamento.
  useEffect(() => {
    void api
      .montagem(id)
      .then((tarefa) => {
        if (tarefa.estado !== "andamento") return;
        setOcupado(true);
        return acompanhar(tarefa).finally(() => setOcupado(false));
      })
      .catch(mostrarErro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // "Gerar legendas": monta o vídeo dos trechos. "Pular" (um vídeo inteiro): legenda o próprio vídeo.
  const gerar = async () => {
    if (trocaAsLegendas && !window.confirm(`${AVISO_DE_NOVOS_CORTES}\n\nGerar as legendas de novo?`)) return;
    setOcupado(true);
    setNota(undefined);
    try {
      await t.salvarAgora();
      if (inteiro) {
        const {video} = await api.legendarSemMontar(id, trechos[0].video);
        const jaTemLegendas = Boolean(await api.projeto(video));
        onLegendar(video);
        if (!jaTemLegendas) void e.transcreverNovo(video);
      } else {
        await acompanhar(await api.montar(id));
      }
    } catch (error) {
      mostrarErro(error);
    } finally {
      setOcupado(false);
    }
  };
  const apagar = async () => {
    if (!window.confirm(`Apagar o projeto "${projeto.nome}"?\n\nOs vídeos dele também são apagados.`)) return;
    setOcupado(true);
    try {
      await api.apagarProjeto(id);
      onApagado();
    } catch (error) {
      mostrarErro(error);
      setOcupado(false);
    }
  };

  const travado = ocupado || e.ocupado;
  const [folhaAberta, setFolhaAberta] = useState(false);
  const midia = (
    <Midia
      arquivos={arquivos}
      envios={envios}
      usados={usados}
      infos={infos}
      catalogo={e.catalogo}
      celular={celular}
      travado={travado}
      aviso={trocaAsLegendas ? AVISO_DE_NOVOS_CORTES : undefined}
      onImportar={importar}
      onAdicionar={(nome) => {
        inserir(nome);
        setFolhaAberta(false);
      }}
      onTentarDeNovo={tentarDeNovo}
      onApagar={() => void apagar()}
    />
  );
  return (
    <div className={`ec${celular ? " ec-celular" : ""}`}>
      {/* Leitores sempre no mesmo lugar e na mesma ordem (a da timeline muda ao arrastar):
          recriados, recomeçariam sem a duração, a capa e a prévia. */}
      {[...arquivos].sort().map((nome) => (
        <LerVideo key={nome} nome={nome} onInfo={aoInfo} />
      ))}
      <header className="ec-topo">
        <button type="button" className="ec-voltar" aria-label="Voltar para os projetos" onClick={onVoltar}>
          ‹
        </button>
        <h1>{projeto.nome}</h1>
        <span className="ec-salvo">{TEXTO_DO_SALVAMENTO[t.salvamento]}</span>
        {trechos.length > 0 ? (
          <button
            type="button"
            className="bt primario ec-gerar"
            disabled={travado}
            onClick={() => (jaLegendado ? onLegendar(projeto.video!) : void gerar())}
          >
            {etapa ?? (jaLegendado ? "Abrir legendas" : inteiro ? "Pular e legendar" : "Gerar legendas")}
          </button>
        ) : null}
      </header>

      {celular ? null : (
        <aside
          className={`ec-midia${arquivosPorCima ? " ec-midia-alvo" : ""}`}
          aria-label="Mídia do projeto"
          onDragOver={(event) => {
            if (!travado && event.dataTransfer.types.includes("Files")) {
              event.preventDefault();
              setArquivosPorCima(true);
            }
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setArquivosPorCima(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setArquivosPorCima(false);
            if (!travado) soltarArquivos([...event.dataTransfer.files]);
          }}
        >
          <h2 className="ec-titulo">
            Mídia <span>{arquivos.length === 1 ? "1 arquivo" : `${arquivos.length} arquivos`}</span>
          </h2>
          {midia}
        </aside>
      )}

      <EditorDaTimeline
        t={t}
        catalogo={e.catalogo}
        infos={infos}
        ondas={ondas}
        celular={celular}
        travado={travado}
        removendoPausas={removendoPausas}
        onRemoverPausas={() => void removerAsPausas()}
        onSoltarVideo={inserir}
        onSoltarArquivos={soltarArquivos}
        onAbrirMidia={() => setFolhaAberta(true)}
      />

      {celular ? (
        <>
          <div className={`ec-fundo${folhaAberta ? " ec-aberta" : ""}`} onClick={() => setFolhaAberta(false)} />
          <div className={`ec-folha${folhaAberta ? " ec-aberta" : ""}`} role="dialog" aria-label="Adicionar à timeline" aria-hidden={!folhaAberta}>
            <h2 className="ec-titulo">
              Adicionar à timeline
              <button type="button" className="ec-fechar" aria-label="Fechar" onClick={() => setFolhaAberta(false)}>
                ✕
              </button>
            </h2>
            {midia}
          </div>
        </>
      ) : null}

      {nota ? (
        <div className={`ec-nota${nota.erro ? " ec-nota-erro" : ""}`} role={nota.erro ? "alert" : "status"}>
          {nota.texto}
          {nota.erro ? (
            <button type="button" className="ec-fechar" aria-label="Fechar o aviso" onClick={() => setNota(undefined)}>
              ✕
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

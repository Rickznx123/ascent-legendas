// Projetos (PLANO-CORTES.md, Blocos 1 a 4), no computador e no celular: a lista dos
// projetos com "Novo projeto" e o editor de cortes (os vídeos do projeto na timeline;
// "Gerar legendas" monta o vídeo dos cortes e transcreve só ele; com um vídeo inteiro,
// "Pular" legenda o próprio vídeo, sem montar).
// Só com login (os projetos ficam no Supabase); no modo local, o Início de sempre.
import {useEffect, useRef, useState} from "react";
import {api, tituloDoVideo} from "./api";
import type {Montagem, ProjetoComTimeline, ResumoDeProjeto} from "./api";
import {Cartao} from "./celular/Inicio";
import {plataforma} from "./plataforma";
import type {VideoEscolhido} from "./plataforma";
import {Timeline, useTimeline} from "./Timeline";
import {comTentativas} from "./tentativas";
import {assinaturaDosTrechos, novoId} from "./trechos";
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
  return (
    <>
      <NovoProjeto ocupado={e.ocupado} onCriado={(id) => onAbrir({id})} />
      <div className="titulo">Seus projetos</div>
      {erro ? <p className="login-erro" role="alert">{erro}</p> : null}
      {lista && lista.projetos.length + lista.soltos.length === 0 ? <p className="vazio">Nenhum projeto ainda. Toque em Novo projeto.</p> : null}
      <div className="cel-videos">
        {lista?.projetos.map((p) => (
          <Cartao
            key={p.id}
            nome={p.capa ?? ""}
            titulo={p.nome}
            situacao={`${p.etapa === "legendado" ? "Legendado" : "Em edição"} · ${quantosVideos(p.videos)} · ${dataCurta(p.atualizadoEm)}`}
            atual={false}
            ocupado={e.ocupado}
            onAbrir={() => onAbrir(p.video ? {video: p.video, id: p.id} : {id: p.id})}
          />
        ))}
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

// O estado de cada vídeo da fila: "Na fila", a barra de progresso, "Enviado" ou a falha.
const ListaDeEnvios: React.FC<{envios: Envio[]; onTentarDeNovo: (envio: Envio) => void}> = ({envios, onTentarDeNovo}) =>
  envios.length === 0 ? null : (
    <ul className="envios" aria-label="Vídeos sendo enviados">
      {envios.map((envio) => (
        <li key={envio.chave} className={`envio envio-${envio.estado}`} role={envio.estado === "falhou" ? "alert" : undefined}>
          <span className="envio-nome">{envio.escolhido.nome}</span>
          {envio.estado === "fila" ? <span className="suave">Na fila</span> : null}
          {envio.estado === "enviando" ? (
            <span className="envio-andamento">
              <progress max={1} value={envio.fracao ?? 0} />
              <span className="suave">{Math.round((envio.fracao ?? 0) * 100)}%</span>
            </span>
          ) : null}
          {envio.estado === "enviado" ? <span className="envio-ok">Enviado</span> : null}
          {envio.estado === "falhou" ? (
            <>
              <span className="envio-erro">Falhou: {envio.mensagem}</span>
              <button type="button" className="bt" onClick={() => onTentarDeNovo(envio)}>
                Tentar de novo
              </button>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );

type PropsDosCortes ={e: Editor; id: string; onLegendar: (video: string) => void; onApagado: () => void};

// Os cortes de um projeto: a mídia (vários vídeos de uma vez), a timeline e, com um
// vídeo inteiro sem cortes, "Legendar este vídeo" (o fluxo de hoje, sem montar nada).
export const EditorDeCortes: React.FC<PropsDosCortes> = (props) => {
  const [projeto, setProjeto] = useState<ProjetoComTimeline>();
  const [erro, setErro] = useState<string>();
  useEffect(() => {
    api
      .projetoComTimeline(props.id)
      .then(setProjeto)
      .catch((error: unknown) => setErro(error instanceof Error ? error.message : String(error)));
  }, [props.id]);
  if (erro) return <p className="login-erro" role="alert">{erro}</p>;
  return projeto ? <CortesDoProjeto key={projeto.id} {...props} projeto={projeto} /> : <p className="suave">Abrindo o projeto…</p>;
};

const CortesDoProjeto: React.FC<PropsDosCortes & {projeto: ProjetoComTimeline}> = ({e, id, projeto, onLegendar, onApagado}) => {
  const [erro, setErro] = useState<string>();
  const [ocupado, setOcupado] = useState(false);
  const mostrarErro = (error: unknown) => setErro(error instanceof Error ? error.message : String(error));
  const t = useTimeline(id, projeto.timeline.trechos);
  const trechos = t.lista;

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

  // Vários vídeos (escolhidos ou arrastados): numa fila, enviados um por vez na ordem
  // (mais vídeos escolhidos no meio entram no fim da fila), cada um com o seu estado na
  // tela desde que é escolhido. Cada um entra no fim da timeline assim que chega. Falha
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
  const [arrastando, setArrastando] = useState(false);
  const soltar = (event: React.DragEvent) => {
    event.preventDefault();
    setArrastando(false);
    if (travado) return;
    const arquivos = [...event.dataTransfer.files];
    const escolhidos = arquivos.map(plataforma.videoArrastado).filter((video): video is VideoEscolhido => Boolean(video));
    if (escolhidos.length < arquivos.length) setErro("Só vídeos .mp4, .mov, .mkv ou .webm entram no projeto.");
    adicionar(escolhidos);
  };
  const inteiro = trechos.length === 1 && trechos[0].inicioMs === 0 && trechos[0].fimMs === undefined;
  const {montado} = projeto.timeline;
  // Os cortes de agora são os do vídeo das legendas: só abrir.
  const pronto = Boolean(projeto.video) && (inteiro ? trechos[0].video === projeto.video : montado?.video === projeto.video && montado.dosTrechos === assinaturaDosTrechos(trechos));
  // Já há legendas de outros cortes: gerar de novo troca as legendas.
  const trocaAsLegendas = Boolean(projeto.video) && !pronto;

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
    setErro(undefined);
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
  return (
    <>
      {erro ? <p className="login-erro" role="alert">{erro}</p> : null}
      {/* Mídia: escolher vários vídeos de uma vez ou, no computador, arrastar para cá. */}
      <section
        className={`midia${arrastando ? " midia-arrastando" : ""}`}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            setArrastando(true);
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setArrastando(false);
        }}
        onDrop={soltar}
      >
        <div className="titulo">Mídia</div>
        <button
          type="button"
          className="bt primario cel-cheio"
          disabled={travado}
          onClick={() => void plataforma.escolherVideos({galeria: true}).then(adicionar)}
        >
          ＋ Adicionar vídeos
        </button>
        <p className="suave midia-dica">Dá para escolher vários de uma vez. No computador, também dá para arrastar os vídeos para cá.</p>
        <ListaDeEnvios envios={envios} onTentarDeNovo={tentarDeNovo} />
        {trechos.length === 0 && envios.length === 0 ? <p className="vazio">Nenhum vídeo no projeto ainda.</p> : null}
      </section>
      <Timeline t={t} catalogo={e.catalogo} travado={travado} />
      {pronto ? (
        <button type="button" className="bt primario cel-cheio cortes-legendar" disabled={travado} onClick={() => onLegendar(projeto.video!)}>
          Abrir as legendas
        </button>
      ) : trechos.length > 0 ? (
        <button type="button" className="bt primario cel-cheio cortes-legendar" disabled={travado} onClick={() => void gerar()}>
          {etapa ?? (inteiro ? "Pular os cortes e legendar" : "Gerar legendas")}
        </button>
      ) : null}
      {trocaAsLegendas ? <p className="suave">{AVISO_DE_NOVOS_CORTES}</p> : null}
      <button type="button" className="bt cel-cheio cortes-apagar" disabled={travado} onClick={() => void apagar()}>
        Apagar projeto
      </button>
    </>
  );
};

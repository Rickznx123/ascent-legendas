// Projetos (PLANO-CORTES.md, Blocos 1 e 2), no computador e no celular: a lista dos
// projetos com "Novo projeto" e o editor de cortes (os vídeos do projeto na timeline;
// com um vídeo inteiro, sem cortes, "Legendar este vídeo" abre as legendas dele).
// Só com login (os projetos ficam no Supabase); no modo local, o Início de sempre.
import {useEffect, useState} from "react";
import {api, tituloDoVideo} from "./api";
import type {ProjetoComTimeline, ResumoDeProjeto} from "./api";
import {Cartao} from "./celular/Inicio";
import {plataforma} from "./plataforma";
import type {VideoEscolhido} from "./plataforma";
import {Timeline, useTimeline} from "./Timeline";
import {novoId} from "./trechos";
import type {Editor} from "./useEditor";

// Abrir: um projeto com o vídeo das legendas já escolhido (ou um vídeo antigo, sem
// projeto) vai para as legendas; um projeto ainda na timeline, para os cortes.
export type Abrir = (alvo: {video: string} | {id: string}) => void;

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
            onAbrir={() => onAbrir(p.video ? {video: p.video} : {id: p.id})}
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

type PropsDosCortes = {e: Editor; id: string; onLegendar: (video: string) => void; onApagado: () => void};

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

  // Vários vídeos (escolhidos ou arrastados): enviados um por vez, na ordem, e cada um
  // entra no fim da timeline assim que chega (um envio que falha não perde os outros).
  const adicionar = async (escolhidos: VideoEscolhido[]) => {
    for (const escolhido of escolhidos) {
      const video = await e.importarVideo(escolhido);
      if (video) t.mudar((lista) => [...lista, {id: novoId(), video, inicioMs: 0}]);
    }
  };
  const [arrastando, setArrastando] = useState(false);
  const soltar = (event: React.DragEvent) => {
    event.preventDefault();
    setArrastando(false);
    if (travado) return;
    const arquivos = [...event.dataTransfer.files];
    const escolhidos = arquivos.map(plataforma.videoArrastado).filter((video): video is VideoEscolhido => Boolean(video));
    if (escolhidos.length < arquivos.length) setErro("Só vídeos .mp4, .mov, .mkv ou .webm entram no projeto.");
    void adicionar(escolhidos);
  };
  const legendar = async () => {
    setOcupado(true);
    try {
      await t.salvarAgora();
      onLegendar((await api.legendarSemMontar(id, trechos[0].video)).video);
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
  const inteiro = trechos.length === 1 && trechos[0].inicioMs === 0 && trechos[0].fimMs === undefined;
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
        {trechos.length === 0 ? <p className="vazio">Nenhum vídeo no projeto ainda.</p> : null}
      </section>
      <Timeline t={t} catalogo={e.catalogo} travado={travado} />
      {inteiro ? (
        <button type="button" className="bt primario cel-cheio cortes-legendar" disabled={travado} onClick={() => void legendar()}>
          Legendar este vídeo
        </button>
      ) : trechos.length > 0 ? (
        <p className="suave">Por enquanto, dá para legendar um vídeo inteiro, sem cortes. Gerar as legendas do vídeo cortado vem na próxima versão.</p>
      ) : null}
      <button type="button" className="bt cel-cheio cortes-apagar" disabled={travado} onClick={() => void apagar()}>
        Apagar projeto
      </button>
    </>
  );
};

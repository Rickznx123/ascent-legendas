// Projetos (PLANO-CORTES.md, Bloco 1), no computador e no celular: a lista dos
// projetos com "Novo projeto" e o editor de cortes, que por enquanto só junta os
// vídeos do projeto e, com um vídeo só, abre as legendas dele ("Legendar este vídeo").
// Só com login (os projetos ficam no Supabase); no modo local, o Início de sempre.
import {useEffect, useState} from "react";
import {api, tituloDoVideo} from "./api";
import type {ProjetoComTimeline, ResumoDeProjeto} from "./api";
import {Cartao} from "./celular/Inicio";
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

// Os cortes de um projeto. Bloco 1: os vídeos do projeto, "＋ Adicionar vídeo" e,
// com um vídeo só, "Legendar este vídeo" (o fluxo de hoje, sem montar nada).
export const EditorDeCortes: React.FC<{e: Editor; id: string; onLegendar: (video: string) => void; onApagado: () => void}> = ({
  e,
  id,
  onLegendar,
  onApagado,
}) => {
  const [projeto, setProjeto] = useState<ProjetoComTimeline>();
  const [erro, setErro] = useState<string>();
  const [ocupado, setOcupado] = useState(false);
  const mostrarErro = (error: unknown) => setErro(error instanceof Error ? error.message : String(error));
  useEffect(() => {
    api.projetoComTimeline(id).then(setProjeto).catch(mostrarErro);
  }, [id]);

  const trechos = projeto?.timeline.trechos ?? [];
  const adicionar = async () => {
    if (!projeto) return;
    const video = await e.escolherEImportar({galeria: true});
    if (!video) return;
    const timeline = {trechos: [...trechos, {id: Math.random().toString(36).slice(2, 10), video, inicioMs: 0}]};
    try {
      await api.salvarProjetoComTimeline(id, {timeline});
      setProjeto({...projeto, timeline});
    } catch (error) {
      mostrarErro(error);
    }
  };
  const legendar = async () => {
    setOcupado(true);
    try {
      onLegendar((await api.legendarSemMontar(id, trechos[0].video)).video);
    } catch (error) {
      mostrarErro(error);
    } finally {
      setOcupado(false);
    }
  };
  const apagar = async () => {
    if (!projeto || !window.confirm(`Apagar o projeto "${projeto.nome}"?\n\nOs vídeos dele também são apagados.`)) return;
    setOcupado(true);
    try {
      await api.apagarProjeto(id);
      onApagado();
    } catch (error) {
      mostrarErro(error);
      setOcupado(false);
    }
  };

  const travado = ocupado || e.ocupado || !projeto;
  return (
    <>
      {erro ? <p className="login-erro" role="alert">{erro}</p> : null}
      <button type="button" className="bt primario cel-cheio" disabled={travado} onClick={() => void adicionar()}>
        ＋ Adicionar vídeo
      </button>
      <div className="titulo">Vídeos do projeto</div>
      {projeto && trechos.length === 0 ? <p className="vazio">Adicione o primeiro vídeo.</p> : null}
      <div className="cel-videos">
        {trechos.map((t, i) => (
          <Cartao key={t.id} nome={t.video} titulo={`${i + 1}. ${tituloDoVideo(e.catalogo, t.video)}`} situacao="" atual={false} ocupado onAbrir={() => undefined} />
        ))}
      </div>
      {trechos.length === 1 ? (
        <button type="button" className="bt primario cel-cheio cortes-legendar" disabled={travado} onClick={() => void legendar()}>
          Legendar este vídeo
        </button>
      ) : trechos.length > 1 ? (
        <p className="suave">Por enquanto, dá para legendar um vídeo por projeto. Juntar vários vídeos vem na próxima versão.</p>
      ) : null}
      <button type="button" className="bt cel-cheio cortes-apagar" disabled={travado} onClick={() => void apagar()}>
        Apagar projeto
      </button>
    </>
  );
};

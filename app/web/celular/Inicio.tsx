// Tela inicial do celular: importar um vídeo e a lista de vídeos em cartões.
import {useEffect, useRef, useState} from "react";
import {api} from "../api";
import {relogio} from "../quadro";
import type {Editor} from "../useEditor";
import {Andamento} from "./Andamento";
import {CONFIG_CELULAR} from "./plano";
import type {UsoDoPlano} from "./plano";

// Quadro de minutos do plano (desligado em CONFIG_CELULAR até existir o login).
const QuadroDoPlano: React.FC<{uso?: UsoDoPlano}> = ({uso}) =>
  uso ? (
    <div className="cel-uso">
      <b>
        {uso.minutosUsados} de {uso.minutosDoPlano} min usados
      </b>
      <small>
        Renova em {uso.renovaEmDias} dias · {uso.nomeDoPlano}
      </small>
      <div className="cel-medidor">
        <i style={{width: `${Math.min(100, (uso.minutosUsados / Math.max(1, uso.minutosDoPlano)) * 100)}%`}} />
      </div>
    </div>
  ) : (
    <div className="cel-uso">
      <b>Plano</b>
      <small>Entre na sua conta para ver os minutos do plano.</small>
    </div>
  );

// Um vídeo da lista: a capa e a duração só carregam quando o cartão aparece na tela.
const Cartao: React.FC<{nome: string; situacao: string; atual: boolean; ocupado: boolean; onAbrir: () => void}> = ({
  nome,
  situacao,
  atual,
  ocupado,
  onAbrir,
}) => {
  const ref = useRef<HTMLButtonElement>(null);
  const [visivel, setVisivel] = useState(false);
  const [duracaoMs, setDuracaoMs] = useState<number>();
  const [semCapa, setSemCapa] = useState(false);

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) {
      return;
    }
    const observador = new IntersectionObserver(([entrada]) => {
      if (entrada.isIntersecting) {
        setVisivel(true);
        observador.disconnect();
      }
    }, {rootMargin: "120px"});
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    if (visivel) {
      api
        .videoInfo(nome)
        .then((info) => setDuracaoMs((info.durationInFrames / info.fps) * 1000))
        .catch(() => undefined);
    }
  }, [visivel, nome]);

  return (
    <button ref={ref} type="button" className="cel-cartao" aria-current={atual ? "true" : undefined} disabled={ocupado} onClick={onAbrir}>
      <span className="cel-capa">
        {visivel && !semCapa ? (
          <video
            src={`${api.videoUrl(nome)}#t=0.5`}
            preload="metadata"
            muted
            playsInline
            disablePictureInPicture
            aria-hidden="true"
            onError={() => setSemCapa(true)}
          />
        ) : null}
        {duracaoMs !== undefined ? <em>{relogio(duracaoMs)}</em> : null}
      </span>
      <span className="cel-cartao-texto">
        <b>{nome.replace(/\.[^.]+$/u, "")}</b>
        <small>{situacao}</small>
      </span>
    </button>
  );
};

export const Inicio: React.FC<{e: Editor; onAbrir: (nome: string) => void}> = ({e, onAbrir}) => {
  const situacao = (nome: string) =>
    e.projetoSalvo?.video === nome ? `Em edição · ${e.projetoSalvo.blocos} blocos` : "Não transcrito";
  const importar = async () => {
    const nome = await e.escolherEImportar({galeria: true});
    if (nome) {
      onAbrir(nome);
    }
  };
  return (
    <div className="cel-tela">
      <header className="cel-barra">
        <span className="cel-nome cel-marca">Ascent Legendas</span>
      </header>
      <Andamento tarefa={e.tarefa} />
      <div className="cel-rolagem">
        {CONFIG_CELULAR.mostrarPlano ? <QuadroDoPlano /> : null}
        <button type="button" className="bt primario cel-cheio" disabled={e.ocupado} onClick={() => void importar()}>
          ＋ Importar vídeo
        </button>
        <div className="titulo">Seus vídeos</div>
        {e.catalogo.videos.length === 0 ? <p className="vazio">Nenhum vídeo ainda. Toque em Importar vídeo.</p> : null}
        <div className="cel-videos">
          {e.catalogo.videos.map((nome) => (
            <Cartao
              key={nome}
              nome={nome}
              situacao={situacao(nome)}
              atual={nome === e.video}
              ocupado={e.ocupado}
              onAbrir={() => onAbrir(nome)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

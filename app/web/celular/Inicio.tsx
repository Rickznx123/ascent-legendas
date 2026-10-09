// Tela inicial do celular: importar um vídeo e a lista de vídeos em cartões.
import {useEffect, useRef, useState} from "react";
import {api, tituloDoVideo} from "../api";
import {usePreviaLeve} from "../previa-leve";
import {relogio} from "../quadro";
import type {Editor} from "../useEditor";
import {Andamento} from "./Andamento";
import {useConta} from "../conta";
import {JanelaTrocarSenha} from "../Senha";
import {JanelaAssinar, JanelaDaAcao, ROTULO_DA_ACAO, acaoDaAssinatura, avisoDaAssinatura, menorPreco, podeSubirDePlano} from "../Assinatura";
import type {AcaoDaAssinatura} from "../Assinatura";
import type {ResumoDaAssinatura, UsoDoPlano} from "../api";
import {CONFIG_CELULAR, nomeDoPlano, resumoDasTranscricoes, resumoDoUso} from "./plano";

// Quadro do plano: usados e restantes (o servidor manda o uso; aqui só se mostra).
// Com a assinatura: o aviso (ativa, cancelada, cobrança que falhou) e, no grátis, "Assinar".
const QuadroDoPlano: React.FC<{uso: UsoDoPlano; assinatura?: ResumoDaAssinatura}> = ({uso, assinatura}) => {
  const {titulo, detalhe, fracao} = resumoDoUso(uso);
  const transcricoes = resumoDasTranscricoes(uso);
  const aviso = avisoDaAssinatura(assinatura);
  const [assinando, setAssinando] = useState(false);
  return (
    <div className="cel-uso">
      <b>{titulo}</b>
      <small>{detalhe}</small>
      <div className="cel-medidor">
        <i style={{width: `${Math.min(100, fracao * 100)}%`}} />
      </div>
      {transcricoes ? <small className="cel-uso-transcricoes">{transcricoes}</small> : null}
      {aviso ? <small className={assinatura?.situacao === "falhou" ? "assinatura-aviso" : "cel-uso-transcricoes"}>{aviso}</small> : null}
      {acaoDaAssinatura(assinatura) === "assinar" ? (
        <button type="button" className="bt primario cel-cheio cel-uso-assinar" onClick={() => setAssinando(true)}>
          Assinar · a partir de {menorPreco(assinatura).toLocaleString("pt-BR", {style: "currency", currency: "BRL"})} por mês
        </button>
      ) : null}
      {/* Minutos acabando (menos de 10%) ou acabados: subir de plano. */}
      {uso.plano === "assinante" && uso.segundosUsados >= uso.segundosDoPlano * 0.9 && podeSubirDePlano(assinatura) ? (
        <button type="button" className="bt primario cel-cheio cel-uso-assinar" onClick={() => setAssinando(true)}>
          Subir de plano
        </button>
      ) : null}
      {assinando ? <JanelaAssinar onFechar={() => setAssinando(false)} /> : null}
    </div>
  );
};

// Um vídeo da lista: a capa e a duração só carregam quando o cartão aparece na tela.
// Com a capa em JPG ainda sendo feita, o cartão diz "Preparando…" e troca sozinho.
const Cartao: React.FC<{nome: string; titulo: string; situacao: string; atual: boolean; ocupado: boolean; onAbrir: () => void}> = ({
  nome,
  titulo,
  situacao,
  atual,
  ocupado,
  onAbrir,
}) => {
  const ref = useRef<HTMLButtonElement>(null);
  const [visivel, setVisivel] = useState(false);
  const [duracaoMs, setDuracaoMs] = useState<number>();
  const [semCapa, setSemCapa] = useState(false);
  const previa = usePreviaLeve(nome, visivel);
  const capa = previa.estado && "capa" in previa.estado ? previa.estado.capa : undefined;

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
        {/* Vídeo enviado ao S3: a capa em JPG gerada com a prévia leve. Vídeo só no
            disco (ou sem login): um quadro do próprio vídeo, como antes. */}
        {capa ? (
          <img src={capa} alt="" aria-hidden="true" />
        ) : previa.estado?.estado === "local" && !semCapa ? (
          <video
            src={`${api.videoUrl(nome)}#t=0.5`}
            preload="metadata"
            muted
            playsInline
            disablePictureInPicture
            aria-hidden="true"
            onError={() => setSemCapa(true)}
          />
        ) : previa.estado?.estado === "preparando" ? (
          <small className="cel-capa-preparando">Preparando…</small>
        ) : null}
        {duracaoMs !== undefined ? <em>{relogio(duracaoMs)}</em> : null}
      </span>
      <span className="cel-cartao-texto">
        <b>{titulo}</b>
        <small>{situacao}</small>
      </span>
    </button>
  );
};

// Menu ☰ da barra: abre por cima da tela e fecha ao tocar fora ou escolher um item.
const Menu: React.FC<{ocupado: boolean; onImportar: () => void}> = ({ocupado, onImportar}) => {
  const {conta, sair} = useConta();
  const [aberto, setAberto] = useState(false);
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [janelaDaAssinatura, setJanelaDaAssinatura] = useState<AcaoDaAssinatura>();
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) {
      return;
    }
    const aoTocar = (event: PointerEvent) => {
      if (event.target instanceof Node && !raiz.current?.contains(event.target)) {
        setAberto(false);
      }
    };
    const aoTeclar = (event: KeyboardEvent) => event.key === "Escape" && setAberto(false);
    document.addEventListener("pointerdown", aoTocar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("pointerdown", aoTocar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);
  return (
    <div ref={raiz} className="cel-menu-raiz">
      <button
        type="button"
        className="cel-ic"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto(!aberto)}
      >
        ☰
      </button>
      {aberto ? (
        <div className="cel-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            disabled={ocupado}
            onClick={() => {
              setAberto(false);
              onImportar();
            }}
          >
            Importar vídeo
          </button>
          {/* Conta e plano: o e-mail e o plano do perfil. Sem login (modo local), não há conta. */}
          {conta ? (
            <>
              <div className="cel-menu-conta" role="none">
                <span>Conta e plano</span>
                <b>{conta.email}</b>
                <small>Plano {nomeDoPlano(conta)}</small>
              </div>
              {acaoDaAssinatura(conta.assinatura) ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAberto(false);
                    setJanelaDaAssinatura(acaoDaAssinatura(conta.assinatura));
                  }}
                >
                  {ROTULO_DA_ACAO[acaoDaAssinatura(conta.assinatura)!]}
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAberto(false);
                  setTrocandoSenha(true);
                }}
              >
                Trocar senha
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={ocupado}
                onClick={() => {
                  setAberto(false);
                  sair();
                }}
              >
                Sair
              </button>
            </>
          ) : (
            <button type="button" role="menuitem" disabled>
              Conta e plano
              <small>modo local</small>
            </button>
          )}
        </div>
      ) : null}
      {trocandoSenha && conta ? <JanelaTrocarSenha email={conta.email} onFechar={() => setTrocandoSenha(false)} /> : null}
      <JanelaDaAcao acao={janelaDaAssinatura} onFechar={() => setJanelaDaAssinatura(undefined)} />
    </div>
  );
};

export const Inicio: React.FC<{e: Editor; onAbrir: (nome: string) => void}> = ({e, onAbrir}) => {
  const {conta} = useConta();
  // O projeto aberto tem o número de blocos mais recente; os outros vêm da lista do
  // servidor (com login, os projetos da conta).
  const situacao = (nome: string) => {
    const projeto = e.projetoSalvo?.video === nome ? e.projetoSalvo : e.catalogo.projetos?.find((p) => p.video === nome);
    return projeto ? `Em edição · ${projeto.blocos} blocos` : "Não transcrito";
  };
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
        <Menu ocupado={e.ocupado} onImportar={() => void importar()} />
      </header>
      <Andamento tarefa={e.tarefa} />
      <div className="cel-rolagem">
        {CONFIG_CELULAR.mostrarPlano && conta?.uso ? <QuadroDoPlano uso={conta.uso} assinatura={conta.assinatura} /> : null}
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
              titulo={tituloDoVideo(e.catalogo, nome)}
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

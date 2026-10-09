// Página de apresentação: o que vê quem abre o app sem sessão (fora do app instalado;
// veja Entrada.tsx). Referência visual: landing-referencia.html. Os botões levam às
// telas que já existem: "Testar grátis", "Assinar com cartão" e "Pagar com Pix" ao
// criar conta; "Entrar" e "Já tenho conta" ao entrar.
// Os vídeos de exemplo ficam em app/web/public/landing/ (hero.mp4, antes.mp4 e
// depois.mp4, e o poster de cada um em .jpg). Enquanto um vídeo não existe, o espaço
// mostra o fundo provisório e a legenda animada da prancha.
import {useEffect, useRef, useState} from "react";
import type {ReactNode} from "react";
import type {PlanosDaApresentacao} from "../servidor/servidor";
import "./apresentacao.css";

// Fontes das amostras de estilo, como na prancha (só esta página carrega).
const FONTES =
  "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@1,700&family=Instrument+Serif:ital@0;1&family=Inter+Tight:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,900&family=Playfair+Display:ital,wght@1,600&family=Urbanist:ital,wght@1,500&display=swap";

// Título e descrição da chamada principal (também em index.html, para quem lê o
// endereço sem rodar a página: buscadores e prévias de link).
export const TITULO_DA_APRESENTACAO = "Ascent Legendas: legenda dinâmica pronta em 1 minuto";

// Legenda de demonstração: alterna linear e destaque, como no app.
type Bloco = {tipo: "linear"; palavras: string[]} | {tipo: "destaque"; cima: string[]; chave: string};
const BLOCOS: Bloco[] = [
  {tipo: "linear", palavras: ["olha", "só", "isso"]},
  {tipo: "destaque", cima: ["sua", "legenda"], chave: "pronta"},
  {tipo: "linear", palavras: ["em", "um", "minuto"]},
  {tipo: "destaque", cima: ["direto", "do"], chave: "celular"},
  {tipo: "linear", palavras: ["sem", "editar", "nada"]},
  {tipo: "destaque", cima: ["é", "só"], chave: "postar"},
];

const semMovimento = (): boolean => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// Bloco atual da demonstração: troca a cada 1,5 s (sem movimento, fica parado no segundo).
const useBlocoDaDemonstracao = (): number => {
  const [atual, setAtual] = useState(() => (semMovimento() ? 1 : 0));
  useEffect(() => {
    if (semMovimento()) return;
    const relogio = window.setInterval(() => setAtual((indice) => indice + 1), 1500);
    return () => window.clearInterval(relogio);
  }, []);
  return atual;
};

const palavra = (texto: string, ordem: number) => (
  <span key={ordem} style={{animationDelay: `${ordem * 0.11}s`}}>
    {texto}
  </span>
);

// key: cada bloco novo remonta as palavras e a animação de entrada recomeça.
const Legenda: React.FC<{passo: number}> = ({passo}) => {
  const bloco = BLOCOS[passo % BLOCOS.length];
  return (
    <div className="ap-palco">
      {bloco.tipo === "linear" ? (
        <div key={passo} className="leg linear">
          {bloco.palavras.map(palavra)}
        </div>
      ) : (
        <div key={passo} className="leg destaque">
          <div className="cima">{bloco.cima.map(palavra)}</div>
          <div className="chave">{palavra(bloco.chave, bloco.cima.length)}</div>
        </div>
      )}
    </div>
  );
};

// Um celular com o vídeo de exemplo /landing/<nome>.mp4. O vídeo só é pedido perto
// da tela; se ele existe, aparece por cima do fundo provisório e a legenda animada
// some (o vídeo já vem legendado). Sem o arquivo, o servidor devolve outra coisa, o
// vídeo dá erro e o espaço continua com o fundo e a legenda da prancha.
const EspacoDeVideo: React.FC<{nome: "hero" | "antes" | "depois"; legenda?: ReactNode; rotulo?: string}> = ({nome, legenda, rotulo}) => {
  const caixa = useRef<HTMLDivElement>(null);
  const [perto, setPerto] = useState(false);
  const [temVideo, setTemVideo] = useState(false);
  useEffect(() => {
    const elemento = caixa.current;
    if (!elemento || typeof IntersectionObserver === "undefined") {
      setPerto(true);
      return;
    }
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          setPerto(true);
          observador.disconnect();
        }
      },
      {rootMargin: "300px 0px"},
    );
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);
  return (
    <div ref={caixa} className={`celular${temVideo ? " com-video" : ""}`} aria-label={rotulo}>
      <div className="video" />
      {perto ? (
        <video
          src={`/landing/${nome}.mp4`}
          poster={`/landing/${nome}.jpg`}
          muted
          loop
          playsInline
          // Sem movimento (prefers-reduced-motion): o vídeo fica parado no poster.
          autoPlay={!semMovimento()}
          preload="metadata"
          aria-hidden="true"
          // Aparece com o primeiro quadro pronto (sem um quadro vazio por cima do fundo);
          // parado (sem movimento), já com os dados do vídeo, no poster.
          onLoadedData={() => setTemVideo(true)}
          onLoadedMetadata={() => {
            if (semMovimento()) setTemVideo(true);
          }}
          onError={() => setTemVideo(false)}
        />
      ) : null}
      {legenda}
    </div>
  );
};

// Cartão de estilo com o clipe /landing/estilos/<nome>.mp4 (npm run landing:estilos).
// O clipe só carrega e toca com o cartão na tela e pausa quando ele sai; sem
// movimento, fica no poster. Sem os arquivos, fica o texto do cartão.
const Amostra: React.FC<{nome: string; className: string; children: ReactNode}> = ({nome, className, children}) => {
  const caixa = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [perto, setPerto] = useState(false);
  const [comClipe, setComClipe] = useState(false);
  const poster = `/landing/estilos/${nome}.jpg`;
  useEffect(() => {
    const elemento = caixa.current;
    if (!elemento || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(([entrada]) => {
      if (entrada.isIntersecting) {
        setPerto(true);
        if (!semMovimento()) video.current?.play().catch(() => undefined);
      } else {
        video.current?.pause();
      }
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [perto]);
  // O poster existe: o clipe (ou só o poster, sem movimento) cobre o texto.
  useEffect(() => {
    if (!perto) return;
    const imagem = new Image();
    imagem.onload = () => setComClipe(true);
    imagem.src = poster;
  }, [perto, poster]);
  return (
    <div ref={caixa} className={`amostra ${className}${comClipe ? " com-clipe" : ""}`}>
      {children}
      {perto ? (
        <video
          ref={video}
          src={`/landing/estilos/${nome}.mp4`}
          poster={poster}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden="true"
          onError={() => setComClipe(false)}
        />
      ) : null}
    </div>
  );
};

const reais = (valor: number): string =>
  `R$ ${valor.toLocaleString("pt-BR", {minimumFractionDigits: Number.isInteger(valor) ? 0 : 2, maximumFractionDigits: 2})}`;

// Link que troca de tela sem recarregar (o endereço de verdade fica no href).
const Ir: React.FC<{href: string; className?: string; ir: () => void; id?: string; children: ReactNode}> = ({href, className, ir, id, children}) => (
  <a
    id={id}
    className={className}
    href={href}
    onClick={(evento) => {
      evento.preventDefault();
      ir();
    }}
  >
    {children}
  </a>
);

export const Apresentacao: React.FC<{
  // Números dos planos, da configuração do servidor (/api/config).
  planos: PlanosDaApresentacao;
  onCriarConta: () => void;
  onEntrar: () => void;
}> = ({planos, onCriarConta, onEntrar}) => {
  const passo = useBlocoDaDemonstracao();
  const ctaDoTopo = useRef<HTMLAnchorElement>(null);
  const [barraVisivel, setBarraVisivel] = useState(false);

  // Fontes das amostras: só quando a página aparece.
  useEffect(() => {
    if (document.querySelector(`link[href="${FONTES}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONTES;
    document.head.appendChild(link);
  }, []);

  // Barra fixa (celular): aparece quando o botão do topo sai da tela.
  useEffect(() => {
    const botao = ctaDoTopo.current;
    if (!botao || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(([entrada]) => setBarraVisivel(!entrada.isIntersecting));
    observador.observe(botao);
    return () => observador.disconnect();
  }, []);

  const {minutosDoAssinante: minutos, diasDoPix: dias, videosNoGratis: videosGratis, precoBRL: preco} = planos;
  const criar = {href: "#criar-conta", ir: onCriarConta};

  return (
    <div className="apresentacao">
      <header className="largura topo">
        <a className="ap-marca" href="/">
          <img className="marca-icone" src="/icones/icone-192.png" alt="" aria-hidden="true" width={34} height={34} />
          Ascent Legendas
        </a>
        <Ir className="entrar" href="#entrar" ir={onEntrar}>
          Entrar
        </Ir>
      </header>

      <main>
        {/* 1. Chamada principal */}
        <section className="largura hero">
          <div>
            <h1>Legenda dinâmica pronta em 1 minuto, direto do celular.</h1>
            <p>Envie o vídeo. O app transcreve, sincroniza com a sua fala e anima cada palavra. Você só baixa e posta.</p>
            <a
              ref={ctaDoTopo}
              className="botao cheio"
              href="#criar-conta"
              onClick={(evento) => {
                evento.preventDefault();
                onCriarConta();
              }}
            >
              Testar grátis
            </a>
            <p className="nota">
              {videosGratis} {videosGratis === 1 ? "vídeo grátis" : "vídeos grátis"}. Não pede cartão.
            </p>
          </div>
          <div className="hero-demo">
            <EspacoDeVideo nome="hero" rotulo="Exemplo de vídeo com legenda dinâmica" legenda={<Legenda passo={passo} />} />
          </div>
        </section>

        {/* 2. Antes e depois */}
        <section className="secao">
          <div className="largura">
            <h2>O mesmo vídeo, antes e depois.</h2>
            <p className="sub">Muita gente assiste sem som. Sem legenda, a sua mensagem não chega.</p>
            <div className="par">
              <figure>
                <EspacoDeVideo nome="antes" />
                <figcaption>
                  <strong>Antes</strong>Vídeo sem legenda.
                </figcaption>
              </figure>
              <figure>
                <EspacoDeVideo nome="depois" legenda={<Legenda passo={passo} />} />
                <figcaption>
                  <strong>Depois</strong>Legenda animada no ritmo da fala.
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* 3. Como funciona */}
        <section className="secao">
          <div className="largura">
            <h2>Como funciona</h2>
            <p className="sub">Três passos, tudo pelo navegador do celular.</p>
            <ol className="passos">
              <li>
                <h3>Envie o vídeo</h3>
                <p>Escolha direto da galeria. O app transcreve e sincroniza cada palavra sozinho.</p>
              </li>
              <li>
                <h3>Escolha o estilo</h3>
                <p>Troque o estilo e as cores e veja a prévia na hora. Errou uma palavra? Corrija com um toque.</p>
              </li>
              <li>
                <h3>Baixe e poste</h3>
                <p>Exporte em vertical (1080 x 1920), pronto para Reels, TikTok e Shorts.</p>
              </li>
            </ol>
          </div>
        </section>

        {/* 4. Estilos */}
        <section className="secao">
          <div className="largura">
            <h2>Estilos de legenda</h2>
            <p className="sub">Escolha um estilo ou deixe o app misturar todos no mesmo vídeo.</p>
            <div className="estilos">
              <article className="estilo">
                <Amostra nome="a" className="am-a">
                  <div className="l1">tem novidade</div>
                  <div className="l2">chegando</div>
                </Amostra>
                <h3>Estilo A</h3>
                <p>Limpo, com destaque em serifa</p>
              </article>
              <article className="estilo">
                <Amostra nome="b" className="am-b">
                  <div className="l1">o segredo</div>
                  <div className="l2">é esse</div>
                </Amostra>
                <h3>Estilo B</h3>
                <p>Criativo, com brilho</p>
              </article>
              <article className="estilo">
                <Amostra nome="c" className="am-c">
                  <div>
                    <span className="tag">Atenção</span>
                  </div>
                  <div className="l1">olha esse</div>
                  <div className="l2">imóvel</div>
                </Amostra>
                <h3>Estilo C</h3>
                <p>Impacto, estilo imobiliário</p>
              </article>
              <article className="estilo">
                <Amostra nome="d" className="am-d">
                  <div className="l1">isso muda</div>
                  <div className="l2">tudo</div>
                </Amostra>
                <h3>Estilo D</h3>
                <p>Minúsculas, leve e pesado</p>
              </article>
              <article className="estilo">
                <Amostra nome="e" className="am-e">
                  <div className="l1">você vai</div>
                  <div className="l2">amar</div>
                  <div className="l3">esse resultado</div>
                </Amostra>
                <h3>Estilo E</h3>
                <p>Três fontes, palavras deslizando</p>
              </article>
              <article className="estilo">
                <Amostra nome="f" className="am-f">
                  <div className="l1">feito para</div>
                  <div className="l2">vender</div>
                </Amostra>
                <h3>Estilo F</h3>
                <p>Editorial</p>
              </article>
              <article className="estilo">
                <Amostra nome="misto" className="am-m">
                  <div className="l1">um pouco</div>
                  <div className="l2">de cada</div>
                  <div className="l3">estilo</div>
                </Amostra>
                <h3>Misto</h3>
                <p>Todos os estilos no mesmo vídeo</p>
              </article>
            </div>
          </div>
        </section>

        {/* 5. Planos */}
        <section className="secao" id="planos">
          <div className="largura">
            <h2>Planos e preços</h2>
            <p className="sub">Comece grátis. Assine quando quiser tirar a marca d'água.</p>
            <div className="planos">
              <div className="plano">
                <h3>Grátis</h3>
                <div className="preco">{reais(0)}</div>
                <ul>
                  <li>
                    {videosGratis} {videosGratis === 1 ? "vídeo" : "vídeos"} para testar
                  </li>
                  <li>Com marca d'água</li>
                </ul>
                <Ir className="botao vazado cheio" {...criar}>
                  Testar grátis
                </Ir>
              </div>
              <div className="plano principal">
                <span className="ap-selo">Mais escolhido</span>
                <h3>Assinatura mensal</h3>
                {preco !== undefined ? (
                  <div className="preco">
                    {reais(preco)} <small>por mês</small>
                  </div>
                ) : null}
                <ul>
                  <li>{minutos} minutos exportados por mês</li>
                  <li>Sem marca d'água</li>
                  <li>Cartão, renova todo mês</li>
                  <li>Cancele quando quiser e use até o fim do período</li>
                </ul>
                <Ir className="botao cheio" {...criar}>
                  Assinar com cartão
                </Ir>
              </div>
              <div className="plano">
                <h3>{dias} dias no Pix</h3>
                {preco !== undefined ? (
                  <div className="preco">
                    {reais(preco)} <small>pagamento único</small>
                  </div>
                ) : null}
                <ul>
                  <li>
                    {minutos} minutos exportados em {dias} dias
                  </li>
                  <li>Sem marca d'água</li>
                  <li>Não renova sozinho</li>
                </ul>
                <Ir className="botao vazado cheio" {...criar}>
                  Pagar com Pix
                </Ir>
              </div>
            </div>
            <p className="pagamento">Pagamento pelo Mercado Pago. Não precisa ter conta lá.</p>
          </div>
        </section>

        {/* 6. Perguntas frequentes */}
        <section className="secao">
          <div className="largura">
            <h2>Perguntas frequentes</h2>
            <div className="faq">
              <details>
                <summary>Preciso instalar alguma coisa?</summary>
                <p>
                  Não. O app abre no navegador do celular ou do computador. Se quiser, você pode adicionar o ícone à tela inicial e usar como um
                  aplicativo.
                </p>
              </details>
              <details>
                <summary>Funciona no iPhone e no Android?</summary>
                <p>Sim, nos dois, e também no computador.</p>
              </details>
              <details>
                <summary>E se a legenda vier com uma palavra errada?</summary>
                <p>Você corrige antes de exportar: toque na legenda para editar o texto, apagar uma palavra ou trocar a palavra em destaque.</p>
              </details>
              <details>
                <summary>O que conta nos {minutos} minutos?</summary>
                <p>Só os vídeos que você exporta. Um vídeo de 1 minuto exportado gasta 1 minuto do plano.</p>
              </details>
              <details>
                <summary>Como cancelo a assinatura?</summary>
                <p>Dentro do app, a qualquer momento. Você continua usando até o fim do período já pago e não é cobrado de novo.</p>
              </details>
              <details>
                <summary>O Pix renova sozinho?</summary>
                <p>Não. Vale por {dias} dias. Depois disso, você paga outro Pix só se quiser continuar.</p>
              </details>
              <details>
                <summary>O teste grátis pede cartão?</summary>
                <p>Não. Você cria a conta com e-mail e senha e já pode fazer o primeiro vídeo, com marca d'água.</p>
              </details>
            </div>
          </div>
        </section>

        {/* Chamada final */}
        <section className="secao final">
          <div className="largura">
            <h2>Faça o primeiro vídeo agora.</h2>
            <Ir className="botao" {...criar}>
              Testar grátis
            </Ir>
          </div>
        </section>
      </main>

      {/* 7. Rodapé */}
      <footer className="rodape">
        <div className="largura">
          <nav aria-label="Rodapé">
            <a href="/termos.html">Termos de uso</a>
            <a href="/privacidade.html">Política de privacidade</a>
            <a href="https://ascentstudio.com.br">Ascent Studio</a>
            <Ir href="#entrar" ir={onEntrar}>
              Já tenho conta
            </Ir>
          </nav>
          <div>Ascent Legendas é um produto da Ascent Studio.</div>
        </div>
      </footer>

      <div className={`ap-barra${barraVisivel ? " visivel" : ""}`}>
        <Ir className="botao cheio" {...criar}>
          Testar grátis
        </Ir>
      </div>
    </div>
  );
};

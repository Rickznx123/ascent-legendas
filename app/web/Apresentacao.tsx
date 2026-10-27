// Página de apresentação: o que vê quem abre o app sem sessão (fora do app instalado;
// veja Entrada.tsx). Especificação: landing-v2-referencia.html (textos, cores, fontes e
// as animações dos estilos, em CSS puro: apresentacao.css). "Testar grátis" leva ao
// cadastro; "Assinar <plano>" também, e depois do login abre o pagamento daquele plano
// (com o cupom do campo, se valeu). Preços, minutos e o número de vídeos exportados vêm
// do servidor (/api/config). Os cliques vão para a tabela de eventos do funil pelo id
// do visitante (ainda sem conta).
// Sem material ainda ([TROCAR] na prancha): o hero fica com o celular animado e o botão
// do WhatsApp não aparece.
import {useEffect, useRef, useState} from "react";
import type {ReactNode} from "react";
import type {PlanosDaApresentacao} from "../servidor/servidor";
import type {Nivel} from "../servidor/planos";
import {transcricoesPorDia} from "../servidor/cota";
import {valorComDesconto} from "../servidor/cupons";
import type {VistaDoCupom} from "./api";
import "./apresentacao.css";

const FONTES =
  "https://fonts.googleapis.com/css2?family=Inter+Tight:ital,wght@0,300;0,400;0,600;0,800;0,900;1,800;1,900&family=Instrument+Serif:ital@1&family=Playfair+Display:ital,wght@1,800;1,900&family=Urbanist:ital,wght@1,700&family=EB+Garamond:ital,wght@1,700&family=Montserrat:ital,wght@0,800;1,900&display=swap";

// Título e descrição da chamada principal (também em index.html, para quem lê o
// endereço sem rodar a página: buscadores e prévias de link).
export const TITULO_DA_APRESENTACAO = "Ascent Legendas: legenda que prende até o fim, pronta em 1 minuto";

// Id do visitante (sem conta ainda), guardado neste navegador, para os eventos do funil.
const visitante = (): string => {
  try {
    const guardado = localStorage.getItem("visitante");
    if (guardado) return guardado;
    const novo = crypto.randomUUID();
    localStorage.setItem("visitante", novo);
    return novo;
  } catch {
    return crypto.randomUUID();
  }
};
const evento = (nome: "clicou_testar_gratis" | "clicou_assinar", dados: Record<string, string>) => {
  void fetch("/api/eventos/visitante", {
    method: "POST",
    keepalive: true,
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({nome, visitante: visitante(), dados}),
  }).catch(() => undefined);
};

const reais = (valor: number): string =>
  `R$ ${valor.toLocaleString("pt-BR", {minimumFractionDigits: Number.isInteger(valor) ? 0 : 2, maximumFractionDigits: 2})}`;
const porMinuto = (valor: number, minutos: number) => reais(Math.round((valor / minutos) * 100) / 100);

// Uma palavra (ou trecho) animada: classes da prancha (w, a animação, o atraso, o estilo).
const W: React.FC<{c: string; children: ReactNode}> = ({c, children}) => <span className={`w ${c}`}>{children}</span>;
const Linha: React.FC<{children: ReactNode}> = ({children}) => <span className="linha">{children}</span>;

// Os pacotes do app (A a G), recriados em CSS (apresentacao.css).
const ESTILOS: {classe: string; nome: string; bloco: ReactNode}[] = [
  {
    classe: "pA",
    nome: "Dourado",
    bloco: (
      <>
        <Linha><W c="up d1 s">tem novidade</W></Linha>
        <Linha><W c="up d3 g"><i>chegando</i></W></Linha>
      </>
    ),
  },
  {
    classe: "pB",
    nome: "Itálico",
    bloco: (
      <>
        <Linha><W c="fade d1 pf">o segredo</W></Linha>
        <Linha><W c="up d3 hv">que ninguém</W></Linha>
        <Linha><W c="up d4 hv">te conta</W></Linha>
      </>
    ),
  },
  {
    classe: "pC",
    nome: "Imobiliário",
    bloco: (
      <>
        <Linha><W c="down d1 tag">atenção</W></Linha>
        <Linha><W c="down d2 cx">essa</W> <W c="down d3 cx">casa</W></Linha>
        <Linha><W c="right d4 cx neon">vendeu</W></Linha>
      </>
    ),
  },
  {
    classe: "pD",
    nome: "Minúsculo",
    bloco: (
      <>
        <Linha><W c="up d1 lv">você</W> <W c="up d2 lv">precisa</W></Linha>
        <Linha><span className="pz pisca">ver isso</span></Linha>
      </>
    ),
  },
  {
    classe: "pE",
    nome: "Três fontes",
    bloco: (
      <>
        <Linha><W c="left d1 ub">olha só</W></Linha>
        <Linha><W c="down d2 hv">o que</W></Linha>
        <Linha><W c="right d4 gm">acontece</W></Linha>
      </>
    ),
  },
  {
    classe: "pF",
    nome: "Editorial",
    bloco: (
      <>
        <Linha><W c="up d1 tt">a melhor</W></Linha>
        <Linha><W c="up d3 sf">decisão</W></Linha>
      </>
    ),
  },
  {
    classe: "pG",
    nome: "Glow",
    bloco: (
      <>
        <Linha><W c="up d1 mt">só uma coisa</W></Linha>
        <Linha><W c="pop d3 mi">torna</W></Linha>
        <Linha><W c="pop d4 mi">um sonho</W></Linha>
      </>
    ),
  },
];

// Cenas do celular do topo (A → Imobiliário → Glow), uma a cada ciclo da animação.
const CENAS = [ESTILOS[0], ESTILOS[2], {...ESTILOS[6], bloco: (
  <>
    <Linha><W c="up d1 mt">o medo</W></Linha>
    <Linha><W c="pop d3 mi">de fracassar</W></Linha>
  </>
)}];
const CICLO_MS = 3400;

// O que cada plano lista, além dos minutos (os números vêm do servidor).
const VANTAGENS: Record<Nivel, (pagos: {nivel: Nivel; minutos: number}[]) => string[]> = {
  basico: () => ["Todos os estilos", "Sem marca d'água", `${transcricoesPorDia("assinante", "basico")} transcrições por dia`],
  pro: (pagos) => {
    const basico = pagos.find((p) => p.nivel === "basico")?.minutos;
    const pro = pagos.find((p) => p.nivel === "pro")?.minutos;
    return ["Tudo do Básico", basico && pro === basico * 2 ? "O dobro de minutos" : `${pro} minutos por mês`, `${transcricoesPorDia("assinante", "pro")} transcrições por dia`];
  },
  editor: () => ["Tudo do Pro", "Para quem edita para clientes", `${transcricoesPorDia("assinante", "editor")} transcrições por dia`],
};

export const Apresentacao: React.FC<{
  planos: PlanosDaApresentacao;
  // ?cupom= do link: já aplicado no campo ao abrir.
  cupomInicial?: string;
  onCriarConta: () => void;
  onEntrar: () => void;
  // Assinar um plano: cadastro e, depois do login, o pagamento dele (com o cupom).
  onAssinar: (nivel: Nivel, cupom?: VistaDoCupom) => void;
}> = ({planos, cupomInicial, onCriarConta, onEntrar, onAssinar}) => {
  const hero = useRef<HTMLElement>(null);
  const [barraVisivel, setBarraVisivel] = useState(false);
  const [antes, setAntes] = useState(false);
  const [cena, setCena] = useState(0);
  const [codigo, setCodigo] = useState(cupomInicial ?? "");
  const [cupom, setCupom] = useState<VistaDoCupom>();
  const [erroDoCupom, setErroDoCupom] = useState<string>();
  const [conferindo, setConferindo] = useState(false);

  // Fontes dos estilos: só quando a página aparece.
  useEffect(() => {
    if (document.querySelector(`link[href="${FONTES}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONTES;
    document.head.appendChild(link);
  }, []);

  // Barra fixa (celular): aparece quando o topo sai da tela.
  useEffect(() => {
    const elemento = hero.current;
    if (!elemento || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(([entrada]) => setBarraVisivel(!entrada.isIntersecting));
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  // Cenas do celular: a cada ciclo, a próxima (a key remonta e a animação recomeça).
  useEffect(() => {
    const relogio = window.setInterval(() => setCena((n) => n + 1), CICLO_MS);
    return () => window.clearInterval(relogio);
  }, []);

  const testar = (onde: string) => (clique: React.MouseEvent) => {
    clique.preventDefault();
    evento("clicou_testar_gratis", {onde});
    onCriarConta();
  };
  const assinar = (nivel: Nivel) => (clique: React.MouseEvent) => {
    clique.preventDefault();
    evento("clicou_assinar", {onde: "landing", nivel, cupom: cupom?.codigo ?? ""});
    onAssinar(nivel, cupom);
  };
  const conferirCupom = async (texto: string) => {
    setConferindo(true);
    setErroDoCupom(undefined);
    try {
      const resposta = await fetch("/api/cupom/conferir", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({cupom: texto})});
      const dados = (await resposta.json()) as {cupom?: VistaDoCupom; mensagem?: string};
      if (!resposta.ok || !dados.cupom) throw new Error(dados.mensagem ?? "Não foi possível conferir o cupom.");
      setCupom(dados.cupom);
    } catch (falha) {
      setCupom(undefined);
      setErroDoCupom(falha instanceof Error && !(falha instanceof TypeError) ? falha.message : "Não foi possível conferir o cupom agora. Tente de novo.");
    } finally {
      setConferindo(false);
    }
  };

  useEffect(() => {
    if (cupomInicial) void conferirCupom(cupomInicial);
    // Só ao abrir, com o cupom do link.
  }, []);

  const {videosNoGratis: videosGratis, diasDoPix: dias, videosExportados} = planos;
  const pagos = planos.pagos ?? [];
  const basico = pagos.find((plano) => plano.nivel === "basico");
  const atual = CENAS[cena % CENAS.length];
  const exportados = videosExportados ? `+${videosExportados.toLocaleString("pt-BR")}` : undefined;
  const botaoTestar = (onde: string, classe = "btn full") => (
    <a href="#criar-conta" className={classe} onClick={testar(onde)}>
      Testar grátis agora →
    </a>
  );

  return (
    <div className="lp">
      <nav>
        <div className="wrap">
          <div className="logo">
            <i>A</i>Ascent Legendas
          </div>
          <a
            href="#entrar"
            className="entrar"
            onClick={(clique) => {
              clique.preventDefault();
              onEntrar();
            }}
          >
            Entrar
          </a>
        </div>
      </nav>

      {/* 1. Hero */}
      <header className="hero" ref={hero}>
        <div className="wrap">
          <div>
            {exportados ? (
              <div className="lp-selo">
                🎬 <b>{exportados}</b> vídeos já legendados
              </div>
            ) : null}
            <h1>
              Legenda que <span className="serif grad">prende</span> até o fim. Pronta em 1 minuto.
            </h1>
            <p className="sub">
              Envie o vídeo pelo celular. O app transcreve, sincroniza com a sua fala e anima cada palavra no estilo dos vídeos virais. Você só baixa e posta.
            </p>
            <div className="hero-ctas">
              {botaoTestar("hero")}
              <a href="#estilos" className="btn sec full">
                Ver os estilos
              </a>
            </div>
            <div className="garantias">
              <span>Sem cartão</span>
              <span>Sem instalar nada</span>
              <span>Funciona no celular</span>
            </div>
            {cupom ? (
              <p className="nota" role="status" style={{marginTop: 12}}>
                Cupom {cupom.codigo} aplicado: {cupom.percentual}% de desconto{cupom.soPrimeiroMes ? " no 1º mês" : ""}. <a href="#planos">Ver os planos</a>
              </p>
            ) : null}
          </div>
          <div>
            <div className="fone">
              <div className={`tela${antes ? " antes" : ""}`}>
                <div className="toggle">
                  <button type="button" className={antes ? "on" : ""} aria-pressed={antes} onClick={() => setAntes(true)}>
                    Antes
                  </button>
                  <button type="button" className={antes ? "" : "on"} aria-pressed={!antes} onClick={() => setAntes(false)}>
                    Depois
                  </button>
                </div>
                <div className="pessoa" />
                <div className="hero-leg" aria-hidden="true">
                  <div key={cena} className={`cena on ${atual.classe}`}>
                    <div className="lp-bloco">{atual.bloco}</div>
                  </div>
                </div>
                <div className="leg-antes">
                  <b>tem novidade chegando</b>
                </div>
              </div>
            </div>
            <p className="nota lp-centro" style={{marginTop: 12}}>
              Toque em "Antes" e "Depois"
            </p>
          </div>
        </div>
      </header>

      {/* 2. Prova (só números reais) */}
      <div className="prova">
        <div className="wrap">
          <div>
            <b>1 min</b>
            <small>do envio ao vídeo pronto</small>
          </div>
          <div>
            <b>{ESTILOS.length} estilos</b>
            <small>e novos chegando sempre</small>
          </div>
          {exportados ? (
            <div>
              <b>{exportados}</b>
              <small>vídeos legendados</small>
            </div>
          ) : null}
        </div>
      </div>

      {/* 3. Ancoragem (com os números do Básico) */}
      {basico?.valor !== undefined ? (
        <section>
          <div className="wrap lp-centro">
            <h2>
              Pare de pagar <span className="serif grad">por vídeo</span>
            </h2>
            <p className="sub">Legenda dinâmica feita por editor custa caro e demora. Aqui você faz sozinho, na hora.</p>
            <div className="ancora" style={{textAlign: "left"}}>
              <div className="caixa ruim">
                <h3>Editor de vídeo</h3>
                <div className="preco">R$ 100+</div>
                <p className="nota">por vídeo</p>
                <ul>
                  <li>Espera dias pela entrega</li>
                  <li>Cada ajuste é uma nova mensagem</li>
                  <li>30 vídeos = R$ 3.000</li>
                </ul>
              </div>
              <div className="caixa bom">
                <h3>Ascent Legendas</h3>
                <div className="preco">{porMinuto(basico.valor, basico.minutos)}</div>
                <p className="nota">por minuto de vídeo, no plano {basico.nome}</p>
                <ul>
                  <li>Pronto em 1 minuto</li>
                  <li>Você muda palavra, cor e estilo</li>
                  <li>
                    {basico.minutos} min de vídeo por {reais(basico.valor)}/mês
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* 4. Como funciona */}
      <section style={{background: "var(--bg2)"}}>
        <div className="wrap lp-centro">
          <h2>
            Três toques. <span className="serif grad">Só isso.</span>
          </h2>
          <div className="passos" style={{textAlign: "left"}}>
            <div className="passo">
              <div className="n">1</div>
              <h3>Envie o vídeo</h3>
              <p>Direto da galeria do celular. Pode juntar vários takes.</p>
              <div className="lp-mini" aria-hidden="true">
                <div className="envio">
                  <i />
                </div>
                <span className="rot">enviando video.mov…</span>
              </div>
            </div>
            <div className="passo">
              <div className="n">2</div>
              <h3>Escolha o estilo</h3>
              <p>A legenda já sai sincronizada. Troque o estilo, a cor ou uma palavra com um toque.</p>
              <div className="lp-mini" aria-hidden="true">
                <div className="lp-chips">
                  <span>Pacote A</span>
                  <span>Imobiliário</span>
                  <span>Editorial</span>
                  <span>Glow</span>
                </div>
              </div>
            </div>
            <div className="passo">
              <div className="n">3</div>
              <h3>Baixe e poste</h3>
              <p>Vídeo em 1080×1920, pronto para Reels, TikTok e Shorts.</p>
              <div className="lp-mini" aria-hidden="true">
                <div className="ok">✓</div>
                <span className="rot">salvo na galeria</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Estilos */}
      <section id="estilos">
        <div className="wrap lp-centro">
          <h2>
            Estilos que <span className="serif grad">viralizam</span>
          </h2>
          <p className="sub">Do editorial ao impacto. Use um só ou misture todos no mesmo vídeo.</p>
          <div className="estilos">
            {ESTILOS.map((estilo) => (
              <div key={estilo.classe} className={`est ${estilo.classe}`}>
                <div className="fundo" />
                <div className="lp-bloco" aria-hidden="true">
                  {estilo.bloco}
                </div>
                <span className="lp-nome">{estilo.nome}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Para quem é */}
      <section style={{background: "var(--bg2)"}}>
        <div className="wrap lp-centro">
          <h2>
            Feito para quem <span className="serif grad">posta todo dia</span>
          </h2>
          <div className="quem">
            <div className="q">
              <div className="lp-ic">📱</div>
              <h3>Criadores de conteúdo</h3>
              <p>Mais retenção nos Reels sem passar a noite editando.</p>
            </div>
            <div className="q">
              <div className="lp-ic">🎬</div>
              <h3>Editores de vídeo</h3>
              <p>Entregue mais vídeos por dia e cobre o mesmo dos seus clientes.</p>
            </div>
            <div className="q">
              <div className="lp-ic">🏠</div>
              <h3>Corretores e lojas</h3>
              <p>Vídeo de imóvel e produto com cara de agência, feito no celular.</p>
            </div>
            <div className="q">
              <div className="lp-ic">💬</div>
              <h3>Profissionais liberais</h3>
              <p>Médicos, advogados, coaches: sua fala com legenda profissional.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Planos */}
      <section id="planos">
        <div className="wrap lp-centro">
          <h2>
            Comece grátis. <span className="serif grad">Assine quando amar.</span>
          </h2>
          <p className="sub">
            {videosGratis} {videosGratis === 1 ? "vídeo grátis" : "vídeos grátis"} com marca d'água. Cancele quando quiser: os minutos ficam até o fim do mês.
          </p>
          {pagos.length ? (
            <>
              <form
                className="cupom"
                onSubmit={(envio) => {
                  envio.preventDefault();
                  void conferirCupom(codigo);
                }}
              >
                <input placeholder="Tenho um cupom" aria-label="Cupom" autoComplete="off" value={codigo} onChange={(campo) => setCodigo(campo.target.value)} />
                <button type="submit" disabled={conferindo || !codigo.trim()}>
                  {conferindo ? "…" : "Aplicar"}
                </button>
              </form>
              {cupom ? (
                <p className="nota" role="status" style={{marginTop: 8}}>
                  Cupom {cupom.codigo}: {cupom.percentual}% de desconto{cupom.soPrimeiroMes ? " no 1º mês" : ""}. Já vai aplicado no pagamento.
                </p>
              ) : erroDoCupom ? (
                <p className="nota" role="alert" style={{marginTop: 8, color: "#ff6b6b"}}>
                  {erroDoCupom}
                </p>
              ) : null}
              <div className="planos">
                {pagos.map((plano) => {
                  const destaque = plano.nivel === "pro";
                  const comDesconto = cupom ? valorComDesconto(plano.valor, cupom.percentual) : plano.valor;
                  return (
                    <div key={plano.nivel} className={`plano${destaque ? " dest" : ""}`}>
                      {destaque ? <span className="tag">⭐ Mais escolhido</span> : null}
                      <h3>{plano.nome}</h3>
                      <div className="p">
                        {reais(comDesconto)}
                        <small>/mês{cupom?.soPrimeiroMes ? " no 1º mês" : ""}</small>
                      </div>
                      {cupom ? <s className="eq">{reais(plano.valor)}/mês</s> : null}
                      <div className="eq">
                        {plano.minutos} min de vídeo · {porMinuto(plano.valor, plano.minutos)} por minuto
                      </div>
                      <ul>
                        {VANTAGENS[plano.nivel](pagos).map((vantagem) => (
                          <li key={vantagem}>{vantagem}</li>
                        ))}
                      </ul>
                      <a href="#criar-conta" className={`btn full${destaque ? "" : " sec"}`} onClick={assinar(plano.nivel)}>
                        Assinar {plano.nome}
                      </a>
                    </div>
                  );
                })}
              </div>
              <p className="nota" style={{marginTop: 14}}>
                Cartão (renova todo mês) ou Pix de {dias} dias. Pagamento seguro pelo Mercado Pago.
              </p>
            </>
          ) : (
            <div style={{marginTop: 22}}>{botaoTestar("planos", "btn")}</div>
          )}
        </div>
      </section>

      {/* 8. Dúvidas */}
      <section style={{background: "var(--bg2)"}}>
        <div className="wrap lp-centro">
          <h2>Dúvidas</h2>
          <div className="faq">
            <details>
              <summary>Preciso saber editar vídeo?</summary>
              <p>Não. Você envia o vídeo e o app faz o resto. Se quiser, troca uma palavra ou a cor com um toque.</p>
            </details>
            <details>
              <summary>Funciona no celular?</summary>
              <p>Sim, foi feito para o celular. Abre no navegador e dá para instalar como app na tela inicial.</p>
            </details>
            <details>
              <summary>A legenda fica sincronizada com a fala?</summary>
              <p>Sim. Cada palavra aparece no momento exato em que é falada.</p>
            </details>
            <details>
              <summary>Posso cancelar quando quiser?</summary>
              <p>Pode. Sem multa. Os minutos do mês continuam valendo até o fim do período.</p>
            </details>
            <details>
              <summary>Aceita vídeo do iPhone e em 4K?</summary>
              <p>Aceita. O vídeo sai em 1080×1920, a resolução ideal para Reels, TikTok e Shorts.</p>
            </details>
            <details>
              <summary>O vídeo grátis tem marca d'água?</summary>
              <p>Tem, uma pequena. Nos planos pagos o vídeo sai limpo.</p>
            </details>
          </div>
        </div>
      </section>

      {/* 9. Final */}
      <section className="final">
        <div className="wrap">
          <h2>
            Seu próximo vídeo pode sair <span className="serif grad">hoje</span>.
          </h2>
          <p className="sub" style={{margin: "0 auto 24px"}}>
            Teste grátis agora. Leva 1 minuto.
          </p>
          {botaoTestar("final", "btn")}
          <div className="garantias" style={{justifyContent: "center"}}>
            <span>Sem cartão</span>
            <span>Sem instalar nada</span>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          Ascent Legendas · Ascent Studio
          <br />
          <br />
          <a href="/termos.html">Termos</a>
          <a href="/privacidade.html">Privacidade</a>
          <a href="mailto:contato@ascentstudio.com.br">Suporte</a>
        </div>
      </footer>

      <div className={`fixo${barraVisivel ? " on" : ""}`}>{botaoTestar("barra_fixa")}</div>
    </div>
  );
};

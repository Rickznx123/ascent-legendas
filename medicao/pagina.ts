// Página HTML de conferência da sincronia: forma de onda, trechos de voz, começos e
// fins de voz do áudio, as palavras de cada transcrição (cor pelo erro) e um tocador.
// Arquivo único, sem nada de fora (o áudio vai embutido).
import type {Estatisticas, Ponto} from "./comparacao";
import {ERRO_VISIVEL_MS, UM_QUADRO_MS} from "./comparacao";
import type {Voz} from "./voz";
import type {Word} from "../src/types";

export type TranscricaoNaPagina = {
  nome: string;
  palavras: Word[];
  pontos: Ponto[];
  estatisticas: Estatisticas;
  piores: Ponto[];
};

export const montarPagina = (dados: {
  video: string;
  duracaoMs: number;
  energiaDb: number[];
  picos: number[];
  voz: Voz;
  transcricoes: TranscricaoNaPagina[];
  wavBase64: string;
}): string => {
  const json = JSON.stringify({
    video: dados.video,
    duracaoMs: dados.duracaoMs,
    energia: dados.energiaDb.map((v) => Math.round(v * 10) / 10),
    picos: dados.picos.map((v) => Math.round(v * 1000) / 1000),
    voz: dados.voz,
    umQuadro: UM_QUADRO_MS,
    visivel: ERRO_VISIVEL_MS,
    transcricoes: dados.transcricoes.map((t) => ({
      nome: t.nome,
      palavras: t.palavras.map((w) => [w.text, w.startMs, w.endMs]),
      pontos: t.pontos,
      estatisticas: t.estatisticas,
      piores: t.piores,
    })),
  }).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Conferência de sincronia</title>
<style>
:root {
  --fundo: #0e0e11; --painel: #16161b; --painel-2: #1e1e25; --linha: #2a2a33; --texto: #ececf1; --suave: #8d8d9a;
  --acento: #7c5cff; --ok: #3ecf8e; --medio: #f5b83d; --ruim: #ff5a52; --onda: #6b6b80; --voz: rgba(124, 92, 255, 0.10);
  --comeco: #3ecf8e; --fim: #f08a3e;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    --fundo: #f6f6f8; --painel: #ffffff; --painel-2: #efeff3; --linha: #dcdce3; --texto: #17171c; --suave: #63636f;
    --onda: #9a9aab; --voz: rgba(124, 92, 255, 0.12);
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--fundo); color: var(--texto); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
header, section { padding: 16px; max-width: 1400px; margin: 0 auto; }
h1 { font-size: 20px; margin: 0 0 4px; }
h2 { font-size: 16px; margin: 20px 0 8px; }
.suave { color: var(--suave); }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--linha); white-space: nowrap; }
th { color: var(--suave); font-weight: 600; font-size: 12px; }
.tabela { overflow-x: auto; background: var(--painel); border: 1px solid var(--linha); border-radius: 10px; }
.controles { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; padding: 10px 16px; background: var(--painel); border-bottom: 1px solid var(--linha); }
button { font: inherit; color: inherit; background: var(--painel-2); border: 1px solid var(--linha); border-radius: 8px; padding: 6px 12px; cursor: pointer; min-height: 36px; }
button.principal { background: var(--acento); border-color: var(--acento); color: #fff; font-weight: 700; min-width: 90px; }
label { display: inline-flex; gap: 6px; align-items: center; color: var(--suave); }
#tempo { font-variant-numeric: tabular-nums; min-width: 90px; }
#rolagem { overflow-x: auto; overflow-y: hidden; position: relative; background: var(--painel); border-bottom: 1px solid var(--linha); }
#largura { height: 1px; }
canvas { position: sticky; left: 0; display: block; cursor: pointer; }
.legenda { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: var(--suave); padding: 8px 16px; max-width: 1400px; margin: 0 auto; }
.legenda i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; vertical-align: -2px; margin-right: 4px; }
.erro-ok { color: var(--ok); } .erro-medio { color: var(--medio); } .erro-ruim { color: var(--ruim); }
</style>
</head>
<body>
<header>
  <h1>Conferência de sincronia</h1>
  <div class="suave" id="sub"></div>
  <div class="tabela" style="margin-top:12px"><table id="resumo"></table></div>
</header>
<div class="controles">
  <button class="principal" id="tocar">▶ Tocar</button>
  <span id="tempo">0,00 s</span>
  <label>Velocidade <select id="velocidade"><option value="1">1×</option><option value="0.5">0,5×</option><option value="0.25">0,25×</option></select></label>
  <label>Zoom <input type="range" id="zoom" min="40" max="1600" value="300"> <span id="zoomValor"></span></label>
  <span class="suave">Clique na onda para tocar dali.</span>
</div>
<div id="rolagem"><div id="largura"></div><canvas id="tela"></canvas></div>
<div class="legenda">
  <span><i style="background:var(--voz);border:1px solid var(--acento)"></i>voz detectada</span>
  <span><i style="background:var(--comeco)"></i>começo de voz (depois de silêncio)</span>
  <span><i style="background:var(--fim)"></i>fim de voz (antes de silêncio)</span>
  <span><i style="background:var(--ok)"></i>erro até ${UM_QUADRO_MS} ms</span>
  <span><i style="background:var(--medio)"></i>até ${ERRO_VISIVEL_MS} ms</span>
  <span><i style="background:var(--ruim)"></i>acima de ${ERRO_VISIVEL_MS} ms</span>
  <span><i style="background:var(--onda)"></i>palavra sem ponto de comparação (meio da frase)</span>
</div>
<section id="piores"></section>
<audio id="audio" src="data:audio/wav;base64,${dados.wavBase64}" preload="auto"></audio>
<script>
const D = ${json};
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const seg = (ms) => (ms / 1000).toFixed(2).replace(".", ",") + " s";
const corDoErro = (e) => Math.abs(e) <= D.umQuadro ? css("--ok") : Math.abs(e) <= D.visivel ? css("--medio") : css("--ruim");
const classeDoErro = (e) => Math.abs(e) <= D.umQuadro ? "erro-ok" : Math.abs(e) <= D.visivel ? "erro-medio" : "erro-ruim";

document.getElementById("sub").textContent = D.video + " · " + seg(D.duracaoMs) + " · " + D.voz.comecos.length + " começos e " + D.voz.fins.length + " fins de voz depois/antes de silêncio";
const resumo = document.getElementById("resumo");
resumo.innerHTML = "<tr><th>Transcrição</th><th>Pontos</th><th>Erro médio</th><th>Mediana</th><th>Pior</th><th>&gt; 33 ms</th><th>&gt; 80 ms</th><th>Viés (mediana com sinal)</th><th>Erro médio sem o viés</th></tr>" +
  D.transcricoes.map((t) => { const e = t.estatisticas; return "<tr><td>" + t.nome + "</td><td>" + e.pontos + "</td><td>" + e.erroMedioMs + " ms</td><td>" + e.medianaMs + " ms</td><td>" + e.piorMs + " ms</td><td>" + e.acimaDeUmQuadro + "</td><td>" + e.acimaDe80Ms + "</td><td>" + (e.viesMs > 0 ? "+" : "") + e.viesMs + " ms</td><td>" + e.semVies.erroMedioMs + " ms</td></tr>"; }).join("");

const audio = document.getElementById("audio");
const rolagem = document.getElementById("rolagem");
const largura = document.getElementById("largura");
const tela = document.getElementById("tela");
const ctx = tela.getContext("2d");
const zoom = document.getElementById("zoom");
const ALTURA_ONDA = 150, ALTURA_FAIXA = 46;
let pxPorSegundo = Number(zoom.value);

// Ponto de cada palavra casada (início/fim), por transcrição.
const pontosDa = D.transcricoes.map((t) => { const m = new Map(); t.pontos.forEach((p) => m.set(p.tipo + p.indice, p)); return m; });

const medir = () => {
  const dpr = window.devicePixelRatio || 1;
  const alturaTotal = ALTURA_ONDA + 20 + D.transcricoes.length * ALTURA_FAIXA;
  largura.style.width = Math.ceil((D.duracaoMs / 1000) * pxPorSegundo) + "px";
  tela.style.width = rolagem.clientWidth + "px";
  tela.style.height = alturaTotal + "px";
  tela.style.marginTop = "-1px";
  tela.width = rolagem.clientWidth * dpr;
  tela.height = alturaTotal * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  document.getElementById("zoomValor").textContent = pxPorSegundo + " px/s";
};

const xDe = (ms) => (ms / 1000) * pxPorSegundo - rolagem.scrollLeft;
const msDe = (x) => ((x + rolagem.scrollLeft) / pxPorSegundo) * 1000;

const desenhar = () => {
  const w = rolagem.clientWidth;
  const h = tela.height / (window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);
  const de = Math.max(0, msDe(0)), ate = msDe(w);
  // Trechos de voz.
  ctx.fillStyle = css("--voz");
  for (const t of D.voz.trechos) if (t.fimMs > de && t.inicioMs < ate) ctx.fillRect(xDe(t.inicioMs), 0, xDe(t.fimMs) - xDe(t.inicioMs), ALTURA_ONDA);
  // Forma de onda (pico por janela de 10 ms).
  ctx.fillStyle = css("--onda");
  const meio = ALTURA_ONDA / 2;
  const passo = Math.max(1, Math.floor(10 / ((pxPorSegundo / 1000) * 10)));
  for (let j = Math.floor(de / 10); j < Math.min(D.picos.length, Math.ceil(ate / 10)); j += passo) {
    let p = 0; for (let k = j; k < j + passo && k < D.picos.length; k++) p = Math.max(p, D.picos[k]);
    const a = Math.max(1, p * (ALTURA_ONDA / 2 - 4));
    ctx.fillRect(xDe(j * 10), meio - a, Math.max(1, (pxPorSegundo / 100) * passo - 0.5), a * 2);
  }
  // Começos e fins de voz.
  ctx.lineWidth = 2;
  const marca = (ms, cor) => { if (ms < de - 50 || ms > ate + 50) return; ctx.strokeStyle = cor; ctx.beginPath(); ctx.moveTo(xDe(ms), 0); ctx.lineTo(xDe(ms), h); ctx.stroke(); };
  D.voz.comecos.forEach((ms) => marca(ms, css("--comeco")));
  D.voz.fins.forEach((ms) => marca(ms, css("--fim")));
  // Régua.
  ctx.fillStyle = css("--suave"); ctx.font = "11px system-ui";
  const intervalo = pxPorSegundo > 600 ? 0.1 : pxPorSegundo > 150 ? 0.5 : 1;
  for (let s = Math.ceil(de / 1000 / intervalo) * intervalo; s * 1000 < ate; s += intervalo) {
    ctx.fillRect(xDe(s * 1000), ALTURA_ONDA, 1, 6);
    ctx.fillText(s.toFixed(intervalo < 1 ? 1 : 0).replace(".", ","), xDe(s * 1000) + 3, ALTURA_ONDA + 15);
  }
  // Uma faixa por transcrição: caixa da palavra; traço no início (cor do erro, se casou).
  D.transcricoes.forEach((t, n) => {
    const y = ALTURA_ONDA + 20 + n * ALTURA_FAIXA;
    ctx.fillStyle = css("--suave"); ctx.font = "600 11px system-ui"; ctx.fillText(t.nome, 6, y + 12);
    ctx.font = "12px system-ui";
    t.palavras.forEach(([texto, ini, fim], i) => {
      if (fim < de || ini > ate) return;
      const x1 = xDe(ini), x2 = xDe(fim);
      ctx.fillStyle = css("--painel-2"); ctx.fillRect(x1, y + 16, Math.max(1, x2 - x1 - 1), 24);
      const pi = pontosDa[n].get("início" + i), pf = pontosDa[n].get("fim" + i);
      ctx.fillStyle = pi ? corDoErro(pi.erroMs) : css("--onda"); ctx.fillRect(x1, y + 16, 3, 24);
      if (pi) { ctx.strokeStyle = corDoErro(pi.erroMs); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, ALTURA_ONDA); ctx.stroke(); ctx.setLineDash([]); }
      if (pf) { ctx.fillStyle = corDoErro(pf.erroMs); ctx.fillRect(x2 - 4, y + 16, 3, 24); }
      ctx.fillStyle = css("--texto");
      ctx.save(); ctx.beginPath(); ctx.rect(x1 + 5, y + 16, Math.max(0, x2 - x1 - 8), 24); ctx.clip(); ctx.fillText(texto, x1 + 6, y + 33); ctx.restore();
    });
  });
  // Cabeça de reprodução.
  ctx.fillStyle = css("--texto"); ctx.fillRect(xDe(audio.currentTime * 1000), 0, 2, h);
};

let parar;
const tocarTrecho = (deMs, ateMs) => {
  clearTimeout(parar);
  audio.currentTime = Math.max(0, deMs / 1000);
  audio.play();
  if (ateMs !== undefined) parar = setTimeout(() => audio.pause(), ((ateMs - deMs) / audio.playbackRate));
};
const mostrar = (ms) => { rolagem.scrollLeft = Math.max(0, (ms / 1000) * pxPorSegundo - rolagem.clientWidth / 2); };

document.getElementById("tocar").onclick = () => (audio.paused ? audio.play() : audio.pause());
document.getElementById("velocidade").onchange = (e) => { audio.playbackRate = Number(e.target.value); };
audio.onplay = () => (document.getElementById("tocar").textContent = "❚❚ Pausar");
audio.onpause = () => (document.getElementById("tocar").textContent = "▶ Tocar");
tela.onclick = (e) => { const r = tela.getBoundingClientRect(); tocarTrecho(msDe(e.clientX - r.left)); };
zoom.oninput = () => { const centro = msDe(rolagem.clientWidth / 2); pxPorSegundo = Number(zoom.value); medir(); mostrar(centro); desenhar(); };
rolagem.onscroll = desenhar;
window.onresize = () => { medir(); desenhar(); };
const quadro = () => {
  document.getElementById("tempo").textContent = seg(audio.currentTime * 1000);
  if (!audio.paused) { const x = xDe(audio.currentTime * 1000); if (x > rolagem.clientWidth * 0.85 || x < 0) mostrar(audio.currentTime * 1000 + rolagem.clientWidth / pxPorSegundo * 350); }
  desenhar(); requestAnimationFrame(quadro);
};

// As piores palavras de cada transcrição.
const secao = document.getElementById("piores");
secao.innerHTML = D.transcricoes.map((t, n) =>
  "<h2>" + t.nome + ": as " + t.piores.length + " piores palavras</h2><div class='tabela'><table><tr><th></th><th>Palavra</th><th>Ponto</th><th>Transcrição</th><th>Áudio</th><th>Erro</th></tr>" +
  t.piores.map((p, i) => "<tr><td><button data-t='" + n + "' data-i='" + i + "'>▶ ouvir</button></td><td>" + p.palavra + "</td><td>" + p.tipo + "</td><td>" + seg(p.transcricaoMs) + "</td><td>" + seg(p.audioMs) + "</td><td class='" + classeDoErro(p.erroMs) + "'>" + (p.erroMs > 0 ? "+" : "") + Math.round(p.erroMs) + " ms " + (p.erroMs > 0 ? "(atrasada)" : "(adiantada)") + "</td></tr>").join("") +
  "</table></div>").join("");
secao.onclick = (e) => {
  const b = e.target.closest("button[data-t]"); if (!b) return;
  const p = D.transcricoes[Number(b.dataset.t)].piores[Number(b.dataset.i)];
  const de = Math.min(p.transcricaoMs, p.audioMs) - 500;
  if (pxPorSegundo < 600) { pxPorSegundo = 800; zoom.value = 800; medir(); }
  mostrar((p.transcricaoMs + p.audioMs) / 2);
  tocarTrecho(de, Math.max(p.transcricaoMs, p.audioMs) + 700);
};

medir(); desenhar(); requestAnimationFrame(quadro);
</script>
</body>
</html>
`;
};

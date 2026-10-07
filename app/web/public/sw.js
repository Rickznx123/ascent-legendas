// Service worker mínimo do app instalado (Etapa 3, bloco 8): só o necessário para
// instalar. NÃO guarda nada em cache: a API, os vídeos, os endereços assinados e a
// própria tela vêm sempre da rede, então uma versão nova do app chega sozinha (a
// tela montada é servida sem cache e os arquivos dela têm o hash no nome).
// O único papel dele é responder às aberturas de página: sem internet, em vez da
// tela de erro do navegador, um aviso em português.
const AVISO_SEM_INTERNET = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0e0e11"><title>Ascent Legendas</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e0e11;color:#ececf1;
font:15px/1.5 system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
b{display:block;font-size:18px;margin-bottom:6px}button{margin-top:16px;font:inherit;color:#fff;
background:#7c5cff;border:0;border-radius:8px;padding:10px 18px}</style></head>
<body><div><b>Sem conexão</b>O app precisa de internet. Confira a conexão e tente de novo.
<br><button onclick="location.reload()">Tentar de novo</button></div></body></html>`;

// Versão nova do service worker: assume na hora, sem esperar as abas fecharem.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    // Limpa qualquer cache que uma versão antiga tenha criado.
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.map((nome) => caches.delete(nome))))
      .then(() => self.clients.claim()),
  );
});

// Só as aberturas de página (navegação) passam por aqui, e sempre pela rede. O resto
// (API, vídeos, S3, sons, arquivos da tela) nem é interceptado.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(AVISO_SEM_INTERNET, {status: 503, headers: {"Content-Type": "text/html; charset=utf-8"}}),
    ),
  );
});

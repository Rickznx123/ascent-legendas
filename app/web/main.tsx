import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {Entrada} from "./Entrada";
import "./tema.css";
import "./estilos.css";
import "./celular/celular.css";

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <Entrada />
  </StrictMode>,
);

// App instalado (PWA): o service worker mínimo (app/web/public/sw.js). Ele não guarda
// nada em cache; serve para o navegador oferecer "instalar" e para o aviso sem internet.
// updateViaCache "none": a versão nova do sw.js é sempre buscada na rede.
if ("serviceWorker" in navigator && window.isSecureContext && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", {scope: "/", updateViaCache: "none"}).catch(() => undefined);
  });
}

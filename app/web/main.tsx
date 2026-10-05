import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {App} from "./App";
import "./tema.css";
import "./estilos.css";
import "./celular/celular.css";

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

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

import type {CSSProperties} from "react";
import {SANS, layout} from "./_estilos";

/*
 * LINEAR EM 1 LINHA — "dois amigos goianos"
 * O mesmo estilo do linear de 2 linhas, numa linha só (espaçamento -.05em).
 * Bloco com 64% da largura (letra de até 10%).
 */
const LINEAR: CSSProperties = {fontFamily: SANS, fontWeight: 600, letterSpacing: "-.05em", lineHeight: 1, textTransform: "lowercase", color: "#fff"};

export default layout({
  arranjo: "linear-uma-linha",
  ajuste: {targetWidthPercent: 64, maxFontPercent: 10},
  estilos: {linear: LINEAR},
});

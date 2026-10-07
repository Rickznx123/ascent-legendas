import type {CaptionTemplate} from "../../src/types";
import {BLOCO, EMBAIXO, ENTRADA_LINEAR, POR_LETRA, SAIDA_LINEAR} from "./_estilos";

/*
 * LINEAR DO PACOTE C
 * A frase sozinha numa linha (até 3 palavras ou 20 caracteres; acima disso, o ritmo
 * a divide em mais blocos lineares). Branco, sem caixa e sem cor de destaque, no
 * tamanho do corpo (24 px na prancha). Sempre embaixo e centralizado. Cada palavra
 * sobe ao ser falada, ou letra por letra (Projeto.entradaLinear).
 */
const template: CaptionTemplate = {
  family: "linear",
  structure: "linear",
  keywordEffect: "sombra",
  styles: {
    block: {
      ...BLOCO,
      display: "block",
      fontWeight: 800,
      fontSize: `${(24 * 100) / 360}cqw`,
      textShadow: `0 ${(2 * 100) / 360}cqw ${(8 * 100) / 360}cqw rgba(0,0,0,.55)`,
    },
  },
  animations: {word: ENTRADA_LINEAR, keyword: ENTRADA_LINEAR},
  linhaUnica: true,
  porLetra: POR_LETRA,
  posicao: EMBAIXO,
  saida: SAIDA_LINEAR,
};

export default template;

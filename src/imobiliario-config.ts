// Parâmetros do pacote C, estilo imobiliário (veja src/imobiliario.tsx), sem React:
// os layouts do pacote (carregados no servidor) usam a entrada equivalente.
import type {EntranceAnimation} from "./types";

// Parâmetros da prancha (30 quadros por segundo, base 360 x 640).
export const IMOBILIARIO = {
  base: {largura: 360, altura: 640},
  entrada: {quadros: 9, distancia: 150, lados: 1.4},
  saida: {quadros: 7, sobe: 130, cascata: 1},
  blur: {fator: 0.55, teto: 34, minimo: 0.4},
  esticada: {divisor: 70, teto: 0.35},
  // Opacidade de 0 a 1 nos primeiros quadros da entrada.
  quadrosDaOpacidade: 3,
  apoio: {tamanho: 27, peso: 300},
  chave: {numerador: 440, minimo: 44, maximo: 86, peso: 800, espacamento: "-0.045em"},
  // Grupos: margem esquerda e direita, onde começa cada grupo (topo, na altura) e
  // o recuo das linhas alternadas.
  grupo: {esquerda: 34, direita: 20, cima: 86, baixo: 372, unico: 300, recuo: 46},
  linha: {espaco: 7, sobreposicao: 14},
  // Bloco com até tantas palavras: um grupo só, na altura do peito.
  palavrasDoGrupoUnico: 2,
  // Âncora e trilho: a âncora tem mais de uma palavra, ou uma com tantas letras.
  // Ela fica até passarem palavrasMinimas no trilho e sai na pausa ou no fim de
  // frase seguinte; com palavrasMaximas, sai de qualquer jeito.
  ancora: {letrasDaPalavraLonga: 10},
  trilho: {palavrasMinimas: 5, palavrasMaximas: 8, distancia: 210, saida: 180, apoioCurto: 3},
  // Linear do C: chave menor que a do destaque.
  linear: {chaveMaxima: 64},
} as const;

// Entrada equivalente (para a antecipação da Sincronia, veja src/entrada.ts):
// 9 quadros com curva expo-out.
export const ENTRADA_IMOBILIARIO: EntranceAnimation = {
  durationMs: (IMOBILIARIO.entrada.quadros / 30) * 1000,
  easing: [0.16, 1, 0.3, 1],
  fromOpacity: 0,
  fromTranslateYEm: 0,
  fromBlurEm: 0,
  fromScale: 1,
};

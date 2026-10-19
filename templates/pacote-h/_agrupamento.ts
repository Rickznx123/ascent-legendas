import {AGRUPAMENTO_CONFIG} from "../../src/agrupamento-config";
import type {ConfigDoAgrupamento} from "../../src/types";

/*
 * AGRUPAMENTO DO PACOTE H — vale quando o vídeo usa só este pacote (no modo misto,
 * o geral de src/agrupamento-config.ts). O resto é igual ao geral.
 *   - 3 a 5 palavras por bloco;
 *   - até 2 linhas de 24 caracteres (49 com o espaço da quebra);
 *   - corta de preferência em pontuação ou pausa acima de 0,3 s;
 *   - duração mínima de 0,8 s (bloco mais curto é juntado com o vizinho).
 */
const agrupamento: ConfigDoAgrupamento = {
  ...AGRUPAMENTO_CONFIG,
  maxPalavrasPorBloco: 5,
  minPalavrasPorBloco: 3,
  maxCaracteresPorBloco: 49,
  pausaMinimaMs: 300,
  penalidades: {
    ...AGRUPAMENTO_CONFIG.penalidades,
    // Abaixo de 3 palavras: mais caro que atravessar uma vírgula ou pausa (60), mais
    // barato que atravessar um fim de frase (400).
    abaixoDoMinimoDePalavras: 120,
    // Passar de 2 linhas de 24 caracteres quase nunca compensa.
    passarDoLimiteDeCaracteres: 400,
  },
  desempate: {...AGRUPAMENTO_CONFIG.desempate, tamanhoIdeal: 4},
  tempos: {...AGRUPAMENTO_CONFIG.tempos, tempoMinimoDeTelaMs: 800},
};

export default agrupamento;

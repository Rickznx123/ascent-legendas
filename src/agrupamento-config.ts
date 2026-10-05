/*
 * CONFIGURAÇÃO DO AGRUPADOR DE LEGENDAS
 *
 * O agrupador testa todas as formas de dividir a fala em blocos e escolhe a que
 * tiver a MENOR penalidade total. Ele nunca falha: sempre existe uma divisão,
 * mesmo que não seja perfeita.
 *
 * Regras que NUNCA são quebradas:
 *   - cada bloco tem de 1 a `maxPalavrasPorBloco` palavras (ou até
 *     `maxPalavrasComExpressaoProtegida`, se o bloco contiver uma expressão protegida inteira);
 *   - a ordem da fala é mantida.
 *
 * Todo o resto vira penalidade. Quanto maior o número, mais o agrupador evita
 * aquela situação. Mantenha a ordem dos pesos (do mais pesado ao mais leve) se
 * quiser que uma regra sempre "ganhe" da outra.
 */
export const AGRUPAMENTO_CONFIG = {
  // Máximo de palavras por bloco (obrigatório; os templates vão até 5).
  maxPalavrasPorBloco: 5,

  // Um bloco que contém uma expressão protegida inteira pode ir até este número
  // de palavras (ex.: "para o seu dia a dia").
  maxPalavrasComExpressaoProtegida: 6,

  // A partir de quantos caracteres um bloco é considerado comprido demais.
  maxCaracteresPorBloco: 28,

  // Silêncio entre duas palavras (em milissegundos) que conta como pausa.
  pausaMinimaMs: 350,

  // Expressões que devem aparecer inteiras no mesmo bloco.
  // Escreva sem se preocupar com acentos ou maiúsculas.
  expressoesProtegidas: [
    "depilação a laser",
    "dia a dia",
    "passo a passo",
    "cara a cara",
    "pouco a pouco",
  ],

  // Linha de apoio de cima nos destaques: só vale com pelo menos `minPalavras`
  // palavras OU `minCaracteres` caracteres. Uma palavra curta sozinha em cima
  // (ex.: "Tem" acima de "novidade") é proibida.
  linhaDeCima: {
    minPalavras: 2,
    minCaracteres: 10,
  },

  penalidades: {
    // Cortar uma expressão protegida no meio (ex.: "depilação a | laser").
    quebrarExpressaoProtegida: 1000,

    // Para cada fim de frase (ponto final, interrogação ou exclamação) que ficou
    // NO MEIO de um bloco (ex.: "imperdíveis. Mais informações").
    atravessarFimDeFrase: 400,

    // Bloco terminando em artigo, preposição, conjunção, possessivo ou
    // demonstrativo (ex.: "pode contar com", "para o seu").
    terminarEmPalavraDeLigacao: 300,

    // Bloco que, como destaque, só teria uma linha de cima inválida, seja qual
    // for a palavra-chave escolhida (ex.: "Tem novidade").
    linhaDeCimaInvalida: 250,

    // Bloco formado só por palavras comuns (ex.: "e para o").
    soPalavrasComuns: 150,

    // Bloco com uma palavra só.
    blocoDeUmaPalavra: 80,

    // Para cada vírgula, dois-pontos, ponto e vírgula ou pausa maior que
    // `pausaMinimaMs` que ficou NO MEIO de um bloco.
    atravessarVirgulaOuPausa: 60,

    // Bloco com mais caracteres que `maxCaracteresPorBloco`.
    passarDoLimiteDeCaracteres: 40,
  },

  // Preferências bem leves, só para desempatar divisões igualmente boas.
  desempate: {
    // Custo de cortar onde não há pontuação nem pausa.
    cortarForaDePausa: 2,

    // Custo por palavra de diferença em relação ao tamanho ideal de bloco.
    tamanhoIdeal: 3,
    distanciaDoTamanhoIdeal: 0.4,
  },

  // Dupla (pacotes com layout de dupla, como o d6 do pacote D): dois blocos
  // seguidos ficam na tela ao mesmo tempo e contam como um destaque no ritmo.
  dupla: {
    // Cada um dos dois blocos pode ter no máximo este número de palavras.
    maxPalavrasPorBloco: 4,
    // Silêncio máximo entre o fim do primeiro e o início do segundo.
    intervaloMaximoMs: 400,
    // No máximo uma dupla a cada este número de blocos.
    aCadaBlocos: 6,
  },

  // Quanto tempo cada bloco fica na tela (em milissegundos).
  tempos: {
    // O bloco fica até o início do bloco seguinte, mas no máximo este tempo
    // depois da última palavra falada.
    permanenciaMaximaMs: 1200,

    // Tempo mínimo de tela de qualquer bloco. Na divisão (transcrição nova ou
    // --reagrupar), um bloco mais curto é juntado com o seguinte ou com o anterior
    // (até maxPalavrasPorBloco, sem atravessar pontuação nem pausa); se não der,
    // o bloco seguinte entra mais tarde (até atrasoMaximoDoSeguinteMs). Com
    // --usar-transcricao e na interface, o bloco só é marcado como "revisar".
    tempoMinimoDeTelaMs: 600,

    // A palavra-chave de um destaque precisa ficar visível pelo menos este tempo
    // depois de entrar. Se o bloco seguinte começar antes, a entrada dele é atrasada...
    chaveVisivelMinimaMs: 600,

    // ...em no máximo este tempo. Todo atraso aqui deixa as palavras do bloco
    // seguinte aparecerem DEPOIS de faladas (com 300, 28 de 63 blocos do vídeo de
    // teste entravam até 0,34 s atrasados). Com 0, a legenda acompanha a fala e a
    // palavra-chave fica menos tempo na tela quando a fala seguinte vem logo.
    atrasoMaximoDoSeguinteMs: 0,

    // Se, mesmo com o atraso, a palavra-chave ficar visível menos que isto,
    // outra palavra do bloco vira a palavra-chave.
    chaveVisivelAceitavelMs: 400,
  },

  // Ajuste global de sincronia das legendas, em milissegundos: positivo atrasa,
  // negativo adianta todas as legendas (e os efeitos sonoros junto). Valor padrão;
  // na interface ("Sincronia") cada projeto pode ter o seu, salvo no transcricao.json.
  sincroniaMs: 0,
};

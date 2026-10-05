// Posição das legendas na tela. Funções puras: a prévia e o render usam as mesmas.

// Centro do bloco, em % da largura (x) e da altura (y) do vídeo.
export type Posicao = {x: number; y: number};

// Sem posição salva: centralizado a 68% da altura.
export const POSICAO_PADRAO: Posicao = {x: 50, y: 68};

// Botões de predefinição da barra de cima.
export const PREDEFINICOES: {nome: string; posicao: Posicao}[] = [
  {nome: "Em cima", posicao: {x: 50, y: 22}},
  {nome: "Meio", posicao: {x: 50, y: 50}},
  {nome: "Embaixo", posicao: {x: 50, y: 78}},
];

// Margem segura: nenhum bloco sai desta área (em % do vídeo).
export const MARGEM_SEGURA = {xMin: 5, xMax: 95, yMin: 8, yMax: 92};

// Ao arrastar, o centro gruda no meio da largura a menos desta distância (em %).
export const ENCAIXE_NO_CENTRO = 1.5;

const limitar = (valor: number, minimo: number, maximo: number): number => Math.min(maximo, Math.max(minimo, valor));

const arredondar = (valor: number): number => Math.round(valor * 10) / 10;

// Ponto escolhido ao arrastar: dentro da margem segura e com encaixe no centro horizontal.
export const posicaoArrastada = (posicao: Posicao): Posicao => {
  const x = Math.abs(posicao.x - 50) <= ENCAIXE_NO_CENTRO ? 50 : posicao.x;
  return {
    x: arredondar(limitar(x, MARGEM_SEGURA.xMin, MARGEM_SEGURA.xMax)),
    y: arredondar(limitar(posicao.y, MARGEM_SEGURA.yMin, MARGEM_SEGURA.yMax)),
  };
};

// Centro (em %) em que um bloco de larguraPx × alturaPx cabe inteiro na margem
// segura: o mais perto possível do ponto pedido. Mais largo (ou alto) que a área
// toda: fica no meio dela.
export const centroDentroDaMargem = (
  posicao: Posicao,
  larguraPx: number,
  alturaPx: number,
  videoLargura: number,
  videoAltura: number,
): Posicao => {
  const eixo = (centro: number, tamanhoPx: number, total: number, minimo: number, maximo: number): number => {
    const metade = (tamanhoPx / 2 / total) * 100;
    const de = minimo + metade;
    const ate = maximo - metade;
    return de > ate ? (minimo + maximo) / 2 : limitar(centro, de, ate);
  };
  return {
    x: eixo(posicao.x, larguraPx, videoLargura, MARGEM_SEGURA.xMin, MARGEM_SEGURA.xMax),
    y: eixo(posicao.y, alturaPx, videoAltura, MARGEM_SEGURA.yMin, MARGEM_SEGURA.yMax),
  };
};

// Posição de um bloco: a própria, senão a geral do vídeo, senão a padrão.
export const posicaoDoBloco = (propria: Posicao | undefined, geral: Posicao | undefined): Posicao =>
  propria ?? geral ?? POSICAO_PADRAO;

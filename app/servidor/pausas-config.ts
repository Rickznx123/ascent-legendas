// "Remover pausas" (PLANO-CORTES.md, Bloco 3): o que conta como pausa.
export const PAUSAS_CONFIG = {
  // Abaixo deste volume é silêncio.
  limiarDb: -35,
  // Silêncio mais curto que isso não é cortado.
  minimaMs: 500,
  // Fica de cada lado da fala, para não cortar sílaba.
  margemMs: 120,
};

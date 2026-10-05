// Ajustes dos efeitos sonoros (pasta sons/). Valores em milissegundos.
export const SONS_CONFIG = {
  // Antecipação por arquivo de sons/destaque/: quanto antes da entrada da
  // palavra-chave o som começa. Chave: nome do arquivo. Sem entrada: 0 (começa
  // no quadro em que a palavra-chave entra).
  antecipacaoMs: {
    "whoosh.wav": 200,
  } as Record<string, number>,

  // Som de linear (typing) que passa do fim do bloco: é cortado com este fade.
  fadeDoCorteMs: 60,
};

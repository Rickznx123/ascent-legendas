// Planos pagos: Básico, Pro e Editor (migração 009). O plano do perfil continua
// "gratis" ou "assinante"; o nível diz quantos minutos o assinante exporta por ciclo
// e quanto custa. Todos sem marca d'água e com as mesmas transcrições por dia.
// Valores e minutos vêm do ambiente (sem eles, os padrões abaixo):
//   ASSINATURA_VALOR_BRL      preço do Básico (o plano de antes; padrão 30)
//   PLANO_PRO_VALOR_BRL       padrão 49.90
//   PLANO_EDITOR_VALOR_BRL    padrão 79.90
//   PLANO_BASICO_MINUTOS, PLANO_PRO_MINUTOS, PLANO_EDITOR_MINUTOS   padrão 30, 60, 120
// Lidos a cada uso (função), porque o .env é carregado depois dos imports.

export const NIVEIS = ["basico", "pro", "editor"] as const;
export type Nivel = (typeof NIVEIS)[number];

export type PlanoPago = {nivel: Nivel; nome: string; valor: number; minutos: number};

const NOMES: Record<Nivel, string> = {basico: "Básico", pro: "Pro", editor: "Editor"};
const PADRAO: Record<Nivel, {valor: number; minutos: number; varValor: string; varMinutos: string}> = {
  basico: {valor: 30, minutos: 30, varValor: "ASSINATURA_VALOR_BRL", varMinutos: "PLANO_BASICO_MINUTOS"},
  pro: {valor: 49.9, minutos: 60, varValor: "PLANO_PRO_VALOR_BRL", varMinutos: "PLANO_PRO_MINUTOS"},
  editor: {valor: 79.9, minutos: 120, varValor: "PLANO_EDITOR_VALOR_BRL", varMinutos: "PLANO_EDITOR_MINUTOS"},
};

const positivo = (texto: string | undefined, padrao: number): number => {
  const numero = Number(texto?.trim().replace(",", "."));
  return texto?.trim() && Number.isFinite(numero) && numero > 0 ? numero : padrao;
};

// Os três planos, do menor para o maior.
export const planosPagos = (): PlanoPago[] =>
  NIVEIS.map((nivel) => {
    const {valor, minutos, varValor, varMinutos} = PADRAO[nivel];
    return {
      nivel,
      nome: NOMES[nivel],
      valor: Math.round(positivo(process.env[varValor], valor) * 100) / 100,
      minutos: positivo(process.env[varMinutos], minutos),
    };
  });

export const planoPago = (nivel: Nivel): PlanoPago => planosPagos().find((plano) => plano.nivel === nivel)!;

export const nivelValido = (texto: unknown): texto is Nivel => NIVEIS.includes(texto as Nivel);

// Nível de um valor cobrado (o Mercado Pago diz quanto cobrou; nunca o navegador).
// Sem plano com esse valor: undefined (o nível não muda e o caso fica no log).
export const nivelPeloValor = (valor: number | null | undefined): Nivel | undefined =>
  valor === null || valor === undefined ? undefined : planosPagos().find((plano) => Math.abs(plano.valor - Number(valor)) < 0.005)?.nivel;

// -1, 0 ou 1: a ordem dos níveis (para subir ou descer).
export const compararNiveis = (a: Nivel, b: Nivel): number => Math.sign(NIVEIS.indexOf(a) - NIVEIS.indexOf(b));

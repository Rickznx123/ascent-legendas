// Cupons de desconto (migração 013). O servidor busca e valida o cupom a cada pedido
// (o navegador só manda o código); o valor com desconto é calculado aqui. O uso conta
// quando o pagamento é aprovado (veja pagamento-aprovado.ts), uma vez por checkout.
import type {SupabaseClient} from "@supabase/supabase-js";

export type Cupom = {
  codigo: string;
  percentual: number;
  so_primeiro_mes: boolean;
  valido_ate: string | null;
  max_usos: number | null;
  usos: number;
  ativo: boolean;
};

// O que a tela recebe de um cupom aplicado.
export type VistaDoCupom = {codigo: string; percentual: number; soPrimeiroMes: boolean};

// "bemvindo20 " → "BEMVINDO20"; fora do formato: undefined (nem consulta o banco).
export const codigoDoCupom = (texto: unknown): string | undefined => {
  const codigo = String(texto ?? "").trim().toUpperCase();
  return /^[A-Z0-9_-]{1,40}$/u.test(codigo) ? codigo : undefined;
};

// Por que o cupom não vale agora (para a tela); vale: undefined.
export const motivoDoCupom = (cupom: Cupom | undefined, agora: Date): string | undefined => {
  if (!cupom || !cupom.ativo) return "Cupom inválido. Confira o código.";
  if (cupom.valido_ate && new Date(cupom.valido_ate) <= agora) return "Este cupom venceu.";
  if (cupom.max_usos !== null && cupom.usos >= cupom.max_usos) return "Este cupom esgotou.";
  return undefined;
};

// Valor com o desconto, em centavos inteiros (o mesmo cálculo na tela e no servidor).
export const valorComDesconto = (valor: number, percentual: number): number => Math.round(valor * (100 - percentual)) / 100;

export const vistaDoCupom = (cupom: Cupom): VistaDoCupom => ({codigo: cupom.codigo, percentual: Number(cupom.percentual), soPrimeiroMes: cupom.so_primeiro_mes});

export const cuponsNoSupabase = (admin: SupabaseClient) => ({
  // Um cupom válido agora, ou um erro com a mensagem para a tela.
  validar: async (texto: unknown, agora = new Date()): Promise<Cupom> => {
    const codigo = codigoDoCupom(texto);
    let cupom: Cupom | undefined;
    if (codigo) {
      const {data, error} = await admin.from("cupons").select("codigo, percentual, so_primeiro_mes, valido_ate, max_usos, usos, ativo").eq("codigo", codigo).maybeSingle();
      if (error) console.log(`Cupom: ler ${codigo}: ${error.message}`);
      cupom = (data as Cupom | null) ?? undefined;
    }
    const motivo = motivoDoCupom(cupom, agora);
    if (motivo) throw new Error(motivo);
    return cupom!;
  },
  // Conta um uso (referencia: assinatura-<id> ou pix-<id>; repetida não conta de novo).
  contarUso: async (codigo: string, referencia: string): Promise<void> => {
    const {error} = await admin.rpc("contar_uso_do_cupom", {p_codigo: codigo, p_referencia: referencia});
    if (error) throw new Error(`Cupom: contar o uso de ${codigo} (${referencia}): ${error.message}`);
  },
});

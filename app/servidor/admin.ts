// Painel do dono (/admin): quem assina ou já assinou, com e-mail, WhatsApp (do
// cadastro, em user_metadata), plano, forma de pagamento, validade e quanto pagou;
// e os leads (contas que nunca assinaram), para chamar no privado.
// Só as contas de DONOS veem; para as outras, a rota responde 404.
import type {SupabaseClient} from "@supabase/supabase-js";
import {planoEfetivo} from "./assinaturas";
import type {PerfilDaAssinatura} from "./assinaturas";
import {nivelValido, planoPago} from "./planos";

const DONOS = ["ricksantos1428@gmail.com"];

export const ehDono = (email: string): boolean => DONOS.includes(email.trim().toLowerCase());

export type Assinante = {
  email: string;
  whatsapp: string | null;
  plano: string;
  forma: string;
  ativo: boolean;
  expira: string | null;
  pago: number;
  desde: string | null;
};

export type Lead = {
  email: string;
  whatsapp: string | null;
  cadastro: string;
  // Abriu um checkout (Pix ou cartão) que não foi pago.
  checkout: boolean;
};

const FORMAS: Record<string, string> = {pix: "Pix", assinatura: "Cartão", manual: "Cortesia"};

export const painelDoDono = async (admin: SupabaseClient): Promise<{assinantes: Assinante[]; leads: Lead[]}> => {
  const [perfis, pix, cartao, tentativas] = await Promise.all([
    admin.from("perfis").select("id, plano, plano_origem, plano_ate, ciclo_inicio, ciclo_fim, nivel").or("plano.eq.assinante,plano_ate.not.is.null"),
    admin.from("pix_pagamentos").select("usuario_id, valor, aprovado_em, status"),
    admin.from("pagamentos_assinatura").select("usuario_id, valor, pago_em").eq("status", "approved"),
    admin.from("assinaturas").select("usuario_id"),
  ]);
  for (const {error} of [perfis, pix, cartao, tentativas]) if (error) throw new Error(`Não deu para ler os assinantes: ${error.message}`);

  const pagos = new Map<string, {total: number; primeiro: string | null}>();
  for (const p of [...(pix.data ?? []).filter((l) => l.status === "aprovado").map((l) => ({...l, em: l.aprovado_em})), ...(cartao.data ?? []).map((l) => ({...l, em: l.pago_em}))]) {
    const atual = pagos.get(p.usuario_id) ?? {total: 0, primeiro: null};
    atual.total += Number(p.valor ?? 0);
    if (p.em && (!atual.primeiro || p.em < atual.primeiro)) atual.primeiro = p.em;
    pagos.set(p.usuario_id, atual);
  }

  // shortcut: lê até 10 mil contas (10 páginas); passar disso, buscar só os ids dos assinantes.
  const usuarios = new Map<string, {email: string; whatsapp: string | null; cadastro: string}>();
  for (let pagina = 1; pagina <= 10; pagina++) {
    const {data, error} = await admin.auth.admin.listUsers({page: pagina, perPage: 1000});
    if (error) throw new Error(`Não deu para ler as contas: ${error.message}`);
    for (const u of data.users) usuarios.set(u.id, {email: u.email ?? "", whatsapp: (u.user_metadata?.whatsapp as string | undefined) ?? null, cadastro: u.created_at});
    if (data.users.length < 1000) break;
  }

  const agora = new Date();
  const assinantes = (perfis.data ?? [])
    .map((linha) => {
      const u = usuarios.get(linha.id);
      const pago = pagos.get(linha.id);
      return {
        email: u?.email ?? linha.id,
        whatsapp: u?.whatsapp ?? null,
        plano: nivelValido(linha.nivel) ? planoPago(linha.nivel).nome : "Assinante",
        forma: FORMAS[linha.plano_origem] ?? linha.plano_origem,
        ativo: planoEfetivo(linha as PerfilDaAssinatura, agora) === "assinante",
        expira: linha.plano_ate,
        pago: Math.round((pago?.total ?? 0) * 100) / 100,
        desde: pago?.primeiro ?? null,
      };
    })
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || (b.expira ?? "").localeCompare(a.expira ?? ""));

  const jaAssinaram = new Set((perfis.data ?? []).map((linha) => linha.id));
  const tentaram = new Set([...(pix.data ?? []), ...(tentativas.data ?? [])].map((l) => l.usuario_id));
  const leads = [...usuarios]
    .filter(([id, u]) => !jaAssinaram.has(id) && !ehDono(u.email))
    .map(([id, u]) => ({...u, checkout: tentaram.has(id)}))
    .sort((a, b) => b.cadastro.localeCompare(a.cadastro));
  return {assinantes, leads};
};

// npx tsx scripts/email-render-corrigido.ts [--enviar]
// Aviso único a quem teve a exportação falhando e nunca conseguiu exportar (o bug do
// 4K, corrigido em 79703f8): "corrigimos, exporte de novo". Sem --enviar, só lista.
// Precisa da migração 016 (perfis.aviso_render_em: cada conta recebe uma vez só) e
// do RESEND_API_KEY no .env. Pula quem já exportou, assinou ou saiu da lista.
import path from "node:path";
import {createClient} from "@supabase/supabase-js";
import {carregarEnv} from "../src/motor/env";
import {emailsDeRecuperacao} from "../app/servidor/recuperacao";

carregarEnv(path.resolve(import.meta.dirname, ".."));
const enviar = process.argv.includes("--enviar");
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {auth: {persistSession: false, autoRefreshToken: false}});

const {data: renders, error} = await admin.from("renders").select("usuario_id, situacao");
if (error) throw new Error(error.message);
const falhou = new Set(renders.filter((r) => r.situacao === "falhou").map((r) => r.usuario_id as string));
const pronto = new Set(renders.filter((r) => r.situacao === "pronto").map((r) => r.usuario_id as string));
const {data: perfis, error: erroDosPerfis} = await admin
  .from("perfis")
  .select("id, plano, aviso_render_em, emails_desligados_em")
  .in("id", [...falhou].filter((id) => !pronto.has(id)));
if (erroDosPerfis) throw new Error(`${erroDosPerfis.message} (a migração 016 já rodou?)`);
const alvos = perfis.filter((p) => p.plano === "gratis" && !p.aviso_render_em && !p.emails_desligados_em);
console.log(`${alvos.length} contas com exportação falha e nenhuma pronta${enviar ? "" : " (sem --enviar: nada é enviado)"}:`);
const emails = emailsDeRecuperacao(admin);
for (const {id} of alvos) {
  const {data} = await admin.auth.admin.getUserById(id);
  console.log(`  ${data.user?.email ?? id}`);
  if (enviar) console.log(`    ${(await emails.enviar(id, "aviso_render", true)) ? "enviado" : "NÃO enviado (veja a linha acima)"}`);
}

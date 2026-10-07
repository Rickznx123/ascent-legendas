// npm run plano -- <email> <gratis|assinante>
// Só para desenvolvimento: muda o plano de uma conta (perfis.plano), para testar
// os limites. Usa a chave secreta do .env: é um script de terminal, sem rota no
// servidor e sem nada acessível pelo navegador. Desde a Etapa 2c, o plano de quem
// assina muda pela assinatura do Mercado Pago; o plano dado aqui fica com a origem
// "manual" (cortesia, para testadores) e os webhooks não mexem nele.
import path from "node:path";
import {createClient} from "@supabase/supabase-js";
import {carregarEnv} from "../src/motor/env";

const PLANOS = ["gratis", "assinante"] as const;
const [email, plano] = process.argv.slice(2);
const uso = "Uso: npm run plano -- <email> <gratis|assinante>";

const principal = async () => {
  if (!email || !plano) {
    throw new Error(uso);
  }
  if (!PLANOS.includes(plano as (typeof PLANOS)[number])) {
    throw new Error(`Plano inválido: ${plano}. Use gratis ou assinante.\n${uso}`);
  }
  carregarEnv(path.resolve(import.meta.dirname, ".."));
  const url = process.env.SUPABASE_URL?.trim();
  const secreta = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secreta) {
    throw new Error("Faltam SUPABASE_URL e SUPABASE_SECRET_KEY no .env.");
  }
  const admin = createClient(url, secreta, {auth: {persistSession: false, autoRefreshToken: false}});

  // A conta pelo e-mail (a lista de usuários vem em páginas).
  const procurado = email.trim().toLowerCase();
  let id: string | undefined;
  for (let pagina = 1; !id; pagina++) {
    const {data, error} = await admin.auth.admin.listUsers({page: pagina, perPage: 200});
    if (error) {
      throw new Error(`Não foi possível listar as contas: ${error.message}`);
    }
    id = data.users.find((u) => u.email?.toLowerCase() === procurado)?.id;
    if (data.users.length < 200) {
      break;
    }
  }
  if (!id) {
    throw new Error(`Nenhuma conta com o e-mail ${email}. A conta é criada no primeiro login.`);
  }

  const {data: antes} = await admin.from("perfis").select("plano").eq("id", id).maybeSingle();
  // Origem "manual": a assinatura do Mercado Pago (webhooks) não mexe neste plano.
  let {error} = await admin.from("perfis").upsert({id, plano, plano_origem: "manual", plano_ate: null}, {onConflict: "id"});
  // Sem as colunas da assinatura (migração 007 ainda não rodou): só o plano.
  if (error && /column|coluna/iu.test(error.message)) {
    ({error} = await admin.from("perfis").upsert({id, plano}, {onConflict: "id"}));
  }
  if (error) {
    throw new Error(`Não foi possível mudar o plano: ${error.message}`);
  }
  console.log(`${email}: plano ${antes?.plano ?? "(sem perfil)"} → ${plano}.`);
  console.log("No app, o novo plano aparece ao recarregar a página.");
};

principal().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});

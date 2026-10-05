// npm run link-login -- <email> <endereço do app>
// Só para desenvolvimento: gera um link de login (link mágico) para o e-mail, com
// retorno para o endereço do app (ex.: http://localhost:5174 ou o do túnel
// https://xxxx.trycloudflare.com), e imprime no terminal. Não envia e-mail (o
// e-mail grátis do Supabase tem limite de envios por hora).
// Usa a chave secreta do .env: é um script de terminal, sem rota no servidor e
// sem nada acessível pelo navegador.
import path from "node:path";
import {createClient} from "@supabase/supabase-js";
import {carregarEnv} from "../src/motor/env";

const [email, endereco] = process.argv.slice(2);
const uso = "Uso: npm run link-login -- <email> <endereço do app>\n  ex.: npm run link-login -- voce@exemplo.com http://localhost:5174";

const principal = async () => {
  if (!email || !endereco) {
    throw new Error(uso);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new Error(`E-mail inválido: ${email}\n${uso}`);
  }
  let retorno: URL;
  try {
    retorno = new URL(endereco);
  } catch {
    throw new Error(`Endereço inválido: ${endereco}\n${uso}`);
  }
  if (retorno.protocol !== "http:" && retorno.protocol !== "https:") {
    throw new Error(`O endereço precisa começar com http:// ou https://: ${endereco}`);
  }

  carregarEnv(path.resolve(import.meta.dirname, ".."));
  const url = process.env.SUPABASE_URL?.trim();
  const secreta = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secreta) {
    throw new Error("Faltam SUPABASE_URL e SUPABASE_SECRET_KEY no .env.");
  }
  const admin = createClient(url, secreta, {auth: {persistSession: false, autoRefreshToken: false}});
  const redirectTo = `${retorno.origin}/`;
  const {data, error} = await admin.auth.admin.generateLink({type: "magiclink", email, options: {redirectTo}});
  if (error) {
    throw new Error(`O Supabase não gerou o link: ${error.message}`);
  }

  console.log(`\nLink de login para ${email} (volta para ${redirectTo}):\n`);
  console.log(data.properties.action_link);
  console.log(
    "\nAtenção: este link é pessoal e de uso único. Quem abrir entra na conta de " +
      `${email}. Não compartilhe; depois de usado (ou vencido: 1 hora, por padrão), gere outro.`,
  );
  console.log(
    "Se o link voltar para a Site URL (ex.: localhost) em vez deste endereço, o endereço\n" +
      "não está em Authentication > URL Configuration > Redirect URLs no painel do Supabase.\n",
  );
};

principal().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});

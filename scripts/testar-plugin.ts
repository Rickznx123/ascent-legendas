// npx tsx scripts/testar-plugin.ts <email> <áudio> [endereço do servidor]
// Faz o caminho do plugin do Premiere contra um servidor rodando (npm run app), como o painel fará:
// config, login, envio do áudio em partes para o S3, transcrição com origem "plugin", andamento e blocos.
// Login: com PLUGIN_SENHA no ambiente, por e-mail e senha (como o painel). Sem ela, só para desenvolvimento,
// por link mágico gerado com a chave secreta do .env (como o npm run link-login; não envia e-mail).
// Grava os blocos em <áudio>.blocos.json. Contrato: ascent-legendas-premiere/API-PLUGIN.md.
import {readFileSync, statSync, writeFileSync} from "node:fs";
import path from "node:path";
import {createClient} from "@supabase/supabase-js";
import {carregarEnv} from "../src/motor/env";

const [email, arquivo, endereco = "http://localhost:5174"] = process.argv.slice(2);

const json = async <T>(resposta: Response): Promise<T> => {
  const corpo = (await resposta.json().catch(() => ({}))) as T & {mensagem?: string};
  if (!resposta.ok) throw new Error(`${resposta.status}: ${corpo.mensagem ?? resposta.statusText}`);
  return corpo;
};

const principal = async () => {
  if (!email || !arquivo) throw new Error("Uso: npx tsx scripts/testar-plugin.ts <email> <áudio .wav/.m4a/.mp3/.aac> [endereço]");
  const inicio = Date.now();
  const tempo = () => `${((Date.now() - inicio) / 1000).toFixed(1)} s`;

  // 1. Config pública: endereço do Supabase e chave pública (a mesma que o app usa no navegador).
  const config = await json<{login: boolean; supabaseUrl?: string; chavePublica?: string; envioDireto?: boolean}>(await fetch(`${endereco}/api/config`));
  if (!config.login || !config.supabaseUrl || !config.chavePublica || !config.envioDireto) throw new Error("O servidor está sem login ou sem envio ao S3.");

  // 2. Login no Supabase.
  let token: string;
  const senha = process.env.PLUGIN_SENHA;
  if (senha) {
    const sessao = await json<{access_token: string}>(
      await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {apikey: config.chavePublica, "Content-Type": "application/json"},
        body: JSON.stringify({email, password: senha}),
      }),
    );
    token = sessao.access_token;
  } else {
    carregarEnv(path.resolve(import.meta.dirname, ".."));
    const admin = createClient(config.supabaseUrl, process.env.SUPABASE_SECRET_KEY!, {auth: {persistSession: false}});
    const {data, error} = await admin.auth.admin.generateLink({type: "magiclink", email});
    if (error) throw new Error(`Link mágico: ${error.message}`);
    const publico = createClient(config.supabaseUrl, config.chavePublica, {auth: {persistSession: false}});
    const verificado = await publico.auth.verifyOtp({token_hash: data.properties.hashed_token, type: "magiclink"});
    if (verificado.error || !verificado.data.session) throw new Error(`Login: ${verificado.error?.message ?? "sem sessão"}`);
    token = verificado.data.session.access_token;
  }
  const api = (rota: string, corpo?: unknown) =>
    fetch(`${endereco}${rota}`, {
      method: corpo === undefined ? "GET" : "POST",
      headers: {Authorization: `Bearer ${token}`, ...(corpo === undefined ? {} : {"Content-Type": "application/json"})},
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  console.log(`[${tempo()}] Entrou como ${email}.`);

  // 3. Envio do áudio em partes direto para o S3 (o nome leva "premiere-" para achar no log e no S3).
  const dados = readFileSync(arquivo);
  const nome = `premiere-${Date.now()}${path.extname(arquivo).toLowerCase()}`;
  const aberto = await json<{chave: string; envio: string; tamanhoDaParte: number; partes: number}>(
    await api("/api/envio/iniciar", {nome, tamanho: statSync(arquivo).size}),
  );
  const numeros = Array.from({length: aberto.partes}, (_, i) => i + 1);
  const {enderecos} = await json<{enderecos: {numero: number; url: string}[]}>(
    await api("/api/envio/assinar", {chave: aberto.chave, envio: aberto.envio, partes: numeros}),
  );
  const partes = await Promise.all(
    enderecos.map(async ({numero, url}) => {
      const parte = dados.subarray((numero - 1) * aberto.tamanhoDaParte, numero * aberto.tamanhoDaParte);
      const resposta = await fetch(url, {method: "PUT", body: parte});
      if (!resposta.ok) throw new Error(`Parte ${numero}: ${resposta.status}`);
      return {numero, etag: resposta.headers.get("etag")!};
    }),
  );
  const concluido = await json<{nome: string; duracaoS: number}>(await api("/api/envio/concluir", {chave: aberto.chave, envio: aberto.envio, partes}));
  console.log(`[${tempo()}] Áudio enviado: ${concluido.nome}, ${concluido.duracaoS.toFixed(1)} s.`);

  // 4. Transcrição e andamento.
  await json(await api("/api/transcrever", {video: nome, origem: "plugin"}));
  let ultima = "";
  for (;;) {
    const estado = await json<{estado: string; etapa?: string; mensagem?: string; blocos?: unknown[]; avisos?: string[]}>(
      await api(`/api/transcricao?video=${encodeURIComponent(nome)}`),
    );
    const linha = `${estado.estado}${estado.etapa ? `: ${estado.etapa}` : ""}`;
    if (linha !== ultima) console.log(`[${tempo()}] ${linha}`);
    ultima = linha;
    if (estado.estado === "falhou") throw new Error(estado.mensagem);
    if (estado.estado === "pronta") {
      console.log(`[${tempo()}] Pronto: ${estado.blocos?.length} blocos${estado.avisos?.length ? ` (avisos: ${estado.avisos.join("; ")})` : ""}.`);
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // 5. Os mesmos blocos lidos de novo pela rota do plugin.
  const lidos = await json<{blocos: unknown[]}>(await api(`/api/plugin/blocos?audio=${encodeURIComponent(nome)}`));
  const saida = `${arquivo}.blocos.json`;
  writeFileSync(saida, `${JSON.stringify(lidos, null, 2)}\n`);
  console.log(`[${tempo()}] GET /api/plugin/blocos: ${lidos.blocos.length} blocos, gravados em ${saida}.`);
};

principal().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});

// Sessão do usuário no navegador, pelo Supabase (só a chave publicável vem do
// servidor; a secreta nunca chega aqui). A sessão fica no localStorage do
// navegador e continua ao recarregar; o Supabase renova o token sozinho.
// Sem login no servidor (sem Supabase no .env), nada disto é usado.
import {createClient} from "@supabase/supabase-js";
import type {Session, SupabaseClient} from "@supabase/supabase-js";

export type ConfigDoLogin = {login: boolean; supabaseUrl?: string; chavePublica?: string; google?: boolean; envioDireto?: boolean};

let cliente: SupabaseClient | undefined;
let tokenAtual: string | undefined;
let usuarioAtual: string | undefined;
let envioDiretoLigado = false;

// O cookie leva o token nos pedidos que o navegador faz sozinho (o vídeo da
// prévia, os sons, o download): eles não mandam o cabeçalho Authorization.
const guardarToken = (sessao: Session | null) => {
  tokenAtual = sessao?.access_token;
  usuarioAtual = sessao?.user.id;
  document.cookie = tokenAtual
    ? `sessao=${encodeURIComponent(tokenAtual)}; Path=/; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}`
    : "sessao=; Path=/; Max-Age=0; SameSite=Strict";
};

// Token para o cabeçalho Authorization dos pedidos à API (sem login: nenhum).
export const tokenDaSessao = (): string | undefined => tokenAtual;

// Conta logada (separa os envios interrompidos de cada conta neste aparelho).
export const usuarioDaSessao = (): string | undefined => usuarioAtual;

// O vídeo vai do navegador direto para o S3 (o servidor diz em /api/config).
export const envioDireto = (): boolean => envioDiretoLigado;

export const lerConfig = async (): Promise<ConfigDoLogin> => {
  const resposta = await fetch("/api/config");
  if (!resposta.ok) {
    throw new Error(`O servidor não respondeu (${resposta.status}).`);
  }
  const config = (await resposta.json()) as ConfigDoLogin;
  envioDiretoLigado = Boolean(config.envioDireto);
  return config;
};

// Prepara o cliente (uma vez só) e devolve a sessão salva, ou a que veio no link
// do e-mail.
let iniciando: Promise<Session | null> | undefined;
export const iniciarSessao = (config: ConfigDoLogin): Promise<Session | null> => {
  iniciando ??= iniciar(config);
  return iniciando;
};

// aoMudar: chamado quando a pessoa entra, sai ou o token é renovado. Devolve a
// função que para de ouvir.
export const ouvirSessao = (aoMudar: (sessao: Session | null) => void): (() => void) => {
  if (!cliente) {
    return () => undefined;
  }
  const {data} = cliente.auth.onAuthStateChange((_evento, sessao) => aoMudar(sessao));
  return () => data.subscription.unsubscribe();
};

const iniciar = async (config: ConfigDoLogin): Promise<Session | null> => {
  if (!config.login || !config.supabaseUrl || !config.chavePublica) {
    return null;
  }
  cliente = createClient(config.supabaseUrl, config.chavePublica, {
    // implicit: o link do e-mail funciona aberto em qualquer navegador ou aparelho
    // (o PKCE exigiria abrir no mesmo navegador em que o link foi pedido).
    auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit"},
  });
  const {data} = await cliente.auth.getSession();
  guardarToken(data.session);
  // O token do cabeçalho e do cookie acompanha cada renovação.
  cliente.auth.onAuthStateChange((_evento, sessao) => guardarToken(sessao));
  // O link do e-mail traz a sessão no endereço: tira do endereço depois de lida.
  if (location.hash.includes("access_token") || location.search.includes("code=")) {
    history.replaceState(null, "", location.pathname);
  }
  return data.session;
};

// Link mágico: o Supabase manda um e-mail; o link volta para este endereço.
export const enviarLinkMagico = async (email: string): Promise<void> => {
  const {error} = await cliente!.auth.signInWithOtp({
    email,
    options: {emailRedirectTo: `${location.origin}/`, shouldCreateUser: true},
  });
  if (error) {
    throw new Error(error.message);
  }
};

export const entrarComGoogle = async (): Promise<void> => {
  const {error} = await cliente!.auth.signInWithOAuth({provider: "google", options: {redirectTo: `${location.origin}/`}});
  if (error) {
    throw new Error(error.message);
  }
};

export const sair = async (): Promise<void> => {
  await cliente?.auth.signOut();
  guardarToken(null);
};

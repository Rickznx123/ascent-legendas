// Sessão do usuário no navegador, pelo Supabase, com e-mail e senha (só a chave publicável vem do
// servidor; a secreta nunca chega aqui). A sessão fica no localStorage do
// navegador e continua ao recarregar; o Supabase renova o token sozinho.
// Sem login no servidor (sem Supabase no .env), nada disto é usado.
import {createClient} from "@supabase/supabase-js";
import type {Session, SupabaseClient} from "@supabase/supabase-js";
import type {PlanosDaApresentacao} from "../servidor/servidor";

// planos: os números da página de apresentação (só com login no servidor).
export type ConfigDoLogin = {
  login: boolean;
  supabaseUrl?: string;
  chavePublica?: string;
  google?: boolean;
  envioDireto?: boolean;
  planos?: PlanosDaApresentacao;
};

let cliente: SupabaseClient | undefined;
let tokenAtual: string | undefined;
let usuarioAtual: string | undefined;
let envioDiretoLigado = false;
// O endereço veio do link de redefinição de senha (a tela pede a senha nova).
let veioDaRedefinicao = false;

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
  // O link do e-mail (confirmação do cadastro ou redefinição de senha) traz a sessão
  // no endereço: tira do endereço depois de lida.
  if (location.hash.includes("access_token") || location.search.includes("code=")) {
    veioDaRedefinicao = location.hash.includes("type=recovery");
    history.replaceState(null, "", location.pathname);
  }
  return data.session;
};

// A sessão aberta agora veio do link "Esqueci minha senha": falta a senha nova.
// Lido uma vez só (depois de definida, o app segue normal).
export const pedeSenhaNova = (): boolean => {
  const pede = veioDaRedefinicao;
  veioDaRedefinicao = false;
  return pede;
};

// Aberto como app instalado (Tela de Início), e não no navegador. Os links do e-mail
// (confirmação e redefinição de senha) abrem no Safari, não no app instalado: a tela
// avisa para voltar ao app e entrar com a senha.
export const noAppInstalado = (): boolean =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & {standalone?: boolean}).standalone === true;

// Erros do Supabase em português claro (pelo código; sem código, pela mensagem).
export const SENHA_MINIMA = 8;
const traduzir = (erro: {code?: string; status?: number; message?: string}): Error => {
  const codigo = erro.code ?? "";
  const texto = (erro.message ?? "").toLowerCase();
  if (codigo === "invalid_credentials" || texto.includes("invalid login credentials")) {
    return new Error(
      "E-mail ou senha incorretos. Se a sua conta foi criada pelo link do e-mail e ainda não tem senha, use \"Esqueci minha senha\" para criar uma.",
    );
  }
  if (codigo === "email_not_confirmed" || texto.includes("email not confirmed")) {
    return new Error("Confirme o seu e-mail antes de entrar: toque no link que enviamos. Não chegou? Crie a conta de novo para reenviar.");
  }
  if (codigo === "user_already_exists" || codigo === "email_exists" || texto.includes("already registered")) {
    return new Error("Este e-mail já tem conta. Entre com a sua senha ou use \"Esqueci minha senha\".");
  }
  if (erro.status === 429 || codigo.startsWith("over_") || texto.includes("rate limit")) {
    return new Error("Muitas tentativas seguidas. Espere alguns minutos e tente de novo.");
  }
  if (codigo === "weak_password" || texto.includes("password should be")) {
    return new Error(`Senha fraca: use pelo menos ${SENHA_MINIMA} caracteres.`);
  }
  if (codigo === "same_password") {
    return new Error("A senha nova precisa ser diferente da atual.");
  }
  if (codigo === "validation_failed" || texto.includes("invalid format")) {
    return new Error("Confira o e-mail: ele parece incompleto.");
  }
  return new Error(`Não deu certo agora (${erro.message ?? "erro desconhecido"}). Tente de novo.`);
};

// Para onde os links do e-mail (confirmação e redefinição) voltam.
const voltaDoEmail = () => `${location.origin}/`;

export const entrar = async (email: string, senha: string): Promise<void> => {
  const {error} = await cliente!.auth.signInWithPassword({email, password: senha});
  if (error) throw traduzir(error);
};

// Cria a conta; o Supabase manda o link de confirmação (uma vez só por conta).
// Devolve o id da conta nova.
export const criarConta = async (email: string, senha: string): Promise<string | undefined> => {
  const {data, error} = await cliente!.auth.signUp({email, password: senha, options: {emailRedirectTo: voltaDoEmail()}});
  if (error) throw traduzir(error);
  // E-mail que já tem conta confirmada: o Supabase não dá erro (para não revelar
  // quem tem conta), mas devolve o usuário sem identidades.
  if (data.user && (data.user.identities ?? []).length === 0) {
    throw traduzir({code: "user_already_exists"});
  }
  return data.user?.id;
};

export const reenviarConfirmacao = async (email: string): Promise<void> => {
  const {error} = await cliente!.auth.resend({type: "signup", email, options: {emailRedirectTo: voltaDoEmail()}});
  if (error) throw traduzir(error);
};

// "Esqueci minha senha" (vale também para contas antigas, criadas pelo link, sem senha).
export const pedirRedefinicao = async (email: string): Promise<void> => {
  const {error} = await cliente!.auth.resetPasswordForEmail(email, {redirectTo: voltaDoEmail()});
  if (error) throw traduzir(error);
};

// Senha nova da conta que está entrada (redefinição ou "Trocar senha").
export const definirSenha = async (senha: string): Promise<void> => {
  const {error} = await cliente!.auth.updateUser({password: senha});
  if (error) throw traduzir(error);
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

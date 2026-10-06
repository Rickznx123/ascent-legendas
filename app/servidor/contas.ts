// Contas (login) pelo Supabase. Só no servidor: a chave secreta nunca sai daqui.
// Sem SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e SUPABASE_SECRET_KEY no .env, o app
// roda no modo local, sem login (contasDoAmbiente devolve undefined).
import {createClient} from "@supabase/supabase-js";
import type {SupabaseClient} from "@supabase/supabase-js";

export type Plano = "gratis" | "assinante";

export type Usuario = {id: string; email: string};

export type Perfil = {nome: string | null; plano: Plano};

// O que a tela pode saber (a chave publicável é pública por definição).
export type ConfigDoLogin = {
  login: boolean;
  supabaseUrl?: string;
  chavePublica?: string;
  // Botão "Entrar com Google": só com LOGIN_GOOGLE=1 no .env (depois de configurar
  // o Google no painel do Supabase).
  google?: boolean;
  // O vídeo vai do navegador direto para o S3, em partes (Etapa 3).
  envioDireto?: boolean;
};

export type Contas = {
  config: ConfigDoLogin;
  // Usuário do token (o access_token da sessão do Supabase) ou erro.
  validar: (token: string) => Promise<Usuario>;
  // Cliente com o token do usuário: as consultas passam pelo RLS como ele.
  doUsuario: (token: string) => SupabaseClient;
  // Cliente com a chave secreta (ignora o RLS): só para o que o usuário não pode
  // fazer sozinho (registrar exportações, criar um perfil que faltou).
  admin: SupabaseClient;
  perfil: (usuario: Usuario, token: string) => Promise<Perfil>;
};

// Um token validado vale por este tempo sem perguntar de novo ao Supabase.
const CACHE_DO_TOKEN_MS = 60_000;

const semSessao = {auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}};

export const contasDoAmbiente = (): Contas | undefined => {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/u, "");
  const chavePublica = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const chaveSecreta = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !chavePublica || !chaveSecreta) {
    return undefined;
  }
  const publico = createClient(url, chavePublica, semSessao);
  const admin = createClient(url, chaveSecreta, semSessao);
  const cache = new Map<string, {usuario: Usuario; ate: number}>();

  const validar = async (token: string): Promise<Usuario> => {
    const guardado = cache.get(token);
    if (guardado && guardado.ate > Date.now()) {
      return guardado.usuario;
    }
    const {data, error} = await publico.auth.getUser(token);
    if (error || !data.user) {
      cache.delete(token);
      throw new Error("Sessão inválida ou expirada. Entre de novo.");
    }
    const usuario = {id: data.user.id, email: data.user.email ?? ""};
    // Limpa os vencidos de vez em quando (tokens renovados a cada hora).
    if (cache.size > 500) {
      for (const [chave, valor] of cache) {
        if (valor.ate <= Date.now()) cache.delete(chave);
      }
    }
    cache.set(token, {usuario, ate: Date.now() + CACHE_DO_TOKEN_MS});
    return usuario;
  };

  const doUsuario = (token: string) =>
    createClient(url, chavePublica, {...semSessao, global: {headers: {Authorization: `Bearer ${token}`}}});

  const perfil = async (usuario: Usuario, token: string): Promise<Perfil> => {
    const {data, error} = await doUsuario(token).from("perfis").select("nome, plano").eq("id", usuario.id).maybeSingle();
    if (error) {
      throw new Error(`Não foi possível ler o perfil: ${error.message}`);
    }
    if (data) {
      return data as Perfil;
    }
    // O trigger de cadastro não criou o perfil (veja 002_perfil_sem_travar_cadastro.sql):
    // cria agora, no plano grátis.
    const novo = {id: usuario.id, nome: usuario.email.split("@")[0] || null};
    const {error: erroAoCriar} = await admin.from("perfis").upsert(novo, {onConflict: "id", ignoreDuplicates: true});
    if (erroAoCriar) {
      throw new Error(`Não foi possível criar o perfil: ${erroAoCriar.message}`);
    }
    return {nome: novo.nome, plano: "gratis"};
  };

  return {
    config: {login: true, supabaseUrl: url, chavePublica, google: process.env.LOGIN_GOOGLE?.trim() === "1"},
    validar,
    doUsuario,
    admin,
    perfil,
  };
};

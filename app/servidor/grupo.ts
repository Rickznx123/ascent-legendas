// Banner do grupo do WhatsApp na tela inicial (migração 018), só para assinantes
// ativos. Some de vez quando a pessoa clica em "Entrar no grupo"; fechado no ✕, volta
// depois de 3 dias, até 3 vezes. Guardado no perfil, vale em qualquer aparelho.
//   WHATSAPP_GRUPO_URL  link do grupo (vazio: sem banner)
// Sem a migração 018, a leitura falha e o banner simplesmente não aparece.
import type {SupabaseClient} from "@supabase/supabase-js";
import {ehDono} from "./admin";
import type {Plano, Usuario} from "./contas";
import {registrarEvento} from "./eventos";

const SEM_BANNER = ["maiara.taufmann@hotmail.com"];
const VOLTA_DEPOIS_MS = 3 * 24 * 60 * 60 * 1000;
const MAXIMO_DE_FECHAMENTOS = 3;

export type EstadoDoBanner = {grupo_entrou_em: string | null; grupo_fechou_em: string | null; grupo_fechamentos: number};

export const mostrarBanner = ({grupo_entrou_em, grupo_fechou_em, grupo_fechamentos}: EstadoDoBanner, agora: Date): boolean =>
  !grupo_entrou_em &&
  grupo_fechamentos < MAXIMO_DE_FECHAMENTOS &&
  (!grupo_fechou_em || agora.getTime() - Date.parse(grupo_fechou_em) >= VOLTA_DEPOIS_MS);

const COLUNAS = "grupo_entrou_em, grupo_fechou_em, grupo_fechamentos";

// O link do grupo, se o banner deve aparecer para esta conta agora.
export const linkDoBanner = async (admin: SupabaseClient, usuario: Usuario, plano: Plano): Promise<string | undefined> => {
  const link = process.env.WHATSAPP_GRUPO_URL?.trim();
  const email = usuario.email.trim().toLowerCase();
  if (!link || plano !== "assinante" || ehDono(email) || SEM_BANNER.includes(email)) return undefined;
  const {data, error} = await admin.from("perfis").select(COLUNAS).eq("id", usuario.id).maybeSingle();
  if (error || !data) return undefined;
  return mostrarBanner(data as EstadoDoBanner, new Date()) ? link : undefined;
};

// Clique no banner: "entrou" (botão do grupo) ou "fechou" (✕).
export const respostaAoBanner = async (admin: SupabaseClient, usuarioId: string, acao: unknown): Promise<void> => {
  if (acao === "entrou") {
    registrarEvento(admin, usuarioId, "clicou_grupo");
    const {error} = await admin.from("perfis").update({grupo_entrou_em: new Date().toISOString()}).eq("id", usuarioId);
    if (error) throw new Error(error.message);
    return;
  }
  if (acao !== "fechou") throw new Error("Ação desconhecida.");
  registrarEvento(admin, usuarioId, "fechou_banner_grupo");
  const {data, error} = await admin.from("perfis").select(COLUNAS).eq("id", usuarioId).maybeSingle();
  if (error) throw new Error(error.message);
  const fechamentos = ((data as EstadoDoBanner | null)?.grupo_fechamentos ?? 0) + 1;
  const {error: erroAoGravar} = await admin
    .from("perfis")
    .update({grupo_fechou_em: new Date().toISOString(), grupo_fechamentos: fechamentos})
    .eq("id", usuarioId);
  if (erroAoGravar) throw new Error(erroAoGravar.message);
};

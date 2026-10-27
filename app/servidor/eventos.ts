// Eventos do funil (migração 015): uma linha por etapa, para medir onde as pessoas
// param. Envio, transcrição e exportação são gravados aqui no servidor, onde a etapa
// roda (a tela pode já ter fechado); o resto vem da tela por POST /api/eventos.
// Uma falha só vai para o log: nunca quebra a etapa.
import type {SupabaseClient} from "@supabase/supabase-js";

export const EVENTOS_DA_TELA = [
  "envio_falhou",
  "previa_carregou",
  "previa_falhou",
  "previa_lenta",
  "tempo_na_edicao",
  "trocou_estilo",
  "abriu_exportar",
  "viu_limite_gratis",
  "viu_oferta",
  "clicou_assinar",
  "usou_exemplo",
] as const;

export type EventoDaTela = (typeof EVENTOS_DA_TELA)[number];

export type NomeDoEvento =
  | (typeof EVENTOS_DA_TELA)[number]
  | "envio_iniciado"
  | "envio_concluido"
  | "transcricao_iniciada"
  | "transcricao_concluida"
  | "transcricao_falhou"
  | "export_iniciado"
  | "export_concluido"
  | "export_falhou"
  | "email_enviado"
  | "clicou_testar_gratis";

export type Dados = Record<string, string | number | boolean | null>;

export const registrarEvento = (banco: SupabaseClient | undefined, usuarioId: string | undefined, nome: NomeDoEvento, dados?: Dados): void => {
  if (!banco || !usuarioId) return;
  void banco
    .from("eventos")
    .insert({usuario_id: usuarioId, nome, dados: dados ?? null})
    .then(
      ({error}) => error && console.log(`Evento ${nome}: ${error.message}`),
      (erro: unknown) => console.log(`Evento ${nome}: ${erro instanceof Error ? erro.message : String(erro)}`),
    );
};

// Página de apresentação, sem conta ainda (migração 017): pelo id do visitante
// (gerado no navegador), sem usuario_id.
export const EVENTOS_DO_VISITANTE = ["clicou_testar_gratis", "clicou_assinar"] as const;
export type EventoDoVisitante = (typeof EVENTOS_DO_VISITANTE)[number];

export const registrarEventoDoVisitante = (banco: SupabaseClient | undefined, corpo: unknown): void => {
  const {visitante} = (corpo ?? {}) as {visitante?: unknown};
  const evento = eventoDaTela(corpo, EVENTOS_DO_VISITANTE);
  if (!banco || !evento || typeof visitante !== "string" || !/^[0-9a-f-]{36}$/iu.test(visitante)) return;
  void banco
    .from("eventos")
    .insert({visitante, nome: evento.nome, dados: evento.dados ?? null})
    .then(
      ({error}) => error && console.log(`Evento ${evento.nome}: ${error.message}`),
      (erro: unknown) => console.log(`Evento ${evento.nome}: ${erro instanceof Error ? erro.message : String(erro)}`),
    );
};

// O que a tela manda: um nome da lista e dados planos e curtos (texto cortado).
export const eventoDaTela = (corpo: unknown, nomes: readonly string[] = EVENTOS_DA_TELA): {nome: NomeDoEvento; dados?: Dados} | undefined => {
  const {nome, dados} = (corpo ?? {}) as {nome?: unknown; dados?: unknown};
  if (!nomes.includes(nome as string)) return undefined;
  if (dados === undefined || dados === null) return {nome: nome as NomeDoEvento};
  if (typeof dados !== "object" || Array.isArray(dados)) return undefined;
  const limpos: Dados = {};
  for (const [chave, valor] of Object.entries(dados).slice(0, 10)) {
    if (typeof valor === "number" || typeof valor === "boolean" || valor === null) limpos[chave.slice(0, 40)] = valor;
    else if (typeof valor === "string") limpos[chave.slice(0, 40)] = valor.slice(0, 200);
  }
  return {nome: nome as NomeDoEvento, dados: limpos};
};

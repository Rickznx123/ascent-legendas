// Pixel da Meta e API de Conversões (medir anúncios). Sem META_PIXEL_ID, o /pixel.js
// sai vazio e nada é medido; sem META_CAPI_TOKEN, o servidor não envia eventos.
// META_TEST_EVENT_CODE (opcional): manda os eventos do servidor para "Testar eventos".
// Uma falha na Meta só vai para o log: nunca quebra o cadastro nem o pagamento.
import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {BancoDeAssinaturas} from "./assinaturas";
import type {BancoDoPix} from "./pix";

const API_DA_META = "https://graph.facebook.com/v21.0";
// Só aceita o CompleteRegistration de uma conta criada há pouco (a rota é pública).
const CADASTRO_RECENTE_MS = 30 * 60_000;

const resumo = (texto: string) => createHash("sha256").update(texto.trim().toLowerCase()).digest("hex");
const registrar = (linha: string) => console.log(`Meta: ${linha}`);
const mensagem = (erro: unknown) => (erro instanceof Error ? erro.message : String(erro));

export const pixelDaMeta = (): string | undefined => {
  const id = process.env.META_PIXEL_ID?.trim();
  return id && /^\d+$/u.test(id) ? id : undefined;
};

// O código padrão do Pixel, com o ID do servidor e o PageView de cada página.
export const scriptDoPixel = (): string => {
  const id = pixelDaMeta();
  if (!id) return "// Pixel da Meta desligado (sem META_PIXEL_ID).\n";
  return `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init',${JSON.stringify(id)});fbq('track','PageView');\n`;
};

export const cookieDoPedido = (cabecalho: string | undefined, nome: string): string | undefined => {
  const parte = (cabecalho ?? "").split(";").map((item) => item.trim()).find((item) => item.startsWith(`${nome}=`));
  return parte ? decodeURIComponent(parte.slice(nome.length + 1)) || undefined : undefined;
};

type Origem = {fbp?: string; fbc?: string; ip?: string; ua?: string};

export type Meta = {
  // Conta criada no navegador: guarda _fbp, _fbc, IP e user agent no perfil e manda o
  // CompleteRegistration com o mesmo event_id do navegador (a Meta junta os dois).
  cadastro: (usuarioId: string, eventId: string, origem: Origem) => Promise<void>;
  compra: (usuarioId: string, eventId: string, valor: number | null) => Promise<void>;
};

export const metaDoAmbiente = (admin: SupabaseClient, enderecoDoApp: string): Meta | undefined => {
  const pixel = pixelDaMeta();
  const token = process.env.META_CAPI_TOKEN?.trim();
  if (!pixel || !token) return undefined;
  const codigoDeTeste = process.env.META_TEST_EVENT_CODE?.trim() || undefined;

  const enviar = async (nome: string, eventId: string, usuario: {id: string; email?: string}, origem: Origem, valor?: number | null) => {
    const evento = {
      event_name: nome,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      // "website" exige o user agent; contas sem a origem guardada (antigas) vão como do sistema.
      action_source: origem.ua ? "website" : "system_generated",
      event_source_url: `${enderecoDoApp}/`,
      user_data: {
        em: usuario.email ? [resumo(usuario.email)] : undefined,
        external_id: [resumo(usuario.id)],
        client_ip_address: origem.ip,
        client_user_agent: origem.ua,
        fbp: origem.fbp,
        fbc: origem.fbc,
      },
      custom_data: valor != null ? {value: Number(valor), currency: "BRL"} : undefined,
    };
    const resposta = await fetch(`${API_DA_META}/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({data: [evento], test_event_code: codigoDeTeste}),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resposta.ok) throw new Error(`${resposta.status} ${(await resposta.text()).slice(0, 300)}`);
    registrar(`${nome} enviado (${eventId}).`);
  };

  const origemDoPerfil = async (usuarioId: string): Promise<Origem & {encontrado: boolean}> => {
    const {data, error} = await admin.from("perfis").select("meta_fbp, meta_fbc, meta_ip, meta_ua").eq("id", usuarioId).maybeSingle();
    if (error) throw new Error(`ler a origem do cadastro: ${error.message}`);
    const linha = data as {meta_fbp: string | null; meta_fbc: string | null; meta_ip: string | null; meta_ua: string | null} | null;
    return {encontrado: Boolean(linha), fbp: linha?.meta_fbp ?? undefined, fbc: linha?.meta_fbc ?? undefined, ip: linha?.meta_ip ?? undefined, ua: linha?.meta_ua ?? undefined};
  };

  return {
    cadastro: async (usuarioId, eventId, origem) => {
      try {
        const {data, error} = await admin.auth.admin.getUserById(usuarioId);
        if (error || !data.user) throw new Error(`conta não encontrada (${error?.message ?? "sem usuário"})`);
        if (Date.now() - new Date(data.user.created_at).getTime() > CADASTRO_RECENTE_MS) return;
        const email = data.user.email ?? "";
        const antes = await origemDoPerfil(usuarioId);
        // Uma vez só por conta (a rota é pública: ninguém troca a origem depois).
        if (antes.ip || antes.ua) return;
        const campos = {meta_fbp: origem.fbp ?? null, meta_fbc: origem.fbc ?? null, meta_ip: origem.ip ?? null, meta_ua: origem.ua ?? null};
        // O trigger de cadastro cria o perfil; se não criou, cria aqui (como em contas.ts).
        const {error: erroAoSalvar} = antes.encontrado
          ? await admin.from("perfis").update(campos).eq("id", usuarioId)
          : await admin.from("perfis").insert({id: usuarioId, nome: email.split("@")[0] || null, ...campos});
        if (erroAoSalvar) registrar(`guardar a origem do cadastro: ${erroAoSalvar.message}`);
        await enviar("CompleteRegistration", eventId, {id: usuarioId, email}, origem);
      } catch (erro) {
        registrar(`CompleteRegistration (${eventId}) falhou: ${mensagem(erro)}`);
      }
    },
    compra: async (usuarioId, eventId, valor) => {
      try {
        const {data} = await admin.auth.admin.getUserById(usuarioId);
        await enviar("Purchase", eventId, {id: usuarioId, email: data.user?.email}, await origemDoPerfil(usuarioId), valor);
      } catch (erro) {
        registrar(`Purchase (${eventId}) falhou: ${mensagem(erro)}`);
      }
    },
  };
};

// Purchase quando um pagamento de assinatura (cartão) fica aprovado pela primeira vez.
// Só observa a gravação: as regras do pagamento continuam as de assinaturas.ts.
export const assinaturasComMeta = (banco: BancoDeAssinaturas, meta: Meta | undefined): BancoDeAssinaturas =>
  meta
    ? {
        ...banco,
        salvarPagamento: async (pagamento) => {
          const aprovado = pagamento.status === "approved";
          const antes = aprovado ? await banco.pagamento(pagamento.mp_payment_id).catch(() => undefined) : undefined;
          await banco.salvarPagamento(pagamento);
          if (aprovado && antes?.status !== "approved") void meta.compra(pagamento.usuario_id, `compra-${pagamento.mp_payment_id}`, pagamento.valor);
        },
      }
    : banco;

// Purchase quando um Pix fica aprovado (regraDoPixAprovado só aprova uma vez).
export const pixComMeta = (banco: BancoDoPix, meta: Meta | undefined): BancoDoPix =>
  meta
    ? {
        ...banco,
        salvarPix: async (id, campos) => {
          await banco.salvarPix(id, campos);
          if (campos.status !== "aprovado") return;
          void banco
            .pixPorId(id)
            .then((pix) => (pix ? meta.compra(pix.usuario_id, `pix-${id}`, Number(pix.valor)) : undefined))
            .catch((erro: unknown) => registrar(`Purchase (pix-${id}) falhou: ${mensagem(erro)}`));
        },
      }
    : banco;

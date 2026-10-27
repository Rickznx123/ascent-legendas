// E-mails de recuperação (Resend) para quem se cadastrou no grátis e ainda não exportou:
//   1h depois do cadastro:  "Seu vídeo grátis está esperando", com o link direto.
//   24h depois:             o mesmo convite e um exemplo de antes/depois.
// Mais o aviso único a quem teve a exportação falhando (o bug do 4K, já corrigido),
// mandado por scripts/email-render-corrigido.ts.
// Nunca para quem já exportou, assinou ou saiu da lista (o link do rodapé e o
// cabeçalho List-Unsubscribe). Cada envio é reservado na coluna do perfil antes
// (migração 016), como as boas-vindas: o mesmo e-mail não sai duas vezes; se o
// envio falhar, a coluna volta a ficar vazia. Uma falha só vai para o log.
import {createHmac, timingSafeEqual} from "node:crypto";
import {existsSync} from "node:fs";
import path from "node:path";
import type {SupabaseClient} from "@supabase/supabase-js";
import {registrarEvento} from "./eventos";

const ENDERECO_DO_APP = "https://legendas.ascentstudio.com.br";
const REMETENTE = "Ascent Legendas <contato@ascentstudio.com.br>";
const HORA_MS = 3600_000;
// Quem passou de 72 h sem o e-mail (servidor fora do ar) não recebe mais.
const JANELA_MS = 72 * HORA_MS;
const VIGIA_MS = 10 * 60_000;

export type TipoDoEmail = "recuperacao_1h" | "recuperacao_24h" | "aviso_render";
const COLUNA: Record<TipoDoEmail, string> = {recuperacao_1h: "recuperacao_1h_em", recuperacao_24h: "recuperacao_24h_em", aviso_render: "aviso_render_em"};

const registrar = (linha: string) => console.log(`E-mails: ${linha}`);
const mensagem = (erro: unknown) => (erro instanceof Error ? erro.message : String(erro));
const escapar = (texto: string) =>
  texto.replace(/[&<>"']/gu, (letra) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[letra]!);

// Link de sair da lista: o id da conta e uma assinatura feita com a chave secreta do
// servidor (ninguém tira outra pessoa da lista).
const assinatura = (chave: string, usuarioId: string) => createHmac("sha256", chave).update(`sair:${usuarioId}`).digest("hex").slice(0, 32);
export const linkDeSair = (chave: string, usuarioId: string) => `${ENDERECO_DO_APP}/email/sair?u=${usuarioId}&t=${assinatura(chave, usuarioId)}`;
export const conferirSair = (chave: string, usuarioId: unknown, token: unknown): usuarioId is string => {
  if (typeof usuarioId !== "string" || !/^[0-9a-f-]{36}$/iu.test(usuarioId) || typeof token !== "string") return false;
  const esperado = Buffer.from(assinatura(chave, usuarioId));
  const recebido = Buffer.from(token);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
};

// Qual e-mail de recuperação cabe agora (pela idade da conta e pelo que já saiu).
export const emailDaVez = (
  perfil: {criado_em: string; recuperacao_1h_em: string | null; recuperacao_24h_em: string | null},
  agora: Date,
): TipoDoEmail | undefined => {
  const idade = agora.getTime() - new Date(perfil.criado_em).getTime();
  if (idade < HORA_MS || idade > JANELA_MS) return undefined;
  if (idade < 24 * HORA_MS) return perfil.recuperacao_1h_em ? undefined : "recuperacao_1h";
  return perfil.recuperacao_24h_em ? undefined : "recuperacao_24h";
};

// Antes/depois do e-mail de 24 h: landing/antes.jpg e depois.jpg quando existirem;
// até lá, um quadro legendado do pacote A.
const pastaDaLanding = path.join(process.cwd(), "app", "web", "public", "landing");
const temAntesDepois = () => existsSync(path.join(pastaDaLanding, "antes.jpg")) && existsSync(path.join(pastaDaLanding, "depois.jpg"));

export type DadosDoEmail = {tipo: TipoDoEmail; nome?: string | null; transcreveu: boolean; sair: string; antesDepois?: boolean};

export const montarEmail = ({tipo, nome, transcreveu, sair, antesDepois = false}: DadosDoEmail): {assunto: string; html: string; texto: string} => {
  const primeiro = nome?.trim().split(/\s+/u)[0];
  const saudacao = primeiro ? `Oi, ${primeiro}!` : "Oi!";
  const link = `${ENDERECO_DO_APP}/?utm_source=email&utm_campaign=${tipo}`;
  const {assunto, paragrafos, rotulo} =
    tipo === "aviso_render"
      ? {
          assunto: "Corrigimos o erro da sua exportação",
          paragrafos: [
            "Sua exportação no Ascent Legendas falhou por um erro nosso com vídeos em alta resolução (como 4K do iPhone). Já corrigimos.",
            "Nada foi descontado: o seu vídeo grátis continua disponível. Abra o app, entre no vídeo e toque em Exportar de novo.",
          ],
          rotulo: "Exportar meu vídeo",
        }
      : {
          assunto: tipo === "recuperacao_1h" ? "Seu vídeo grátis está esperando" : "Seu vídeo grátis ainda está esperando",
          paragrafos: [
            transcreveu
              ? "Suas legendas já estão prontas: falta só exportar. O primeiro vídeo é grátis."
              : "Você criou sua conta, mas ainda não legendou nenhum vídeo. Envie um vídeo de até 2 minutos e a legenda animada sai sozinha, em menos de um minuto. O primeiro é grátis.",
            ...(tipo === "recuperacao_24h" ? ["Veja como fica:"] : []),
          ],
          rotulo: transcreveu ? "Exportar meu vídeo grátis" : "Legendar meu vídeo grátis",
        };
  const imagens =
    tipo !== "recuperacao_24h"
      ? ""
      : antesDepois
        ? `<tr><td style="padding:8px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="50%" style="padding-right:6px;text-align:center;color:#8d8d9a;font-size:13px"><img src="${ENDERECO_DO_APP}/landing/antes.jpg" width="100%" alt="Antes: vídeo sem legenda" style="display:block;border-radius:10px;margin-bottom:6px">Antes</td>
<td width="50%" style="padding-left:6px;text-align:center;color:#8d8d9a;font-size:13px"><img src="${ENDERECO_DO_APP}/landing/depois.jpg" width="100%" alt="Depois: vídeo com a legenda animada" style="display:block;border-radius:10px;margin-bottom:6px">Depois</td>
</tr></table></td></tr>`
        : `<tr><td style="padding:8px 0 0;text-align:center"><img src="${ENDERECO_DO_APP}/landing/estilos/a.jpg" width="260" alt="Vídeo com a legenda animada do Ascent Legendas" style="border-radius:10px"></td></tr>`;
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapar(assunto)}</title></head>
<body style="margin:0;padding:0;background:#030210">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#030210;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 0 24px"><img src="${ENDERECO_DO_APP}/icones/icone-192.png" width="40" height="40" alt="" style="vertical-align:middle;border-radius:10px"> <span style="vertical-align:middle;font-size:18px;font-weight:700;color:#ffffff;margin-left:8px">Ascent Legendas</span></td></tr>
<tr><td><h1 style="margin:0 0 12px;font-size:24px;color:#ffffff">${escapar(saudacao)}</h1>
${paragrafos.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#d6d6de">${escapar(p)}</p>`).join("\n")}</td></tr>
${imagens}
<tr><td style="padding:20px 0 0"><a href="${escapar(link)}" style="display:inline-block;background:#7c5cff;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">${escapar(rotulo)}</a></td></tr>
<tr><td style="padding:28px 0 0;font-size:15px;line-height:1.55;color:#d6d6de"><p style="margin:0 0 16px">Qualquer dúvida, é só responder este e-mail.</p><p style="margin:0;color:#8d8d9a">Rick, do Ascent Legendas</p></td></tr>
<tr><td style="padding:28px 0 0;font-size:12px;color:#6b6b78">Não quer mais estes e-mails? <a href="${escapar(sair)}" style="color:#8d8d9a">Sair da lista</a>.</td></tr>
</table></td></tr></table>
</body></html>`;
  const texto = [saudacao, "", ...paragrafos.flatMap((p) => [p, ""]), `${rotulo}: ${link}`, "", "Qualquer dúvida, é só responder este e-mail.", "", "Rick, do Ascent Legendas", "", `Sair da lista: ${sair}`].join("\n");
  return {assunto, html, texto};
};

export const emailsDeRecuperacao = (admin: SupabaseClient) => {
  const chaveResend = process.env.RESEND_API_KEY?.trim();
  const chaveSecreta = process.env.SUPABASE_SECRET_KEY?.trim() ?? "";

  // Reserva a coluna, manda e, se falhar, libera. true: enviado.
  const enviar = async (usuarioId: string, tipo: TipoDoEmail, transcreveu: boolean): Promise<boolean> => {
    if (!chaveResend) return false;
    const coluna = COLUNA[tipo];
    let reservado = false;
    try {
      const {data, error} = await admin
        .from("perfis")
        .update({[coluna]: new Date().toISOString()})
        .eq("id", usuarioId)
        .is(coluna, null)
        .is("emails_desligados_em", null)
        .select("nome");
      if (error) throw new Error(`reservar: ${error.message}`);
      if (!data?.length) return false;
      reservado = true;
      const {data: conta, error: erroDaConta} = await admin.auth.admin.getUserById(usuarioId);
      if (erroDaConta || !conta.user?.email) throw new Error(`e-mail da conta: ${erroDaConta?.message ?? "sem e-mail"}`);
      const sair = linkDeSair(chaveSecreta, usuarioId);
      const {assunto, html, texto} = montarEmail({tipo, nome: (data[0] as {nome: string | null}).nome, transcreveu, sair, antesDepois: temAntesDepois()});
      const resposta = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {Authorization: `Bearer ${chaveResend}`, "Content-Type": "application/json"},
        body: JSON.stringify({
          from: REMETENTE,
          to: [conta.user.email],
          reply_to: process.env.EMAIL_SUPORTE?.trim() || undefined,
          subject: assunto,
          html,
          text: texto,
          headers: {"List-Unsubscribe": `<${sair}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"},
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!resposta.ok) throw new Error(`Resend ${resposta.status} ${(await resposta.text()).slice(0, 300)}`);
      registrar(`${tipo} enviado (conta ${usuarioId.slice(0, 8)}).`);
      registrarEvento(admin, usuarioId, "email_enviado", {tipo});
      return true;
    } catch (erro) {
      registrar(`${tipo} falhou (conta ${usuarioId.slice(0, 8)}): ${mensagem(erro)}`);
      if (reservado) {
        await admin
          .from("perfis")
          .update({[coluna]: null})
          .eq("id", usuarioId)
          .then(({error}) => error && registrar(`liberar a reserva: ${error.message}`), (falha: unknown) => registrar(`liberar a reserva: ${mensagem(falha)}`));
      }
      return false;
    }
  };

  // Já exportou (alguma exportação gravada) ou transcreveu (para o texto do e-mail).
  const contar = async (tabela: "exportacoes" | "transcricoes", usuarioId: string) => {
    const {count, error} = await admin.from(tabela).select("id", {count: "exact", head: true}).eq("usuario_id", usuarioId);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    return count ?? 0;
  };

  // Uma passada: as contas grátis criadas entre 1 h e 72 h atrás, fora da lista não.
  let rodando = false;
  const passar = async (agora = new Date()) => {
    if (rodando) return;
    rodando = true;
    try {
      const {data, error} = await admin
        .from("perfis")
        .select("id, criado_em, recuperacao_1h_em, recuperacao_24h_em")
        .eq("plano", "gratis")
        .is("emails_desligados_em", null)
        .gte("criado_em", new Date(agora.getTime() - JANELA_MS).toISOString())
        .lte("criado_em", new Date(agora.getTime() - HORA_MS).toISOString());
      if (error) throw new Error(error.message);
      for (const perfil of (data ?? []) as {id: string; criado_em: string; recuperacao_1h_em: string | null; recuperacao_24h_em: string | null}[]) {
        const tipo = emailDaVez(perfil, agora);
        if (!tipo || (await contar("exportacoes", perfil.id)) > 0) continue;
        await enviar(perfil.id, tipo, (await contar("transcricoes", perfil.id)) > 0);
      }
    } catch (erro) {
      registrar(`passada falhou: ${mensagem(erro)}`);
    } finally {
      rodando = false;
    }
  };

  // Sair da lista (o link do rodapé). true: a conta saiu (ou já tinha saído).
  const sair = async (usuarioId: unknown, token: unknown): Promise<boolean> => {
    if (!conferirSair(chaveSecreta, usuarioId, token)) return false;
    const {error} = await admin.from("perfis").update({emails_desligados_em: new Date().toISOString()}).eq("id", usuarioId).is("emails_desligados_em", null);
    if (error) throw new Error(error.message);
    return true;
  };

  // Só no servidor da internet (SERVIDOR_PUBLICO): rodar o app no computador nunca manda e-mail.
  const vigiar = () => {
    if (!chaveResend) return;
    setTimeout(() => void passar(), 60_000).unref();
    setInterval(() => void passar(), VIGIA_MS).unref();
  };

  return {enviar, passar, sair, vigiar};
};

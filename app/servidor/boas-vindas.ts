// E-mail de boas-vindas no PRIMEIRO pagamento aprovado da conta (cartão ou Pix), pelo
// Resend. Renovação, troca de plano e o Pix seguinte não mandam de novo: a coluna
// perfis.boas_vindas_enviado_em (migração 011) é reservada antes de enviar, só se
// estiver vazia (o webhook repetido não duplica); se o envio falhar, volta a ficar vazia.
//   RESEND_API_KEY      chave da API do Resend (sem ela, nada é enviado)
//   EMAIL_SUPORTE       reply-to
//   WHATSAPP_GRUPO_URL  link do grupo (vazio: o e-mail sai sem o bloco do grupo)
// Uma falha só vai para o log: nunca quebra o webhook nem a liberação do plano.
import type {SupabaseClient} from "@supabase/supabase-js";
import {planoPago} from "./planos";
import type {Nivel} from "./planos";

const ENDERECO_DO_APP = "https://legendas.ascentstudio.com.br";
const REMETENTE = "Ascent Legendas <contato@ascentstudio.com.br>";
export const ASSUNTO_DAS_BOAS_VINDAS = "Bem-vindo ao Ascent Legendas 🎉";

const registrar = (linha: string) => console.log(`Boas-vindas: ${linha}`);
const mensagem = (erro: unknown) => (erro instanceof Error ? erro.message : String(erro));
const escapar = (texto: string) =>
  texto.replace(/[&<>"']/gu, (letra) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[letra]!);

export type DadosDasBoasVindas = {nome?: string | null; plano: string; minutos: number; grupo?: string};

export const montarBoasVindas = ({nome, plano, minutos, grupo}: DadosDasBoasVindas): {html: string; texto: string} => {
  const primeiro = nome?.trim();
  const saudacao = primeiro ? `Oi, ${primeiro}!` : "Oi!";
  const botao = (rotulo: string, link: string) =>
    `<a href="${escapar(link)}" style="display:inline-block;background:#7c5cff;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">${rotulo}</a>`;
  const secao = (titulo: string, corpo: string, rodape = "") =>
    `<tr><td style="padding:24px 0 0"><h2 style="margin:0 0 8px;font-size:17px;color:#ffffff">${titulo}</h2><p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#d6d6de">${corpo}</p>${rodape}</td></tr>`;
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapar(ASSUNTO_DAS_BOAS_VINDAS)}</title></head>
<body style="margin:0;padding:0;background:#030210">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#030210;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 0 24px"><img src="${ENDERECO_DO_APP}/icones/icone-192.png" width="40" height="40" alt="" style="vertical-align:middle;border-radius:10px"> <span style="vertical-align:middle;font-size:18px;font-weight:700;color:#ffffff;margin-left:8px">Ascent Legendas</span></td></tr>
<tr><td><h1 style="margin:0 0 12px;font-size:24px;color:#ffffff">${escapar(saudacao)}</h1>
<p style="margin:0;font-size:15px;line-height:1.55;color:#d6d6de">Obrigado por assinar o Ascent Legendas. Seu plano <b style="color:#ffffff">${escapar(plano)}</b> já está ativo, com <b style="color:#ffffff">${minutos} minutos</b> de exportação por mês.</p></td></tr>
${grupo ? secao("Entre na comunidade no WhatsApp", "É lá que a gente avisa das novidades em primeira mão, tira dúvidas e ouve o que você quer ver no app.", botao("Entrar no grupo", grupo)) : ""}
${secao("O que vem por aí", "O app recebe atualização constante: novos pacotes de estilos, paletas de cores e melhorias toda semana. Tudo entra automaticamente na sua conta, sem pagar nada a mais.")}
${secao("Para começar", "Envie seu vídeo, escolha o estilo e exporte.", botao("Abrir o app", ENDERECO_DO_APP))}
<tr><td style="padding:28px 0 0;font-size:15px;line-height:1.55;color:#d6d6de"><p style="margin:0 0 16px">Qualquer dúvida, é só responder este e-mail.</p><p style="margin:0;color:#8d8d9a">Rick, do Ascent Legendas</p></td></tr>
</table></td></tr></table>
</body></html>`;
  const texto = [
    saudacao,
    "",
    `Obrigado por assinar o Ascent Legendas. Seu plano ${plano} já está ativo, com ${minutos} minutos de exportação por mês.`,
    ...(grupo
      ? ["", "Entre na comunidade no WhatsApp", "É lá que a gente avisa das novidades em primeira mão, tira dúvidas e ouve o que você quer ver no app.", `Entrar no grupo: ${grupo}`]
      : []),
    "",
    "O que vem por aí",
    "O app recebe atualização constante: novos pacotes de estilos, paletas de cores e melhorias toda semana. Tudo entra automaticamente na sua conta, sem pagar nada a mais.",
    "",
    "Para começar",
    "Envie seu vídeo, escolha o estilo e exporte.",
    `Abrir o app: ${ENDERECO_DO_APP}`,
    "",
    "Qualquer dúvida, é só responder este e-mail.",
    "",
    "Rick, do Ascent Legendas",
  ].join("\n");
  return {html, texto};
};

// Manda as boas-vindas se a conta ainda não recebeu. Nunca rejeita.
export const boasVindasDoAmbiente = (admin: SupabaseClient): ((usuarioId: string, nivel: Nivel | undefined) => Promise<void>) | undefined => {
  const chave = process.env.RESEND_API_KEY?.trim();
  if (!chave) return undefined;
  return async (usuarioId, nivel) => {
    let reservado = false;
    try {
      // Reserva: só uma das chamadas (webhook repetido, verificação) passa daqui.
      const {data, error} = await admin
        .from("perfis")
        .update({boas_vindas_enviado_em: new Date().toISOString()})
        .eq("id", usuarioId)
        .is("boas_vindas_enviado_em", null)
        .select("nome");
      if (error) throw new Error(`reservar o envio: ${error.message}`);
      if (!data?.length) return;
      reservado = true;
      const {data: conta, error: erroDaConta} = await admin.auth.admin.getUserById(usuarioId);
      if (erroDaConta || !conta.user?.email) throw new Error(`e-mail da conta: ${erroDaConta?.message ?? "sem e-mail"}`);
      const plano = planoPago(nivel ?? "basico");
      const grupo = process.env.WHATSAPP_GRUPO_URL?.trim() || undefined;
      const {html, texto} = montarBoasVindas({nome: (data[0] as {nome: string | null}).nome, plano: plano.nome, minutos: plano.minutos, grupo});
      const resposta = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {Authorization: `Bearer ${chave}`, "Content-Type": "application/json"},
        body: JSON.stringify({
          from: REMETENTE,
          to: [conta.user.email],
          reply_to: process.env.EMAIL_SUPORTE?.trim() || undefined,
          subject: ASSUNTO_DAS_BOAS_VINDAS,
          html,
          text: texto,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!resposta.ok) throw new Error(`Resend ${resposta.status} ${(await resposta.text()).slice(0, 300)}`);
      registrar(`enviado (conta ${usuarioId.slice(0, 8)}).`);
    } catch (erro) {
      registrar(`falhou (conta ${usuarioId.slice(0, 8)}): ${mensagem(erro)}`);
      // Não enviado: libera a coluna (a próxima aprovação tenta de novo).
      if (reservado) {
        await admin
          .from("perfis")
          .update({boas_vindas_enviado_em: null})
          .eq("id", usuarioId)
          .then(({error}) => error && registrar(`liberar a reserva: ${error.message}`), (falha: unknown) => registrar(`liberar a reserva: ${mensagem(falha)}`));
      }
    }
  };
};

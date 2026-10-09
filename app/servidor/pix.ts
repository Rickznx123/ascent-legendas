// Pix avulso pelo Mercado Pago (Etapa 2d). R$ 30 dão 30 dias de assinante, com os
// mesmos direitos da assinatura (30 minutos exportados no período, sem marca d'água,
// 10 transcrições por dia). Não renova sozinho.
//
// Fluxo: "Pix" na tela Assinar → POST /api/pix cria o pagamento no Mercado Pago
// (POST /v1/payments, external_reference = id da linha em pix_pagamentos) e devolve o
// QR code e o código copia e cola, que aparecem dentro do app → a tela confere sozinha
// (POST /api/pix/conferir) → o servidor CONSULTA o Mercado Pago e só ativa com o
// pagamento aprovado. A consulta acontece também a cada webhook validado (tópico
// payment) e na verificação periódica (os Pix pendentes dos últimos 2 dias).
//
// Planos (migração 009): o Pix é do plano escolhido (Básico, Pro ou Editor), com o
// valor dele; o nível só vale com o pagamento aprovado, de valor igual ou maior que o
// do Pix (definido pelo servidor). Um Pix de plano maior com um período valendo
// começa na hora (o período e os minutos recomeçam); do mesmo plano, soma os dias; de
// plano menor, só depois que o período atual acabar.
//
// Regras (decisões da 2d):
//   - aprovado: 30 dias de assinante a partir da aprovação; com um período de Pix
//     ainda valendo, os 30 dias somam ao fim dele (o ciclo de minutos novo começa
//     quando o atual acaba);
//   - vencido ou não pago: nada muda; a pessoa pode gerar outro;
//   - estorno ou contestação: grátis na hora (se o período do Pix ainda valia);
//   - contas cortesia (npm run plano) nunca são tocadas; quem tem assinatura por
//     cartão valendo não paga Pix (o Pix fica disponível quando ela acabar).
// O CPF (só se o Mercado Pago exigir) vai direto ao Mercado Pago: não é guardado
// aqui nem aparece no log.
import {randomUUID} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {ESTORNOS, planoEfetivo} from "./assinaturas";
import type {PerfilDaAssinatura, ResumoDaAssinatura} from "./assinaturas";
import {semCpf} from "./mercadopago";
import type {ApiDoMercadoPago, Pagamento} from "./mercadopago";
import {compararNiveis, planoPago} from "./planos";
import type {Nivel} from "./planos";

const DIA = 24 * 3600 * 1000;
export const DIAS_DO_PIX = 30;
export const PERIODO_DO_PIX_MS = DIAS_DO_PIX * DIA;
// Prazo para pagar o código (o Mercado Pago aceita de 30 minutos a 30 dias).
export const VALIDADE_DO_PIX_MS = 60 * 60_000;

export type StatusDoPix = "criando" | "pendente" | "aprovado" | "vencido" | "estornado" | "erro";

export type PixPagamento = {
  id: string;
  usuario_id: string;
  mp_payment_id: string | null;
  status: StatusDoPix;
  valor: number;
  expira_em: string | null;
  qr_code: string | null;
  qr_code_base64: string | null;
  aprovado_em: string | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  estornado_em: string | null;
  criado_em: string;
  // Plano deste Pix (migração 009; vazio vale Básico).
  nivel?: Nivel;
};

export type BancoDoPix = {
  pixPorId: (id: string) => Promise<PixPagamento | undefined>;
  pixPorPagamento: (mpPaymentId: string) => Promise<PixPagamento | undefined>;
  ultimoPixDaConta: (usuarioId: string) => Promise<PixPagamento | undefined>;
  criarPix: (linha: {id: string; usuario_id: string; valor: number; nivel: Nivel}) => Promise<PixPagamento>;
  salvarPix: (id: string, campos: Partial<PixPagamento>) => Promise<void>;
  // Para a verificação periódica: criando ou pendentes criados depois de "desde".
  pixParaConferir: (desde: Date) => Promise<PixPagamento[]>;
  perfil: (usuarioId: string) => Promise<PerfilDaAssinatura>;
  salvarPerfil: (usuarioId: string, campos: Partial<PerfilDaAssinatura>) => Promise<void>;
};

// ---------- regras (funções puras) ----------
export const cortesia = (perfil: PerfilDaAssinatura): boolean => perfil.plano === "assinante" && perfil.plano_origem === "manual";

// Quem pode gerar um Pix, pela situação da tela (resumoDaAssinatura): o grátis e quem
// já está no Pix (para somar dias). Cortesia e assinatura por cartão valendo, não.
// No Pix, um plano menor que o atual só depois que o período atual acabar.
export const motivoParaNaoPagarPix = (resumo: ResumoDaAssinatura, nivel: Nivel = "basico"): string | undefined => {
  if (!resumo.disponivel) return "O pagamento não está disponível agora.";
  if (resumo.situacao === "pix" && resumo.nivel && compararNiveis(nivel, resumo.nivel) < 0) {
    const fim = resumo.ate ? new Date(resumo.ate).toLocaleDateString("pt-BR", {day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo"}) : "o fim do período";
    return `Você está no plano ${planoPago(resumo.nivel).nome} até ${fim}. O ${planoPago(nivel).nome} pode ser pago depois dessa data.`;
  }
  if (resumo.situacao === "nenhuma" || resumo.situacao === "pix") return undefined;
  if (resumo.situacao === "cortesia") return "A sua conta já é assinante (cortesia), sem cobrança.";
  return "A sua assinatura por cartão está valendo. O Pix fica disponível quando ela terminar.";
};

// Ciclo de minutos de quem está no Pix: os 30 minutos renovam a cada 30 dias, contados
// do começo dos períodos seguidos (ciclo_inicio), sem passar do fim pago.
export const cicloDoPix = (perfil: PerfilDaAssinatura, agora: Date): {inicio: Date; fim: Date} | undefined => {
  if (perfil.plano_origem !== "pix" || !perfil.ciclo_inicio || !perfil.plano_ate) return undefined;
  const comeco = new Date(perfil.ciclo_inicio).getTime();
  const passados = Math.max(0, Math.floor((agora.getTime() - comeco) / PERIODO_DO_PIX_MS));
  const inicio = comeco + passados * PERIODO_DO_PIX_MS;
  return {inicio: new Date(inicio), fim: new Date(Math.min(inicio + PERIODO_DO_PIX_MS, new Date(perfil.plano_ate).getTime()))};
};

// Um Pix aprovado (confirmado no Mercado Pago). Devolve o que muda na linha e no
// perfil; sem perfil, o plano não muda (e "motivo" diz por quê, para o log).
export const regraDoPixAprovado = (
  pix: PixPagamento,
  pagamento: Pagamento,
  perfil: PerfilDaAssinatura,
  agora: Date,
): {pix: Partial<PixPagamento>; perfil?: Partial<PerfilDaAssinatura>; motivo?: string} => {
  if (pix.status === "aprovado") return {pix: {}, motivo: "já aplicado"};
  if (pagamento.status !== "approved") return {pix: {}, motivo: `pagamento ${pagamento.status}`};
  if (pagamento.payment_method_id && pagamento.payment_method_id !== "pix") return {pix: {}, motivo: `não é Pix (${pagamento.payment_method_id})`};
  if ((pagamento.transaction_amount ?? 0) + 0.001 < Number(pix.valor)) return {pix: {}, motivo: `valor menor que o do Pix (${pagamento.transaction_amount})`};
  const aprovadoEm = new Date(pagamento.date_approved ?? agora.toISOString());
  const aprovado = {status: "aprovado" as const, aprovado_em: aprovadoEm.toISOString()};
  if (cortesia(perfil)) return {pix: aprovado, motivo: "conta cortesia: plano não mexido"};
  if (perfil.plano_origem === "assinatura" && planoEfetivo(perfil, aprovadoEm) === "assinante") {
    return {pix: aprovado, motivo: "assinatura por cartão valendo: plano não mexido (estornar à mão)"};
  }
  // Um período de Pix ainda valendo: do mesmo plano (ou menor), os 30 dias somam ao
  // fim dele; de um plano maior, o Pix novo começa na hora (período e minutos novos).
  const nivel = pix.nivel ?? "basico";
  const fimAtual = perfil.plano_ate ? new Date(perfil.plano_ate) : undefined;
  const valendo = perfil.plano_origem === "pix" && perfil.plano === "assinante" && fimAtual !== undefined && fimAtual > aprovadoEm;
  const nivelAtual = perfil.nivel ?? "basico";
  const soma = valendo && compararNiveis(nivel, nivelAtual) <= 0;
  const inicio = soma ? fimAtual : aprovadoEm;
  const fim = new Date(inicio.getTime() + PERIODO_DO_PIX_MS);
  return {
    pix: {...aprovado, periodo_inicio: inicio.toISOString(), periodo_fim: fim.toISOString()},
    perfil: soma
      ? {plano_ate: fim.toISOString()}
      : {plano: "assinante", plano_origem: "pix", ciclo_inicio: inicio.toISOString(), ciclo_fim: fim.toISOString(), plano_ate: fim.toISOString(), nivel, nivel_na_renovacao: null},
    // Plano menor pago com um maior valendo (só se os dois Pix foram gerados antes): soma
    // os dias no plano atual.
    motivo: soma && compararNiveis(nivel, nivelAtual) < 0 ? `Pix do ${nivel} com o ${nivelAtual} valendo: dias somados no ${nivelAtual}` : undefined,
  };
};

// Estorno ou contestação de um Pix: grátis na hora, se o período dele ainda valia.
export const regraDoPixEstornado = (
  pix: PixPagamento,
  perfil: PerfilDaAssinatura,
  agora: Date,
): {pix: Partial<PixPagamento>; perfil?: Partial<PerfilDaAssinatura>} => {
  if (pix.status === "estornado") return {pix: {}};
  const valia = Boolean(pix.periodo_fim && new Date(pix.periodo_fim) > agora);
  return {
    pix: {status: "estornado", estornado_em: agora.toISOString()},
    perfil: perfil.plano_origem === "pix" && valia ? {plano: "gratis", plano_ate: agora.toISOString()} : undefined,
  };
};

// O que o Mercado Pago diz de um Pix ainda não pago: continua pendente ou venceu.
// Um dia depois do prazo, vencido mesmo sem resposta do Mercado Pago.
export const regraDoPixPendente = (pix: PixPagamento, pagamento: Pagamento | undefined, agora: Date): Partial<PixPagamento> => {
  if (pagamento && ["cancelled", "rejected", "expired"].includes(pagamento.status)) return {status: "vencido"};
  if (pix.expira_em && new Date(pix.expira_em).getTime() + DIA < agora.getTime()) return {status: "vencido"};
  return {};
};

// Se o pedido falhou por causa do CPF (o Mercado Pago o exige ou recusou o enviado).
export const erroDeCpf = (mensagem: string): boolean => /identification|cpf|document|\b2067\b/iu.test(mensagem);

// CPF: 11 dígitos com os dois dígitos verificadores certos (formato; não consulta a Receita).
export const cpfValido = (texto: string): string | undefined => {
  const cpf = texto.replace(/\D/gu, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/u.test(cpf)) return undefined;
  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(cpf[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]) ? cpf : undefined;
};

// ---------- erros para a tela ----------
export type CodigoDoErroDoPix = "cpf-necessario" | "cpf-invalido" | "falhou";
export class ErroDoPix extends Error {
  constructor(
    readonly codigo: CodigoDoErroDoPix,
    mensagem: string,
  ) {
    super(mensagem);
  }
}
const MENSAGENS: Record<CodigoDoErroDoPix, string> = {
  "cpf-necessario": "Para gerar o Pix, o Mercado Pago pede o CPF de quem vai pagar.",
  "cpf-invalido": "O Mercado Pago não aceitou este CPF. Confira os números e tente de novo.",
  falhou: "Não foi possível gerar o Pix agora. Tente de novo em instantes.",
};

// O que a tela recebe de um Pix (nada do pagador).
export type VistaDoPix = {
  id: string;
  estado: "pendente" | "aprovado" | "vencido" | "estornado" | "erro";
  valor: number;
  expiraEm?: string;
  qrCode?: string;
  qrCodeBase64?: string;
  periodoFim?: string;
};
export const vistaDoPix = (pix: PixPagamento): VistaDoPix => ({
  id: pix.id,
  estado: pix.status === "criando" ? "pendente" : pix.status,
  valor: Number(pix.valor),
  expiraEm: pix.expira_em ?? undefined,
  // O código só interessa enquanto dá para pagar.
  qrCode: pix.status === "pendente" ? (pix.qr_code ?? undefined) : undefined,
  qrCodeBase64: pix.status === "pendente" ? (pix.qr_code_base64 ?? undefined) : undefined,
  periodoFim: pix.periodo_fim ?? undefined,
});

// ---------- processamento ----------
export const processadorDePix = ({
  banco,
  api,
  agora = () => new Date(),
  registrar = (linha: string) => console.log(`Pix: ${linha}`),
}: {
  banco: BancoDoPix;
  api: ApiDoMercadoPago;
  agora?: () => Date;
  registrar?: (linha: string) => void;
}) => {
  const aplicarNoPerfil = async (usuarioId: string, campos: Partial<PerfilDaAssinatura> | undefined) => {
    if (campos && Object.keys(campos).length > 0) await banco.salvarPerfil(usuarioId, campos);
  };

  // Aplica o que o Mercado Pago diz de um Pix nosso.
  const aplicar = async (pix: PixPagamento, pagamento: Pagamento): Promise<string> => {
    if (pagamento.external_reference && pagamento.external_reference !== pix.id) return "ignorado: external_reference de outro Pix";
    if (!pix.mp_payment_id) await banco.salvarPix(pix.id, {mp_payment_id: String(pagamento.id)});
    if (ESTORNOS.includes(pagamento.status)) {
      const efeito = regraDoPixEstornado(pix, await banco.perfil(pix.usuario_id), agora());
      if (Object.keys(efeito.pix).length > 0) await banco.salvarPix(pix.id, efeito.pix);
      await aplicarNoPerfil(pix.usuario_id, efeito.perfil);
      return `pagamento ${pagamento.status}${efeito.perfil ? ": plano grátis" : ""}`;
    }
    if (pagamento.status === "approved") {
      const efeito = regraDoPixAprovado(pix, pagamento, await banco.perfil(pix.usuario_id), agora());
      if (Object.keys(efeito.pix).length > 0) await banco.salvarPix(pix.id, efeito.pix);
      await aplicarNoPerfil(pix.usuario_id, efeito.perfil);
      if (efeito.motivo && efeito.motivo !== "já aplicado") registrar(`${pix.id} aprovado: ${efeito.motivo}`);
      return efeito.perfil ? `aprovado: assinante até ${efeito.pix.periodo_fim}` : `aprovado (${efeito.motivo ?? "sem mudança"})`;
    }
    if (pix.status === "pendente" || pix.status === "criando") {
      const campos = regraDoPixPendente(pix, pagamento, agora());
      if (Object.keys(campos).length > 0) await banco.salvarPix(pix.id, campos);
      return `pagamento ${pagamento.status}${campos.status ? ": vencido" : ""}`;
    }
    return `pagamento ${pagamento.status}`;
  };

  // Consulta um Pix no Mercado Pago (no máximo uma vez por intervalo) e aplica.
  const ultimaConsulta = new Map<string, number>();
  const consultar = async (pix: PixPagamento, intervaloMs: number): Promise<string | undefined> => {
    const agoraMs = agora().getTime();
    const ultima = ultimaConsulta.get(pix.id);
    if (ultima !== undefined && agoraMs - ultima < intervaloMs) return undefined;
    ultimaConsulta.set(pix.id, agoraMs);
    if (!pix.mp_payment_id) {
      // O pedido ao Mercado Pago não terminou (ou caiu no meio): sem id, depois de 10
      // minutos, é erro (se tiver sido criado, o webhook acha a linha pelo external_reference).
      if (agoraMs - new Date(pix.criado_em).getTime() > 10 * 60_000) {
        await banco.salvarPix(pix.id, {status: "erro"});
        return "sem pagamento no Mercado Pago: erro";
      }
      return undefined;
    }
    return aplicar(pix, await api.pagamento(pix.mp_payment_id));
  };

  // Webhook "payment" que não é de assinatura: é um Pix nosso? (pelo id gravado ou
  // pelo external_reference). Sem ser nosso: undefined.
  const doPagamento = async (mpPaymentId: string): Promise<string | undefined> => {
    let pix = await banco.pixPorPagamento(mpPaymentId);
    const pagamento = await api.pagamento(mpPaymentId);
    if (!pix && pagamento.payment_method_id === "pix" && pagamento.external_reference && /^[0-9a-f-]{36}$/iu.test(pagamento.external_reference)) {
      pix = await banco.pixPorId(pagamento.external_reference);
    }
    if (!pix) return undefined;
    return `Pix ${pix.id}: ${await aplicar(pix, pagamento)}`;
  };

  // Gera um Pix para a conta (ou devolve o que ainda está dentro do prazo). Quem chama
  // já conferiu se a conta pode pagar (motivoParaNaoPagarPix).
  const MARGEM_DO_PRAZO_MS = 5 * 60_000;
  const gerar = async (usuario: {id: string; email: string}, valor: number, cpf?: string, nivel: Nivel = "basico"): Promise<PixPagamento> => {
    const ultimo = await banco.ultimoPixDaConta(usuario.id);
    if (ultimo && (ultimo.status === "pendente" || ultimo.status === "criando")) {
      // Antes de largar o anterior, confere se ele foi pago.
      await consultar(ultimo, 0).catch((erro: unknown) => registrar(`conferir ${ultimo.id}: ${semCpf(erro instanceof Error ? erro.message : String(erro))}`));
      const atual = await banco.pixPorId(ultimo.id);
      // O mesmo Pix só se for do mesmo plano e valor (trocou de plano: um Pix novo).
      const mesmoPlano = (atual?.nivel ?? "basico") === nivel && Math.abs(Number(atual?.valor) - valor) < 0.005;
      if (mesmoPlano && atual?.status === "pendente" && atual.qr_code && atual.expira_em && new Date(atual.expira_em).getTime() - agora().getTime() > MARGEM_DO_PRAZO_MS) {
        return atual;
      }
    }
    const id = randomUUID();
    await banco.criarPix({id, usuario_id: usuario.id, valor, nivel});
    const expiraEm = new Date(agora().getTime() + VALIDADE_DO_PIX_MS);
    let pagamento: Pagamento;
    try {
      pagamento = await api.criarPix({id, email: usuario.email, valor, expiraEm, cpf});
    } catch (erro) {
      const mensagem = semCpf(erro instanceof Error ? erro.message : String(erro));
      await banco.salvarPix(id, {status: "erro"});
      registrar(`gerar para ${usuario.id}: ${mensagem}`);
      const codigo: CodigoDoErroDoPix = erroDeCpf(mensagem) ? (cpf ? "cpf-invalido" : "cpf-necessario") : "falhou";
      throw new ErroDoPix(codigo, MENSAGENS[codigo]);
    }
    const dados = pagamento.point_of_interaction?.transaction_data;
    if (!dados?.qr_code) {
      await banco.salvarPix(id, {status: "erro", mp_payment_id: String(pagamento.id)});
      registrar(`gerar para ${usuario.id}: resposta sem qr_code (${pagamento.id}, ${pagamento.status})`);
      throw new ErroDoPix("falhou", MENSAGENS.falhou);
    }
    const campos: Partial<PixPagamento> = {
      mp_payment_id: String(pagamento.id),
      status: "pendente",
      expira_em: pagamento.date_of_expiration ? new Date(pagamento.date_of_expiration).toISOString() : expiraEm.toISOString(),
      qr_code: dados.qr_code,
      qr_code_base64: dados.qr_code_base64 ?? null,
    };
    await banco.salvarPix(id, campos);
    registrar(`gerado para ${usuario.id} (${pagamento.id}), vence ${campos.expira_em}`);
    return {...(await banco.pixPorId(id))!, ...campos};
  };

  // A tela do Pix conferindo: consulta o último Pix da conta (no máximo a cada 5 s).
  const conferir = async (usuarioId: string): Promise<PixPagamento | undefined> => {
    const ultimo = await banco.ultimoPixDaConta(usuarioId);
    if (!ultimo) return undefined;
    if (ultimo.status === "pendente" || ultimo.status === "criando") {
      const resultado = await consultar(ultimo, 5_000).catch((erro: unknown) => `erro ${semCpf(erro instanceof Error ? erro.message : String(erro))}`);
      if (resultado) registrar(`conferido ${ultimo.id}: ${resultado}`);
      return banco.pixPorId(ultimo.id);
    }
    return ultimo;
  };

  // Verificação periódica (reserva do webhook): Pix pendentes dos últimos 2 dias, cada
  // um no máximo a cada 2 minutos, até 5 por rodada.
  const verificar = async (): Promise<string[]> => {
    const resultados: string[] = [];
    for (const pix of await banco.pixParaConferir(new Date(agora().getTime() - 2 * DIA))) {
      if (resultados.length >= 5) break;
      try {
        const resultado = await consultar(pix, 2 * 60_000);
        if (resultado) resultados.push(`verificação ${pix.id}: ${resultado}`);
      } catch (erro) {
        resultados.push(`verificação ${pix.id}: erro ${semCpf(erro instanceof Error ? erro.message : String(erro))}`);
      }
    }
    return resultados;
  };

  return {doPagamento, gerar, conferir, verificar};
};

// ---------- banco no Supabase (chave secreta) ----------
const CAMPOS = "id, usuario_id, mp_payment_id, status, valor, expira_em, qr_code, qr_code_base64, aprovado_em, periodo_inicio, periodo_fim, estornado_em, criado_em, nivel";
export const bancoDoPixNoSupabase = (admin: SupabaseClient, perfis: Pick<BancoDoPix, "perfil" | "salvarPerfil">): BancoDoPix => {
  const falha = (acao: string, erro: {message: string} | null) => {
    if (erro) throw new Error(`Pix: não foi possível ${acao}: ${erro.message}`);
  };
  const um = async (consulta: PromiseLike<{data: unknown; error: {message: string} | null}>, acao: string) => {
    const {data, error} = await consulta;
    falha(acao, error);
    return (data as PixPagamento | null) ?? undefined;
  };
  return {
    pixPorId: (id) => um(admin.from("pix_pagamentos").select(CAMPOS).eq("id", id).maybeSingle(), "ler o Pix"),
    pixPorPagamento: (mpId) => um(admin.from("pix_pagamentos").select(CAMPOS).eq("mp_payment_id", mpId).maybeSingle(), "ler o Pix"),
    ultimoPixDaConta: (usuarioId) =>
      um(admin.from("pix_pagamentos").select(CAMPOS).eq("usuario_id", usuarioId).order("criado_em", {ascending: false}).limit(1).maybeSingle(), "ler o Pix"),
    criarPix: async (linha) => {
      const criado = await um(admin.from("pix_pagamentos").insert({...linha, status: "criando"}).select(CAMPOS).single(), "criar o Pix");
      return criado!;
    },
    salvarPix: async (id, campos) => {
      const {error} = await admin
        .from("pix_pagamentos")
        .update({...campos, atualizado_em: new Date().toISOString()})
        .eq("id", id);
      falha("salvar o Pix", error);
    },
    pixParaConferir: async (desde) => {
      const {data, error} = await admin.from("pix_pagamentos").select(CAMPOS).in("status", ["criando", "pendente"]).gte("criado_em", desde.toISOString()).order("criado_em");
      falha("listar os Pix pendentes", error);
      return (data as PixPagamento[] | null) ?? [];
    },
    perfil: perfis.perfil,
    salvarPerfil: perfis.salvarPerfil,
  };
};

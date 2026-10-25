// Avisa quando um pagamento fica aprovado (cartão ou Pix), para o Purchase da Meta e o
// e-mail de boas-vindas. Só observa a gravação: as regras do pagamento continuam as de
// assinaturas.ts e pix.ts. O aviso roda depois de gravar e nunca quebra o pagamento.
import {nivelCobrado} from "./assinaturas";
import type {BancoDeAssinaturas} from "./assinaturas";
import type {BancoDoPix} from "./pix";
import {nivelPeloValor} from "./planos";
import type {Nivel} from "./planos";

// id: único por pagamento (compra-<id do Mercado Pago> ou pix-<id da linha>).
// nivel: o plano pago (no cartão, pelo valor cobrado; sem plano com esse valor, vazio).
// cupom: o cupom do checkout (só nos pagamentos com desconto) e a referência que conta o uso uma vez.
export type PagamentoAprovado = {usuarioId: string; id: string; valor: number | null; nivel?: Nivel; cupom?: {codigo: string; referencia: string}};
export type AoAprovar = (pagamento: PagamentoAprovado) => void;

const avisar = (aoAprovar: AoAprovar, pagamento: PagamentoAprovado) => {
  try {
    aoAprovar(pagamento);
  } catch (erro) {
    console.log(`Pagamento aprovado ${pagamento.id}: aviso falhou: ${erro instanceof Error ? erro.message : String(erro)}`);
  }
};

// Cartão: na primeira gravação aprovada de cada pagamento (a verificação grava de novo).
export const assinaturasAoAprovar = (banco: BancoDeAssinaturas, aoAprovar: AoAprovar | undefined): BancoDeAssinaturas =>
  aoAprovar
    ? {
        ...banco,
        salvarPagamento: async (pagamento) => {
          const aprovado = pagamento.status === "approved";
          const antes = aprovado ? await banco.pagamento(pagamento.mp_payment_id).catch(() => undefined) : undefined;
          await banco.salvarPagamento(pagamento);
          if (aprovado && antes?.status !== "approved") {
            // Valor de nenhum plano: cobrança com cupom (o nível e o cupom vêm da assinatura).
            let nivel = nivelPeloValor(pagamento.valor);
            let cupom: PagamentoAprovado["cupom"];
            if (!nivel) {
              const assinatura = await Promise.resolve()
                .then(() => banco.assinaturasDaConta(pagamento.usuario_id))
                .then((lista) => lista.find((a) => a.id === pagamento.assinatura_id))
                .catch(() => undefined);
              nivel = nivelCobrado(pagamento.valor, assinatura);
              if (assinatura?.cupom_codigo) cupom = {codigo: assinatura.cupom_codigo, referencia: `assinatura-${assinatura.id}`};
            }
            avisar(aoAprovar, {usuarioId: pagamento.usuario_id, id: `compra-${pagamento.mp_payment_id}`, valor: pagamento.valor, nivel, ...(cupom ? {cupom} : {})});
          }
        },
      }
    : banco;

// Pix: quando a linha vira "aprovado" (regraDoPixAprovado só aprova uma vez).
export const pixAoAprovar = (banco: BancoDoPix, aoAprovar: AoAprovar | undefined): BancoDoPix =>
  aoAprovar
    ? {
        ...banco,
        salvarPix: async (id, campos) => {
          await banco.salvarPix(id, campos);
          if (campos.status !== "aprovado") return;
          void banco
            .pixPorId(id)
            .then(
              (pix) =>
                pix &&
                avisar(aoAprovar, {
                  usuarioId: pix.usuario_id,
                  id: `pix-${id}`,
                  valor: Number(pix.valor),
                  nivel: pix.nivel ?? "basico",
                  ...(pix.cupom_codigo ? {cupom: {codigo: pix.cupom_codigo, referencia: `pix-${id}`}} : {}),
                }),
            )
            .catch((erro: unknown) => console.log(`Pagamento aprovado pix-${id}: ${erro instanceof Error ? erro.message : String(erro)}`));
        },
      }
    : banco;

// Avisa quando um pagamento fica aprovado (cartão ou Pix), para o Purchase da Meta e o
// e-mail de boas-vindas. Só observa a gravação: as regras do pagamento continuam as de
// assinaturas.ts e pix.ts. O aviso roda depois de gravar e nunca quebra o pagamento.
import type {BancoDeAssinaturas} from "./assinaturas";
import type {BancoDoPix} from "./pix";
import {nivelPeloValor} from "./planos";
import type {Nivel} from "./planos";

// id: único por pagamento (compra-<id do Mercado Pago> ou pix-<id da linha>).
// nivel: o plano pago (no cartão, pelo valor cobrado; sem plano com esse valor, vazio).
export type PagamentoAprovado = {usuarioId: string; id: string; valor: number | null; nivel?: Nivel};
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
            avisar(aoAprovar, {usuarioId: pagamento.usuario_id, id: `compra-${pagamento.mp_payment_id}`, valor: pagamento.valor, nivel: nivelPeloValor(pagamento.valor)});
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
            .then((pix) => pix && avisar(aoAprovar, {usuarioId: pix.usuario_id, id: `pix-${id}`, valor: Number(pix.valor), nivel: pix.nivel ?? "basico"}))
            .catch((erro: unknown) => console.log(`Pagamento aprovado pix-${id}: ${erro instanceof Error ? erro.message : String(erro)}`));
        },
      }
    : banco;

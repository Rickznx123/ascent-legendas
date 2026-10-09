# Pendências

O que ficou combinado para depois, com o motivo. Ao resolver, tire daqui.

## Assinatura: voltar a assinar o mesmo plano (ou um menor) logo depois de cancelar

Anotado em 09/10/2026.

**Hoje (versão simples):** quem cancelou e ainda está no período pago vê "Assinatura
cancelada, vale até DD/MM". Pode subir para um plano maior na hora, pela regra de
subir (paga cheio, o mês recomeça). O mesmo plano ou um menor fica desativado, com
"Você pode assinar de novo a partir de DD/MM". Depois dessa data, a conta volta ao
grátis e assina qualquer plano normalmente. A regra está em `decidirPedidoDePlano`
(`app/servidor/assinaturas.ts`), com testes.

**Pendente (versão com cobrança em data futura):** deixar assinar o mesmo plano ou
um menor ainda dentro do período, sem cobrar agora:

- Abrir um checkout novo do Mercado Pago com `auto_recurring.start_date` = fim do
  período pago (`ciclo_fim`): o cartão é cadastrado hoje e a primeira cobrança sai
  em DD/MM. Uma assinatura cancelada não pode ser reativada no Mercado Pago, por isso
  é uma assinatura nova.
- Quando o cartão for aceito (assinatura `authorized`, ainda sem cobrança), devolver
  a tolerância de 5 dias (`plano_ate` = `ciclo_fim` + 5 dias), para a pessoa não
  cair para grátis se a cobrança sair algumas horas depois de DD/MM.
- Na primeira cobrança aprovada: ciclo novo a partir dela, nível pelo valor cobrado.
  Recusada: a regra de sempre (5 dias de tolerância, depois grátis).
- Antes de implementar, testar no Mercado Pago de teste se o checkout de assinatura
  sem plano aceita `start_date` no futuro.
- Testes: assinatura nova autorizada sem cobrança não muda o nível nem o ciclo;
  primeira cobrança aprovada na data muda; recusada segue a tolerância.

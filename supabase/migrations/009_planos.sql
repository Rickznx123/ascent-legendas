-- Planos pagos Básico, Pro e Editor (o nível do assinante). Só mudanças aditivas:
-- colunas novas com padrão 'basico', nada removido nem renomeado. O código que já
-- está em produção não lê estas colunas e continua funcionando igual; quem já é
-- assinante (cartão ou Pix) fica no Básico, o plano de hoje (R$ 30, 30 minutos).
-- O campo plano continua 'gratis' ou 'assinante'; o nível só vale para assinante.
-- Como as outras colunas de plano, só o servidor (chave secreta) muda: o usuário
-- continua podendo alterar apenas o nome (grant update (nome), em 001_inicial.sql).

-- Nível que vale agora e, numa troca para um plano menor, o que passa a valer na
-- próxima renovação (vazio: nenhuma troca agendada).
alter table public.perfis add column if not exists nivel text not null default 'basico';
alter table public.perfis drop constraint if exists perfis_nivel_check;
alter table public.perfis add constraint perfis_nivel_check check (nivel in ('basico', 'pro', 'editor'));
alter table public.perfis add column if not exists nivel_na_renovacao text;
alter table public.perfis drop constraint if exists perfis_nivel_na_renovacao_check;
alter table public.perfis add constraint perfis_nivel_na_renovacao_check
  check (nivel_na_renovacao is null or nivel_na_renovacao in ('basico', 'pro', 'editor'));

-- Nível de cada assinatura por cartão e de cada Pix (o servidor confere o valor
-- pago contra o valor do plano antes de aplicar).
alter table public.assinaturas add column if not exists nivel text not null default 'basico';
alter table public.assinaturas drop constraint if exists assinaturas_nivel_check;
alter table public.assinaturas add constraint assinaturas_nivel_check check (nivel in ('basico', 'pro', 'editor'));

alter table public.pix_pagamentos add column if not exists nivel text not null default 'basico';
alter table public.pix_pagamentos drop constraint if exists pix_pagamentos_nivel_check;
alter table public.pix_pagamentos add constraint pix_pagamentos_nivel_check check (nivel in ('basico', 'pro', 'editor'));

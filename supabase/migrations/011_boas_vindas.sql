-- E-mail de boas-vindas (veja app/servidor/boas-vindas.ts): enviado uma vez só, no
-- primeiro pagamento aprovado da conta. Vazia: ainda não enviado. Só o servidor grava
-- (o usuário continua podendo alterar apenas o nome, em 001_inicial.sql).
alter table public.perfis add column if not exists boas_vindas_enviado_em timestamptz;

-- Quem já pagou antes desta migração não recebe as boas-vindas na próxima renovação.
update public.perfis p set boas_vindas_enviado_em = now()
where p.boas_vindas_enviado_em is null
  and (
    exists (select 1 from public.pagamentos_assinatura c where c.usuario_id = p.id and c.status = 'approved')
    or exists (select 1 from public.pix_pagamentos x where x.usuario_id = p.id and x.status in ('aprovado', 'estornado'))
  );

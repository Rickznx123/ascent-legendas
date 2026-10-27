-- E-mails de recuperação (veja app/servidor/recuperacao.ts): quando cada um saiu
-- (reservado antes de enviar, como boas_vindas_enviado_em; o mesmo e-mail nunca sai
-- duas vezes) e quem saiu da lista (o link do rodapé). Só o servidor escreve.
alter table public.perfis add column if not exists recuperacao_1h_em timestamptz;
alter table public.perfis add column if not exists recuperacao_24h_em timestamptz;
alter table public.perfis add column if not exists aviso_render_em timestamptz;
alter table public.perfis add column if not exists emails_desligados_em timestamptz;

create index if not exists perfis_criado_em on public.perfis (criado_em);

-- Banner do grupo do WhatsApp na tela inicial (veja app/servidor/grupo.ts): quando a
-- pessoa entrou no grupo (some de vez), quando fechou no ✕ pela última vez e quantas
-- vezes fechou (volta depois de 3 dias, até 3 vezes). Só o servidor grava.
alter table public.perfis add column if not exists grupo_entrou_em timestamptz;
alter table public.perfis add column if not exists grupo_fechou_em timestamptz;
alter table public.perfis add column if not exists grupo_fechamentos integer not null default 0;

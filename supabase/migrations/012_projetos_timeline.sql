-- Cortes estilo CapCut (PLANO-CORTES.md): um projeto com vários vídeos numa timeline.
-- Só mudanças aditivas: o código que já está em produção não lê estas colunas e
-- continua funcionando igual. Colar no SQL Editor do Supabase e rodar. Pode rodar de novo.

-- Os trechos da timeline: {"trechos": [{"id", "video", "inicioMs", "fimMs"}]}, na ordem
-- do vídeo final. Vazio num projeto antigo: o servidor lê como 1 trecho com o vídeo
-- inteiro (projetos.video). Os vídeos originais nunca são alterados.
alter table public.projetos add column if not exists timeline jsonb;
-- Última vez que o projeto foi aberto, e quando os vídeos brutos foram apagados por
-- falta de uso (Bloco 5).
alter table public.projetos add column if not exists acessado_em timestamptz not null default now();
alter table public.projetos add column if not exists brutos_apagados_em timestamptz;

-- envios: cada vídeo enviado, para o limite mensal de material bruto (Bloco 5).
-- Só o servidor insere (chave secreta); o usuário apenas lê os seus. O registro fica
-- mesmo se o vídeo for apagado (o limite já foi usado).
create table if not exists public.envios (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  video text not null,
  duracao_s numeric(10, 3) not null default 0 check (duracao_s >= 0),
  bytes bigint not null default 0 check (bytes >= 0),
  criado_em timestamptz not null default now()
);
create index if not exists envios_usuario_criado on public.envios (usuario_id, criado_em desc);

alter table public.envios enable row level security;
drop policy if exists "envios: ler os próprios" on public.envios;
create policy "envios: ler os próprios" on public.envios
  for select to authenticated
  using (usuario_id = (select auth.uid()));
revoke insert, update, delete on public.envios from anon, authenticated;
revoke all on public.envios from anon;

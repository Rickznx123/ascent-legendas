-- Eventos do funil: uma linha por etapa (envio, transcrição, prévia, edição, exportação,
-- limite do grátis, oferta), para medir onde as pessoas param. Só o servidor grava e lê
-- (a chave secreta); o usuário não vê nada desta tabela.
create table if not exists public.eventos (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  nome text not null,
  dados jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists eventos_usuario_criado on public.eventos (usuario_id, criado_em);
create index if not exists eventos_nome_criado on public.eventos (nome, criado_em);

alter table public.eventos enable row level security;
revoke all on public.eventos from anon, authenticated;

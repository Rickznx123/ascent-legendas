-- Etapa 2a: perfis, projetos por usuário e exportações.
-- Colar inteiro no SQL Editor do Supabase e rodar uma vez. Pode rodar de novo sem
-- duplicar nada (if not exists / or replace / drop ... if exists).
--
-- Segurança: todas as tabelas com RLS ligado. Cada usuário só lê e altera o que é
-- dele. O plano e as exportações só mudam pelo servidor (chave secreta, que ignora
-- o RLS); nada aqui libera escrita nelas para o usuário.

-- ---------------------------------------------------------------------------
-- perfis: um por usuário, criado no cadastro (trigger em auth.users).
-- ---------------------------------------------------------------------------
create table if not exists public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text,
  plano text not null default 'gratis' check (plano in ('gratis', 'assinante')),
  criado_em timestamptz not null default now()
);

alter table public.perfis enable row level security;

drop policy if exists "perfis: ler o próprio" on public.perfis;
create policy "perfis: ler o próprio" on public.perfis
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "perfis: alterar o próprio" on public.perfis;
create policy "perfis: alterar o próprio" on public.perfis
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- O usuário só pode mudar o nome; o plano só muda pelo servidor.
revoke insert, update, delete on public.perfis from anon, authenticated;
grant update (nome) on public.perfis to authenticated;

-- Cria o perfil no cadastro. security definer: roda com o dono da função (o
-- usuário recém-criado ainda não pode inserir em perfis).
create or replace function public.criar_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfis (id, nome)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil();

-- Usuários que já existiam antes desta migração também ganham perfil.
insert into public.perfis (id, nome)
select id, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- projetos: o projeto inteiro (o transcricao.json de hoje) em dados.
-- ---------------------------------------------------------------------------
create table if not exists public.projetos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null,
  dados jsonb not null default '{}'::jsonb,
  -- Referência do vídeo: por enquanto o arquivo no disco do servidor (pasta do
  -- usuário); na Etapa 3, a chave no S3.
  video text,
  duracao_s numeric(10, 3) check (duracao_s is null or duracao_s >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists projetos_usuario_atualizado on public.projetos (usuario_id, atualizado_em desc);

alter table public.projetos enable row level security;

drop policy if exists "projetos: ler os próprios" on public.projetos;
create policy "projetos: ler os próprios" on public.projetos
  for select to authenticated
  using (usuario_id = (select auth.uid()));

drop policy if exists "projetos: criar os próprios" on public.projetos;
create policy "projetos: criar os próprios" on public.projetos
  for insert to authenticated
  with check (usuario_id = (select auth.uid()));

drop policy if exists "projetos: alterar os próprios" on public.projetos;
create policy "projetos: alterar os próprios" on public.projetos
  for update to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

drop policy if exists "projetos: apagar os próprios" on public.projetos;
create policy "projetos: apagar os próprios" on public.projetos
  for delete to authenticated
  using (usuario_id = (select auth.uid()));

-- Visitante sem login não faz nada.
revoke all on public.projetos from anon;

-- atualizado_em acompanha cada alteração.
create or replace function public.marcar_atualizacao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists projetos_atualizado_em on public.projetos;
create trigger projetos_atualizado_em
  before update on public.projetos
  for each row execute function public.marcar_atualizacao();

-- ---------------------------------------------------------------------------
-- exportacoes: cada vídeo exportado (para contar os minutos na Etapa 2b).
-- Só o servidor insere; o usuário apenas lê as suas.
-- ---------------------------------------------------------------------------
create table if not exists public.exportacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  -- O registro fica mesmo se o projeto for apagado (os minutos já foram usados).
  projeto_id uuid references public.projetos (id) on delete set null,
  duracao_s numeric(10, 3) not null check (duracao_s >= 0),
  com_marca_dagua boolean not null default false,
  criado_em timestamptz not null default now()
);

create index if not exists exportacoes_usuario_criado on public.exportacoes (usuario_id, criado_em desc);

alter table public.exportacoes enable row level security;

drop policy if exists "exportacoes: ler as próprias" on public.exportacoes;
create policy "exportacoes: ler as próprias" on public.exportacoes
  for select to authenticated
  using (usuario_id = (select auth.uid()));

-- Sem política de insert/update/delete: só a chave secreta (servidor) escreve.
revoke insert, update, delete on public.exportacoes from anon, authenticated;
revoke all on public.exportacoes from anon;

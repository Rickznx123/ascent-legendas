-- Etapa 3, bloco 6: cada exportação no Lambda. O servidor cria a linha ao disparar
-- o render e o vigia (app/servidor/renders.ts) acompanha as que estão em andamento,
-- inclusive depois de o servidor reiniciar. Só quando o render termina com sucesso
-- a exportação é registrada em exportacoes (o desconto do plano); na falha, não.
-- Só o servidor grava (com a chave secreta); o usuário apenas lê as suas.
-- Colar no SQL Editor do Supabase e rodar. Pode rodar de novo.
create table if not exists public.renders (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  -- O registro fica mesmo se o projeto for apagado.
  projeto_id uuid references public.projetos (id) on delete set null,
  video text not null,
  situacao text not null default 'andamento' check (situacao in ('andamento', 'pronto', 'falhou')),
  -- 0 a 1.
  progresso numeric(4, 3) not null default 0 check (progresso >= 0 and progresso <= 1),
  -- Para perguntar o andamento ao Lambda (vazio enquanto o render não começou).
  render_id text,
  funcao text,
  bucket_remotion text,
  -- Onde o vídeo pronto fica no bucket dos vídeos (exportados/<conta>/...).
  saida_chave text not null,
  -- A decisão do plano no momento do pedido: desconta só se terminar.
  duracao_s numeric(10, 3) not null default 0 check (duracao_s >= 0),
  desconto_s numeric(10, 3) not null default 0 check (desconto_s >= 0),
  com_marca boolean not null default false,
  erro text,
  custo_usd numeric(10, 4),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  terminado_em timestamptz
);
create index if not exists renders_usuario_video on public.renders (usuario_id, video, criado_em desc);
-- O vigia só olha as que estão em andamento.
create index if not exists renders_em_andamento on public.renders (criado_em) where situacao = 'andamento';

alter table public.renders enable row level security;
drop policy if exists "renders: ler os próprios" on public.renders;
create policy "renders: ler os próprios" on public.renders
  for select to authenticated
  using (usuario_id = (select auth.uid()));
revoke insert, update, delete on public.renders from anon, authenticated;
revoke all on public.renders from anon;

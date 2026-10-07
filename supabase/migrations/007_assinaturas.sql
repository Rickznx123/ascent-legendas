-- Etapa 2c: assinatura pelo Mercado Pago (R$ 30 por mês, 30 minutos exportados por
-- ciclo). O servidor cria a assinatura no Mercado Pago, recebe os webhooks e, depois
-- de consultar o Mercado Pago, atualiza estas tabelas e o plano do perfil (veja
-- app/servidor/assinaturas.ts). Só o servidor grava (com a chave secreta); o usuário
-- apenas lê as suas.
-- Colar no SQL Editor do Supabase e rodar. Pode rodar de novo.

-- Plano do perfil: de onde ele vem e até quando vale.
--   plano_origem 'manual' (padrão): definido pelo npm run plano (testadores) ou o
--     grátis de sempre; a assinatura não mexe.
--   plano_origem 'assinatura': definido pelos pagamentos. plano_ate: até quando vale
--     o assinante (fim do ciclo pago + 5 dias de tolerância; com a assinatura
--     cancelada, o fim do ciclo). ciclo_inicio e ciclo_fim: o ciclo pago atual (os
--     30 minutos contam dentro dele).
alter table public.perfis add column if not exists plano_origem text not null default 'manual';
alter table public.perfis drop constraint if exists perfis_plano_origem_check;
alter table public.perfis add constraint perfis_plano_origem_check check (plano_origem in ('manual', 'assinatura'));
alter table public.perfis add column if not exists plano_ate timestamptz;
alter table public.perfis add column if not exists ciclo_inicio timestamptz;
alter table public.perfis add column if not exists ciclo_fim timestamptz;

-- Uma linha por assinatura criada no Mercado Pago (preapproval).
create table if not exists public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  mp_preapproval_id text not null unique,
  status text not null default 'pendente' check (status in ('pendente', 'autorizada', 'pausada', 'cancelada')),
  valor numeric(10, 2) not null,
  -- Link do checkout do Mercado Pago (reaproveitado se a pessoa tocar em Assinar de novo).
  init_point text,
  -- Até quando o último pagamento cobre e a próxima cobrança prevista.
  pago_ate timestamptz,
  proxima_cobranca timestamptz,
  -- A última cobrança falhou (aviso na tela; volta a vazio quando um pagamento entra).
  cobranca_falhou_em timestamptz,
  cancelada_em timestamptz,
  estornada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists assinaturas_usuario on public.assinaturas (usuario_id, criado_em desc);

-- Cada pagamento de assinatura (o mesmo pagamento nunca é contado duas vezes).
create table if not exists public.pagamentos_assinatura (
  id uuid primary key default gen_random_uuid(),
  mp_payment_id text not null unique,
  assinatura_id uuid not null references public.assinaturas (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  status text not null,
  valor numeric(10, 2),
  pago_em timestamptz,
  dados jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists pagamentos_assinatura_usuario on public.pagamentos_assinatura (usuario_id, criado_em desc);

-- Webhooks recebidos: o x-request-id é único (evento repetido é ignorado); o
-- processamento acontece depois da resposta e é refeito se falhar.
create table if not exists public.eventos_mercadopago (
  request_id text primary key,
  tipo text not null,
  data_id text not null,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  tentativas integer not null default 0,
  erro text
);
create index if not exists eventos_mercadopago_pendentes on public.eventos_mercadopago (recebido_em) where processado_em is null;

alter table public.assinaturas enable row level security;
drop policy if exists "assinaturas: ler as próprias" on public.assinaturas;
create policy "assinaturas: ler as próprias" on public.assinaturas
  for select to authenticated
  using (usuario_id = (select auth.uid()));
revoke insert, update, delete on public.assinaturas from anon, authenticated;
revoke all on public.assinaturas from anon;

alter table public.pagamentos_assinatura enable row level security;
drop policy if exists "pagamentos_assinatura: ler os próprios" on public.pagamentos_assinatura;
create policy "pagamentos_assinatura: ler os próprios" on public.pagamentos_assinatura
  for select to authenticated
  using (usuario_id = (select auth.uid()));
revoke insert, update, delete on public.pagamentos_assinatura from anon, authenticated;
revoke all on public.pagamentos_assinatura from anon;

-- Só o servidor lê e grava os eventos.
alter table public.eventos_mercadopago enable row level security;
revoke all on public.eventos_mercadopago from anon, authenticated;

-- Cupons de desconto no checkout (cartão e Pix, todos os planos). O servidor valida o
-- cupom (nunca o navegador), cobra o valor com desconto e conta o uso só quando o
-- pagamento é aprovado (veja app/servidor/cupons.ts). Só aditivo. Só o servidor (chave
-- secreta) lê e grava os cupons.
-- Colar no SQL Editor do Supabase e rodar. Pode rodar de novo. Precisa da 009.

-- O código fica sempre em maiúsculas: a busca não diferencia maiúscula de minúscula.
create table if not exists public.cupons (
  codigo text primary key check (codigo = upper(codigo) and codigo ~ '^[A-Z0-9_-]{1,40}$'),
  percentual numeric(5, 2) not null check (percentual > 0 and percentual < 100),
  -- true: o desconto vale só na 1ª cobrança do cartão (depois volta o preço cheio).
  so_primeiro_mes boolean not null default true,
  valido_ate timestamptz,
  max_usos integer check (max_usos is null or max_usos > 0),
  usos integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Cada uso contado (referencia: assinatura-<id> ou pix-<id>): o mesmo checkout nunca
-- conta duas vezes, mesmo com webhooks repetidos e as cobranças mensais.
create table if not exists public.cupons_usos (
  referencia text primary key,
  codigo text not null references public.cupons (codigo),
  criado_em timestamptz not null default now()
);

create or replace function public.contar_uso_do_cupom(p_codigo text, p_referencia text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.cupons_usos (referencia, codigo) values (p_referencia, p_codigo) on conflict do nothing;
  if found then
    update public.cupons set usos = usos + 1 where codigo = p_codigo;
  end if;
end $$;
revoke all on function public.contar_uso_do_cupom(text, text) from public, anon, authenticated;

alter table public.cupons enable row level security;
revoke all on public.cupons from anon, authenticated;
alter table public.cupons_usos enable row level security;
revoke all on public.cupons_usos from anon, authenticated;

-- Qual cupom cada checkout usou (vazio: preço cheio).
alter table public.assinaturas add column if not exists cupom_codigo text;
alter table public.assinaturas add column if not exists cupom_so_primeiro_mes boolean;
alter table public.pix_pagamentos add column if not exists cupom_codigo text;

-- Exemplo para criar um cupom (troque os valores):
-- insert into public.cupons (codigo, percentual, so_primeiro_mes, valido_ate, max_usos)
-- values ('BEMVINDO20', 20, true, '2026-12-31 23:59:59-03', 100);

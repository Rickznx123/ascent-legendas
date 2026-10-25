-- Minutos bônus manuais por conta (exceções, não acúmulo): somam aos minutos do plano
-- no ciclo enquanto now() < bonus_ate (vazio: não conta). Só aditivo. Só o dono define,
-- por SQL; o usuário continua podendo alterar apenas o nome (grant update (nome), em
-- 001_inicial.sql). Colar no SQL Editor do Supabase e rodar. Pode rodar de novo.
alter table public.perfis add column if not exists minutos_bonus numeric(10, 2) not null default 0;
alter table public.perfis add column if not exists bonus_ate timestamptz;

-- Exemplo: 30 minutos a mais até o fim de novembro para uma conta.
-- update public.perfis set minutos_bonus = 30, bonus_ate = '2026-11-30 23:59:59-03'
-- where id = (select id from auth.users where email = 'pessoa@exemplo.com');

-- Etapa 2d: Pix avulso de 30 dias pelo Mercado Pago (R$ 30 = 30 dias de assinante, sem
-- renovação). O servidor cria o Pix no Mercado Pago, recebe os webhooks e, depois de
-- consultar o Mercado Pago, atualiza esta tabela e o plano do perfil (veja
-- app/servidor/pix.ts). Só o servidor grava (com a chave secreta); o usuário apenas
-- lê os seus. Nenhum dado do pagador (CPF, nome) é guardado aqui.
-- Colar no SQL Editor do Supabase e rodar. Pode rodar de novo. Precisa da 007.

-- Plano do perfil: 'pix' é o assinante pago por Pix. plano_ate: fim do último período
-- pago (sem tolerância); ciclo_inicio: começo dos períodos seguidos (os 30 minutos
-- renovam a cada 30 dias a partir dele); ciclo_fim: fim do primeiro desses ciclos.
alter table public.perfis drop constraint if exists perfis_plano_origem_check;
alter table public.perfis add constraint perfis_plano_origem_check check (plano_origem in ('manual', 'assinatura', 'pix'));

-- Um Pix gerado. O id é o external_reference no Mercado Pago (é por ele que o webhook
-- acha a linha, mesmo se o mp_payment_id não chegou a ser gravado).
create table if not exists public.pix_pagamentos (
  id uuid primary key,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  mp_payment_id text unique,
  -- criando: pedido ao Mercado Pago em curso; pendente: esperando o pagamento;
  -- aprovado: pago (dá o período); vencido: passou do prazo sem pagar (ou cancelado);
  -- estornado: devolvido ou contestado; erro: o Mercado Pago não criou.
  status text not null default 'criando' check (status in ('criando', 'pendente', 'aprovado', 'vencido', 'estornado', 'erro')),
  valor numeric(10, 2) not null,
  expira_em timestamptz,
  -- Código copia e cola e a imagem do QR code (para mostrar de novo se a tela fechar).
  qr_code text,
  qr_code_base64 text,
  aprovado_em timestamptz,
  -- Os 30 dias que este pagamento dá (somados ao fim do período anterior, se ainda vale).
  periodo_inicio timestamptz,
  periodo_fim timestamptz,
  estornado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists pix_pagamentos_usuario on public.pix_pagamentos (usuario_id, criado_em desc);
create index if not exists pix_pagamentos_pendentes on public.pix_pagamentos (criado_em) where status in ('criando', 'pendente');

alter table public.pix_pagamentos enable row level security;
drop policy if exists "pix_pagamentos: ler os próprios" on public.pix_pagamentos;
create policy "pix_pagamentos: ler os próprios" on public.pix_pagamentos
  for select to authenticated
  using (usuario_id = (select auth.uid()));
revoke insert, update, delete on public.pix_pagamentos from anon, authenticated;
revoke all on public.pix_pagamentos from anon;

-- Etapa 3, bloco 5: cada transcrição que terminou, para o limite diário do plano
-- (grátis: 3 por dia; assinante: 30; o dia vira à meia-noite de Brasília).
-- "Recomeçar do zero" também é gravado aqui; a detecção de voz sozinha (Sincronia
-- precisa em projeto antigo) e as transcrições que falharam, não.
-- Só o servidor insere (com a chave secreta); o usuário apenas lê as suas.
-- Colar no SQL Editor do Supabase e rodar. Pode rodar de novo.
create table if not exists public.transcricoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  -- Nome do vídeo transcrito (o registro fica mesmo se o vídeo ou o projeto sair).
  video text not null,
  -- whisperx, groq ou local.
  motor text not null,
  -- Duração do áudio transcrito.
  duracao_s numeric(10, 3) not null default 0 check (duracao_s >= 0),
  criado_em timestamptz not null default now()
);
create index if not exists transcricoes_usuario_criado on public.transcricoes (usuario_id, criado_em desc);

alter table public.transcricoes enable row level security;
drop policy if exists "transcricoes: ler as próprias" on public.transcricoes;
create policy "transcricoes: ler as próprias" on public.transcricoes
  for select to authenticated
  using (usuario_id = (select auth.uid()));
revoke insert, update, delete on public.transcricoes from anon, authenticated;
revoke all on public.transcricoes from anon;

-- Etapa 2b: quanto cada exportação descontou do plano.
-- descontado_s: segundos descontados (a duração do vídeo na primeira exportação do
-- projeto e a partir da sexta reexportação; 0 nas reexportações sem desconto).
-- Gravado pelo servidor no momento da exportação: o histórico não muda depois,
-- nem se o projeto for apagado. Colar no SQL Editor do Supabase e rodar. Pode
-- rodar de novo.
alter table public.exportacoes
  add column if not exists descontado_s numeric(10, 3) not null default 0
  check (descontado_s >= 0);

-- Reexportações do mesmo projeto (contagem por projeto).
create index if not exists exportacoes_projeto on public.exportacoes (projeto_id);

-- O usuário continua só lendo as suas (sem insert/update/delete; veja 001).
revoke insert, update, delete on public.exportacoes from anon, authenticated;

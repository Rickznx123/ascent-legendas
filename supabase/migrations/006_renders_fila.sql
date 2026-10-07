-- Etapa 3, bloco 7: fila geral de renders. Acima de 20 renders no Lambda ao mesmo
-- tempo, a exportação espera na fila (situação 'fila'), e o servidor dispara quando
-- abre vaga. A fila fica na tabela, então sobrevive a um reinício do servidor: as
-- props do render (sem o vídeo), onde está o vídeo e o tamanho dos pedaços ficam
-- guardados até o render começar.
-- Colar no SQL Editor do Supabase e rodar. Pode rodar de novo.
alter table public.renders drop constraint if exists renders_situacao_check;
alter table public.renders
  add constraint renders_situacao_check check (situacao in ('fila', 'andamento', 'pronto', 'falhou'));

alter table public.renders add column if not exists props jsonb;
alter table public.renders add column if not exists video_chave text;
alter table public.renders add column if not exists quadros_por_lambda integer;

-- O despachante pega os mais antigos da fila.
create index if not exists renders_na_fila on public.renders (criado_em) where situacao = 'fila';

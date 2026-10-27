-- Eventos da página de apresentação, antes de haver conta ("Testar grátis", "Assinar"):
-- o id do visitante (gerado no navegador) no lugar do usuario_id. Precisa da 015.
alter table public.eventos alter column usuario_id drop not null;
alter table public.eventos add column if not exists visitante text;
alter table public.eventos drop constraint if exists eventos_dono;
alter table public.eventos add constraint eventos_dono check (usuario_id is not null or visitante is not null);

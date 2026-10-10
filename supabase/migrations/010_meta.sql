-- Origem do cadastro para a API de Conversões da Meta (veja app/servidor/meta.ts):
-- os cookies _fbp e _fbc, o IP e o user agent do momento em que a conta foi criada,
-- mandados junto nos eventos do servidor (CompleteRegistration e Purchase).
-- Só aditivo. Só o servidor (chave secreta) grava: o usuário continua podendo
-- alterar apenas o nome (grant update (nome), em 001_inicial.sql).
alter table public.perfis add column if not exists meta_fbp text;
alter table public.perfis add column if not exists meta_fbc text;
alter table public.perfis add column if not exists meta_ip text;
alter table public.perfis add column if not exists meta_ua text;

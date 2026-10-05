-- Um erro ao criar o perfil não trava o cadastro.
-- O trigger roda na mesma transação que cria o usuário em auth.users: qualquer
-- exceção nele desfaz o cadastro inteiro ("Database error saving new user").
-- Aqui a falha vira um aviso no log do Postgres e o cadastro segue; o servidor
-- cria o perfil que faltar no primeiro acesso (plano 'gratis').
-- Colar no SQL Editor do Supabase e rodar. Pode rodar de novo.
create or replace function public.criar_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.perfis (id, nome)
    values (
      new.id,
      coalesce(
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name',
        split_part(new.email, '@', 1)
      )
    )
    on conflict (id) do nothing;
  exception when others then
    raise warning 'criar_perfil: perfil de % não criado: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

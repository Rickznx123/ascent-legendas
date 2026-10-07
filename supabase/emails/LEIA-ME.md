# Modelos de e-mail do login (Supabase)

Onde colar: Supabase → **Authentication → Emails → Templates** (em algumas versões
do painel: **Authentication → Email Templates**). Em cada modelo, troque o
**Subject** e cole o conteúdo do arquivo em **Message body** (aba Source/HTML),
depois **Save changes**.

| Modelo no Supabase | Subject | Arquivo |
|---|---|---|
| Confirm signup | `Confirme seu cadastro no Ascent Legendas` | `confirmar-cadastro.html` |
| Reset password | `Crie uma senha nova no Ascent Legendas` | `redefinir-senha.html` |

- `{{ .ConfirmationURL }}` e `{{ .Email }}` são preenchidos pelo Supabase: não mexa.
- O link aparece no botão e também em texto (para quem não consegue tocar no botão).
- Sem cores de fundo fixas: o modo escuro do aplicativo de e-mail ajusta o texto
  sozinho; só o botão tem cor própria (roxo com texto branco, legível nos dois).

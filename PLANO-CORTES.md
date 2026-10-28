# Cortes estilo CapCut — plano

Objetivo: hoje a pessoa entra e já envia um vídeo. Passa a ser: **cria um projeto →
monta o vídeo numa timeline (quantos vídeos quiser) → corta → gera as legendas** na
tela de legendas que já existe.

Levantado em 23/10/2026, lendo o código atual. Este documento é só o plano: nada de
código foi alterado.

---

## A ideia central (o que NÃO muda)

Hoje tudo gira em torno de **um vídeo = um projeto**: a tela de legendas, a prévia
leve, a transcrição, a exportação no Lambda e a cota usam o nome do vídeo
(`projeto.source`, coluna `projetos.video`).

O plano mantém isso. A timeline fica **antes** da tela de legendas:

1. A pessoa monta e corta os vídeos na timeline (só uma lista de trechos, nada é
   cortado de verdade).
2. Em "Gerar legendas", o servidor monta **um vídeo novo** só com os trechos
   (`projeto-<id>-v<n>.mp4`, no S3, em `videos/<conta>/`).
3. Esse vídeo montado vira o `source` do projeto de legendas de sempre. Dali em
   diante, prévia leve, transcrição (WhisperX), edição das legendas, cota e
   exportação no Lambda funcionam **sem nenhuma mudança**.

Vantagem: a parte que já funciona (e foi difícil de acertar: sincronia, encaixe,
render) não é tocada. Não precisa mexer em `src/` nem republicar o site do Lambda.

**Modo local (sem Supabase no .env):** continua como hoje, sem projetos nem timeline.
Os projetos dependem do login (a tabela `projetos` é do Supabase).

---

## Decisões que preciso de você antes de começar

| # | Assunto | Minha recomendação |
|---|---|---|
| 1 | **Onde montar o vídeo final** (ffmpeg concat, Bloco 4) | **No servidor do Render**, na mesma fila da prévia leve (já fazemos uma conversão do vídeo inteiro lá hoje). Custo: o Render baixa os brutos do S3 (saída da AWS para a internet, ~US$ 0,09/GB). Se o volume crescer, mover para um Lambda na mesma região (sem esse custo; o `medicao/conversao-lambda.ts` já mediu isso). |
| 2 | **Limite de material bruto no plano grátis** (Bloco 5). O grátis não tem minutos de exportação (é 1 vídeo de até 2 min), então "3x" não se aplica direto. | **6 min por mês** (3 × 2 min). |
| 3 | **Apagar brutos X dias depois do último acesso** (Bloco 5). Hoje o S3 já apaga tudo em `videos/` 30 dias depois do envio, com ou sem acesso. | Manter a regra de 30 dias do S3 como teto e o servidor apagar antes, com **X = 14 dias** sem abrir o projeto. Mais simples (nenhuma regra nova no S3). Se quiser que um projeto usado guarde os brutos por mais de 30 dias, aí precisa de uma pasta nova no bucket sem expiração (mais armazenamento). |
| 4 | **Vídeos de formatos diferentes** (um em pé, outro deitado) | O vídeo final usa o tamanho do **primeiro trecho**; os outros entram ajustados com faixa preta (sem cortar imagem). |

---

## Como os cortes ficam salvos

Coluna nova `projetos.timeline` (JSON). Os arquivos originais nunca são alterados.

```json
{
  "trechos": [
    {"id": "a1", "video": "take1.mp4", "inicioMs": 1200, "fimMs": 8400},
    {"id": "b7", "video": "take2.mp4", "inicioMs": 0, "fimMs": 5100}
  ],
  "pausas": {"take1.mp4": [[3100, 3900], [6020, 6700]]},
  "montado": {"video": "projeto-<id>-v2.mp4", "dosTrechos": "<resumo dos trechos usados>"}
}
```

- A ordem dos trechos é a ordem do vídeo final.
- `pausas`: os silêncios já detectados de cada vídeo (para "Remover pausas" não
  rodar o ffmpeg de novo).
- `montado.dosTrechos`: um resumo (hash) dos trechos usados na última montagem. Se
  a timeline atual for diferente, a tela sabe que os cortes mudaram (Bloco 4).

---

## BLOCO 1 — Projetos e tela inicial

**O que muda**
- Migração nova: `supabase/migrations/012_projetos_timeline.sql` (você roda à mão).
  Só mudanças que somam (o código em produção continua funcionando antes de publicar):
  - `projetos.timeline jsonb`, `projetos.etapa text` (`edicao` ou `legendado`),
    `projetos.acessado_em timestamptz`, `projetos.brutos_apagados_em timestamptz`;
  - `projetos.video` passa a poder ser vazio num projeto novo (já pode: não é `not null`);
  - projetos antigos: `timeline` = 1 trecho com o vídeo inteiro e `etapa` = `legendado`
    (o SQL preenche);
  - tabela `envios` (usada no Bloco 5; criada já aqui para ser uma migração só):
    quem enviou, qual vídeo, duração, tamanho e quando. RLS: o usuário só lê as suas;
    só o servidor escreve (igual a `transcricoes`).
- Servidor (`app/servidor/espaco.ts` e `servidor.ts`):
  - `GET /api/projetos`: lista (nome, data, etapa, capa do primeiro vídeo);
  - `POST /api/projetos {nome}`: cria e devolve o id;
  - `GET/PUT /api/projetos/:id`: lê e salva nome e timeline (confere que os vídeos
    são da conta); o `GET` atualiza `acessado_em`;
  - `DELETE /api/projetos/:id`: apaga o projeto, os brutos e o montado.
  - Vídeos enviados antes, que ainda não têm projeto: ganham um projeto de 1 vídeo
    na primeira vez que a lista é aberta (para não sumirem).
- Tela:
  - computador: tela nova **Projetos** (`app/web/Projetos.tsx`) antes do editor, com
    "Novo projeto" e os cartões (miniatura, nome, data, etiqueta "Em edição" /
    "Legendado"). Abrir um projeto legendado vai direto para a tela de legendas de hoje;
    um em edição, para a timeline;
  - celular: a lista de vídeos do `celular/Inicio.tsx` vira a lista de projetos (o
    quadro do plano continua lá);
  - "Novo projeto": uma janelinha só com o nome.
  - Neste bloco o editor de timeline ainda é simples: a lista dos vídeos e o "+" (o
    envio de hoje, que já vai direto ao S3).

**Testar:** criar projeto, ver na lista, abrir; projetos antigos aparecem com
"Legendado" e abrem as legendas como antes; vídeo enviado sem projeto aparece.

**Custo novo:** nenhum.

---

## BLOCO 2 — Timeline

**O que muda**
- Componente novo `app/web/Timeline.tsx` (um só para computador e celular, com
  eventos de ponteiro, que servem para mouse e dedo):
  - "+" adiciona vídeos (vários de uma vez); entram no fim, um depois do outro;
  - arrastar um trecho para reordenar;
  - dividir no cursor (botão e tecla S);
  - excluir trecho (botão e Delete);
  - aparar as bordas arrastando o começo ou o fim do trecho;
  - desfazer/refazer (Ctrl+Z / Ctrl+Shift+Z e botões), histórico só da timeline.
  - Miniaturas: a capa de cada vídeo (já existe) repetida ao longo do trecho.
- Lógica pura da timeline em `app/web/trechos.ts` (no Windows, `timeline.ts` colide com `Timeline.tsx`) (dividir, aparar, excluir, mover,
  converter tempo da timeline ↔ tempo do vídeo), com um teste pequeno (`tsx --test`).
- **Prévia tocando a sequência cortada:** o Remotion Player que já usamos, com uma
  `Series` de vídeos (um por trecho), lendo a prévia leve de cada vídeo (H.264 540p, que
  toca em qualquer navegador). Nada é montado para a prévia.
- Salvamento: o `PUT /api/projetos/:id` com espera curta, igual ao das legendas
  ("Salvando…" / "Salvo").

**Testar:** montar 3 vídeos, reordenar, dividir, excluir, aparar, desfazer tudo e
refazer; a prévia pula os trechos cortados; recarregar a página e ver tudo salvo.

**Custo novo:** a prévia leve de cada vídeo enviado (já existe hoje para cada vídeo;
só passa a haver mais vídeos por projeto).

---

## BLOCO 3 — Remover pausas

**O que muda**
- Arquivo de configuração `app/servidor/pausas-config.ts`:
  - limiar de silêncio: **-35 dB**;
  - duração mínima de uma pausa para cortar: **0,5 s**;
  - margem antes e depois da fala: **120 ms** (não corta sílaba).
- `POST /api/projetos/:id/pausas`: roda `ffmpeg silencedetect` em cada vídeo da
  timeline que ainda não foi analisado e guarda em `timeline.pausas`. Lê a **prévia
  leve** (bem menor que o original: menos download), na fila das transcrições.
- Na tela, "Remover pausas" aplica as pausas como cortes comuns: cada trecho é dividido
  e os pedaços de silêncio somem. Fica tudo visível na timeline, editável, e um
  Ctrl+Z desfaz tudo de uma vez.
- A conta (pausas → trechos) fica em `app/web/trechos.ts`, com teste.

**Testar:** um vídeo com pausas longas; conferir que nenhuma sílaba é cortada; mudar
um corte à mão; desfazer.

**Custo novo:** um ffmpeg só de áudio por vídeo, uma vez (segundos de CPU no Render).

---

## BLOCO 4 — Gerar legendas

**O que muda**
- `POST /api/projetos/:id/montar`: tarefa solta (como a transcrição hoje: a tela
  acompanha o andamento e pode fechar a página). Fila própria, 1 por vez (variável
  `FILA_MONTAGENS`).
  - Um ffmpeg só: corta os trechos, junta (concat), 30 quadros por segundo constantes,
    H.264, áudio AAC com 15 ms de fade em cada corte (para não estalar, como na
    medição). Já gera junto a prévia leve (540p) do montado, sem decodificar duas vezes.
  - Envia o montado para o S3, grava `projetos.video` = montado e apaga o montado
    anterior.
  - Em seguida, a transcrição de sempre (`/api/transcrever`) roda **só no montado**, e
    a tela de legendas abre com ele.
- **"Pular"** (projeto com 1 vídeo, sem cortes): não monta nada; o vídeo original vira
  o `source`, igual ao fluxo de hoje. Também é automático quando a timeline é 1 vídeo
  inteiro sem cortes (nada a montar).
- **Cortes mudados depois de legendar:** ao voltar para a timeline de um projeto
  legendado, a tela avisa: "Se mudar os cortes, as legendas serão geradas de novo
  (conta 1 transcrição do dia) e as edições de legenda deste projeto serão perdidas."
  As legendas antigas só são trocadas quando a nova transcrição termina.
- Botão "Voltar para os cortes" na tela de legendas.

**Testar:** 3 vídeos com cortes → Gerar legendas → legendas certas no vídeo montado,
sem estalo nos cortes → exportar; "Pular" com 1 vídeo; mudar um corte depois e ver o
aviso; exportação desconta a duração do vídeo montado (não a dos brutos).

**Custo novo:**
- CPU do Render: uma conversão do vídeo montado inteiro (como a prévia leve de hoje).
  Vou medir o tempo com 1 min de vídeo neste bloco para saber se o plano do Render aguenta.
- Transferência: o Render baixa os trechos usados dos brutos (~US$ 0,09/GB).
- S3: o montado (~US$ 0,023/GB por mês, 30 dias no máximo).
- Transcrição: igual a hoje (uma por vídeo final).

---

## BLOCO 5 — Limites e custo

**O que muda**
- No fim de cada envio (`app/servidor/envio.ts`, que já mede a duração com o ffprobe),
  grava uma linha em `envios`. Antes de abrir um envio, confere se ainda cabe no mês
  (mesmo ciclo dos minutos do plano). Apagar um vídeo não devolve o limite.
- Limite = minutos de exportação do plano × `BRUTO_VEZES_DO_PLANO` (padrão **3**):
  Básico 90 min, Pro 180, Editor 360; grátis: decisão 2. O dono (admin) fica sem limite,
  como hoje.
- Barra "Material enviado: 42 de 90 min este mês" no editor de cortes (computador e
  celular), com o uso vindo do `/api/conta`.
- Apagar os brutos: a cada hora o servidor procura projetos sem acesso há
  `DIAS_DOS_BRUTOS` dias (padrão 14), apaga os vídeos brutos (e as prévias deles) e marca
  `brutos_apagados_em`. O montado e as legendas continuam: dá para editar as legendas e
  exportar, mas não recortar.
- Avisos na tela: "Os vídeos originais deste projeto são apagados após 14 dias sem
  abrir." e, depois de apagados, "Os vídeos originais foram apagados; os cortes não
  podem mais ser mudados."
- Variáveis novas no `.env.example` (você põe no Render): `BRUTO_VEZES_DO_PLANO`,
  `DIAS_DOS_BRUTOS`, `FILA_MONTAGENS`.

**Testar:** com um limite pequeno no .env, enviar até passar e ver a mensagem; a barra
mexe; com `DIAS_DOS_BRUTOS=0`, ver os brutos sumirem e o aviso aparecer.

**Custo novo:** nenhum; este bloco **limita** o armazenamento. Pior caso por assinante
Editor: 360 min de bruto ≈ 50 GB por mês ≈ US$ 1,15 de S3 + ~US$ 4,50 de transferência
para montar (decisão 1).

---

## BLOCO 6 — Celular

**O que muda**
- Tela de cortes no layout de celular (abaixo de 820 px), usando a mesma `Timeline.tsx`:
  - arrastar com o dedo (segurar o trecho para mover; arrastar a borda para aparar);
  - pinça para zoom (dois dedos);
  - barra de botões grandes embaixo: Dividir, Excluir, Desfazer, Refazer, Remover pausas;
  - prévia em cima, timeline embaixo, "Gerar legendas" fixo no rodapé.
- Ajustes no `celular/LayoutCelular.tsx` (tela nova "cortes" entre o início e o editor).

**Testar:** no iPhone e num Android: mover, aparar, dividir, pinça, desfazer, gerar
legendas.

**Custo novo:** nenhum.

---

## Regras de cada bloco

- `npx.cmd tsc --noEmit` antes de concluir.
- Um commit por bloco. Este plano não mexe em `src/`, `fontes/` nem `sons/`; se algum
  bloco precisar, rodo `npm.cmd run nuvem:site` antes de publicar.
- Nada é publicado antes de você testar o bloco à mão.
- Chaves nunca no chat; variáveis novas só no `.env.example` (os valores você põe no
  Render).
- No fim de cada bloco: relatório curto (o que mudou, o que testar, custo novo).

## Fora deste plano (para não crescer)

Transições entre trechos, música de fundo, texto livre, várias trilhas, velocidade,
recorte de imagem (zoom/enquadramento) e reaproveitar as edições de legenda depois de
mudar os cortes.

# Etapa 3 — Publicar o web app

Objetivo: o app num endereço público, no celular e no computador, com os vídeos no
S3 (us-east-2, a mesma conta do Remotion Lambda), o render no Lambda, a transcrição
pelo WhisperX e o login pelo Supabase. Este documento é só o plano: nada de código
foi alterado.

Levantado em 05/10/2026, olhando o código atual e a conta da AWS.

## Decisões tomadas (05/10/2026)

| Assunto | Decisão |
|---|---|
| Hospedagem | **Render** |
| Domínio | `ascentstudio.com.br`, já registrado na Hostinger (decidido em 06/10/2026). O app fica em **`legendas.ascentstudio.com.br`** e o e-mail do login sai desse domínio. Até o Bloco 9, o endereço provisório do Render; o endereço do app fica numa única configuração (`ENDERECO_DO_APP`). |
| Envio | Grátis: 300 MB e 2 min. Assinante: 1 GB e 10 min. |
| Transcrições por dia | Grátis: 3. Assinante: **10** (era 30; reduzido em 06/10/2026, por custo). |
| Guarda dos vídeos | Enviados: 30 dias. Exportados: 7 dias. Com aviso na tela. |
| Alertas de orçamento na AWS | US$ 20 e US$ 50 |
| Login | **E-mail e senha** (Supabase Auth), decidido em 06/10/2026, no lugar do link e do código de 6 dígitos. Confirmação do e-mail uma vez, no cadastro; "Esqueci minha senha" por e-mail (também para as contas antigas, criadas pelo link, que ainda não têm senha); "Trocar senha" no menu da conta. O `npm run link-login` continua, só para desenvolvimento. |
| Ícone | Provisório, gerado a partir da marca |
| Testadores | Entram como grátis |
| Medição pedida | No bloco da prévia leve (Bloco 4): tempo e memória para converter um vídeo HEVC de iPhone de 1 min, para saber se o plano mais barato do Render aguenta. |

---

## 1. O que hoje depende do seu computador

| Item | Hoje | O que precisa mudar |
|---|---|---|
| **Vídeos enviados** | Pasta do projeto (modo local) ou `usuarios/<id>/` no disco | Bucket S3 privado `ascent-legendas-videos-275060989338`, chave `videos/<id>/<arquivo>` (o tipo vem primeiro: as regras de expiração do S3 são por prefixo). O servidor só guarda a chave no projeto (coluna `projetos.video`). |
| **Vídeos exportados** (`saidas/`) | Disco, baixados por `/saidas/<nome>` | Saída do Lambda direto no S3 (`exportados/<id>/...`), baixada por endereço assinado com validade curta. |
| **Removidos** (`removidos/`) | Movidos para uma pasta | No S3: apagar o vídeo (ou mover para um prefixo com expiração de 7 dias, se quiser "desfazer"). |
| **`transcricao.json`** | Projeto único do modo local | Continua só no modo local. No servidor público, só Supabase. |
| **Sons** (`sons/`) | Lidos do disco pela prévia e pelo render local | Ficam no repositório e vão junto com o servidor (prévia) e com o site do Lambda (render), como já é feito em `nuvem/implantar.ts`. Os "sons tocados" (corte e fade) continuam gerados pelo servidor com ffmpeg e enviados ao site do Lambda. |
| **Fontes** (`fontes/`) | Embutidas no bundle | Já viajam no bundle do site do Lambda. Nada muda. |
| **Templates e paletas** | Lidos do disco pelo servidor | Ficam no repositório, dentro do servidor; viajam nas props para o Lambda (já é assim). Nada muda. |
| **ffmpeg / ffprobe** | Achados no Windows (pacote Gyan) ou pelo `FFMPEG_PATH` | Instalados na imagem do servidor (Linux). O código já cai para o `ffmpeg` do sistema; nada a mudar além de instalar. Usados para: medir duração, detectar a voz, extrair o áudio para o WhisperX/Groq e gerar os sons tocados. Passam a ler o vídeo pelo endereço assinado do S3, sem baixar o arquivo inteiro. |
| **Whisper local** (`whisper.cpp`, 471 MB) | Reserva de último caso e `TRANSCRICAO=local` | Fica fora do servidor público. Lá a cadeia é WhisperX → Groq → erro claro ("tente de novo"). O modo local continua com ele. |
| **Render local** (`renderVideo`: bundle a cada exportação + Chrome no computador) | Exportar no app = render nesta máquina | Exportar passa a ser `renderMediaOnLambda` com o site já publicado (sem bundle por exportação). O servidor acompanha o progresso e registra a exportação quando o Lambda termina (ver item 4). |
| **Vite em desenvolvimento** | `npm run app` serve a tela pelo Vite | Tela montada uma vez (`npm run app:montar`) e servida como arquivos (`--producao`, que já existe). |
| **Endereço e porta** | `127.0.0.1:5174` (ou `0.0.0.0` com `--rede`) | Ouvir em `0.0.0.0` na porta que o serviço de hospedagem mandar (`PORT`). |
| **`.env`** | Arquivo na pasta do projeto | Variáveis de ambiente configuradas no painel da hospedagem. O `.env` continua só no seu computador. |
| **"Abrir pasta" das saídas** (`/api/abrir-saidas`) | Abre o Explorer do Windows | Some no servidor público (só faz sentido no computador). |
| **"Importar projetos deste computador"** | Copia a pasta local para a conta | Desligada no servidor público (já não é oferecida atrás de proxy). Antes de publicar, você importa os seus projetos uma vez, rodando o app localmente com login. |
| **Uma tarefa longa por vez** (`tarefaAtual`) | Trava única para todos | Vira limite por usuário (1 transcrição e 1 exportação de cada vez) mais uma fila geral (ver item 4). |
| **Pasta temporária** (`os.tmpdir`) | Disco do Windows | Disco temporário do contêiner (some a cada reinício). Ok, desde que tudo seja apagado depois de usado (o código já apaga). |
| **Raiz do projeto** (`process.cwd()`) | Pasta do projeto | A pasta do app dentro da imagem. Sem caminho fixo de Windows no código do servidor. |

---

## 2. Envio do vídeo

**Como fica:** o navegador envia o arquivo direto para o S3. O vídeo não passa pelo servidor, que só autoriza.

1. O navegador lê a duração do vídeo antes de enviar (pelo próprio `<video>`). Se passar do limite do plano, avisa na hora, sem gastar dados.
2. Pede ao servidor um "envio em partes" (multipart do S3). O servidor confere o plano, o tamanho e o tipo e devolve um endereço assinado para cada parte (8 MB cada), válido por 1 hora.
3. O navegador envia as partes, com a barra de progresso somando as partes já enviadas. Uma parte que falha é reenviada sozinha (3 tentativas).
4. **Retomada:** o número do envio e as partes prontas ficam guardados no aparelho. Se a conexão cair, ou se a página for fechada e reaberta, o app pergunta "continuar o envio de X?" e manda só o que falta. O servidor confirma no S3 quais partes já chegaram.
5. No fim, o servidor fecha o envio, mede a duração de verdade com ffprobe (pelo endereço assinado) e, se passar do limite, apaga o arquivo e explica.

Biblioteca sugerida: Uppy com o envio em partes para S3 (`@uppy/aws-s3`). Ela já faz o progresso, o reenvio e a retomada.

**Limites por plano:** os números abaixo são sugestão; a decisão é sua.

| | Tamanho máximo | Duração máxima |
|---|---|---|
| Grátis | 300 MB | 2 min |
| Assinante | 1 GB | 10 min |

**Prévia do editor lendo do S3:**
- O `<video>` da prévia e as capas do Início passam a usar um endereço assinado de leitura (válido por 2 horas, renovado pela tela antes de vencer). O bucket precisa de CORS liberando leitura (com `Range`) só para o domínio do app.
- **Recomendado: uma "prévia leve".** Vídeos de iPhone costumam vir em HEVC, que o Chrome do Windows e de muitos Android não toca. Logo depois do envio, o servidor (ou um Lambda) gera uma cópia em H.264 540p para a prévia. É mais leve para o celular e toca em qualquer navegador. O render final continua usando o original.

---

## 3. Onde o servidor Node vai rodar

O que o servidor precisa: Node 22, ffmpeg, cerca de 1–2 GB de memória (ffmpeg e detecção de voz), HTTPS e publicação a partir do código. O render pesado fica no Lambda, então o servidor é modesto.

Atenção: **o AWS App Runner, que seria o caminho "simples" da AWS, parou de aceitar clientes novos em 30/04/2026**. A própria AWS indica o ECS Express Mode no lugar.

| | **Render.com** (publica do GitHub) | **AWS Lightsail Containers** (us-east-2) | **AWS ECS Express Mode** (us-east-2) |
|---|---|---|---|
| Custo mensal estimado | US$ 7 (0,5 CPU, 512 MB, para começar) a **US$ 25** (1 CPU, 2 GB, recomendado) | US$ 10 (micro, 1 GB) a US$ 25 (small) | ~US$ 35: Fargate 0,5 CPU / 1 GB (~US$ 18) + balanceador (~US$ 17) |
| Usa seus créditos da AWS | Não (cartão) | Sim | Sim |
| Publicar uma versão nova | Automático a cada envio ao GitHub | Precisa gerar a imagem e enviar (Docker no computador, ou uma automação no GitHub que eu escrevo) | Precisa gerar a imagem e enviar ao ECR (automação no GitHub) |
| HTTPS e domínio | Automáticos | Automáticos | Automáticos (ele cria balanceador, certificado e DNS) |
| Dificuldade para você | **Baixa** | Média | Média para alta |
| O que você clicaria | Criar conta → New Web Service → escolher o repositório → plano → colar as variáveis de ambiente → domínio | Lightsail → Containers → Create → tamanho → configurar a implantação → variáveis → domínio | ECS → Express Mode → imagem do ECR → 2 funções IAM → variáveis → domínio no Route 53 |

**Recomendação: Render.com**, no plano Standard (US$ 25/mês). Dá para começar no Starter (US$ 7) e subir se a memória apertar. É de longe o mais simples de operar: cada correção que eu fizer chega ao ar sozinha quando vai para o GitHub, e você nunca precisa mexer em Docker.

A diferença de custo para a AWS é pequena. Se os créditos da AWS forem o fator decisivo, a segunda opção é o Lightsail (US$ 10–25, coberto pelos créditos), com uma automação no GitHub que eu escrevo.

O resto (S3, Lambda) fica na AWS de qualquer jeito; o servidor no Render fala com eles pela internet, sem problema.

---

## 4. Segurança e custo

**Quem pode disparar o quê**
- Transcrição e render só com login (token validado em toda rota, como já é).
- **Render:** já decidido no servidor pelo plano (Etapa 2b).
- **Transcrição:** hoje não tem limite, e cada WhisperX custa US$ 0,01–0,02. Decidido: grátis, 3 transcrições por dia; assinante, 10 por dia (era 30 até 06/10/2026). "Recomeçar do zero" conta como transcrição.
- O envio respeita o tamanho e a duração do plano (item 2). O servidor só aceita chaves do S3 dentro de `usuarios/<id do próprio usuário>/`.

**Limite de pedidos por usuário**
- Uma transcrição e uma exportação de cada vez, por usuário. É o lugar da trava global de hoje.
- Fila geral no servidor: no máximo 20 renders e 10 transcrições ao mesmo tempo. Acima disso, "na fila, posição N".
- Limite de pedidos às rotas: ~60 por minuto por usuário, e ~10 por minuto nas rotas que disparam custo (transcrever, exportar, pedir envio).

**Apagar vídeos antigos do S3** (regras automáticas do bucket; os números são decisão sua)
- Vídeos enviados: 30 dias depois do envio. O projeto continua no Supabase; ao abrir, a tela diz "o vídeo expirou, envie de novo".
- Prévias leves: 30 dias.
- Vídeos exportados: 7 dias. É tempo de baixar; depois, reexportar não desconta, até 5 vezes.
- Envios abandonados no meio: 2 dias.

**Alertas de orçamento**
- **AWS Budgets** em us-east-2: orçamento mensal (sugestão: US$ 50), com e-mail em 50%, 80% e 100%. Mais o "Cost Anomaly Detection", que avisa de gasto fora do padrão.
- **Replicate:** manter crédito pré-pago moderado e ativar o alerta de gasto da conta, se o painel oferecer.
- **Supabase e Render:** os planos têm valor fixo; acompanhar o uso.

**Se algo falhar no meio**
- **WhisperX falha ou passa de 60 s:** a Groq assume (já é assim). Se a Groq também falhar, aparece "não deu para transcrever, tente de novo". Transcrição não desconta minutos.
- **Lambda falha:** o Remotion já tenta de novo os pedaços que falham. Se o render falhar de vez, não desconta (já é assim), o arquivo parcial é apagado e a tela oferece "tentar de novo".
- **Servidor reinicia ou o celular perde a conexão durante o render:** hoje o progresso depende da conexão aberta. No servidor público, cada render vira um registro no Supabase (tabela `renders`: id do Lambda, usuário, projeto, situação). Um vigia no servidor acompanha os renders "em andamento", inclusive depois de reiniciar, e só registra a exportação, descontando, quando o Lambda termina com sucesso. A tela reabre e mostra "pronto" ou "falhou". Isso pede uma migração 005 (a 004 é a das transcrições, Bloco 5).

---

## 5. Limite real do Lambda

Conferido agora no Service Quotas, us-east-2: **1000 execuções simultâneas**. É o valor ajustável; havia um pedido de aumento para 1000, já encerrado em 04/10/2026.

Cada render usa 1 Lambda principal mais 1 por pedaço de 60 quadros:

| Vídeo (30 fps) | Lambdas por render | Renders ao mesmo tempo |
|---|---|---|
| 57,5 s (Maiara) | 29 + 1 = 30 | **33** |
| 1 min | 30 + 1 = 31 | 32 |
| 3 min | 90 + 1 = 91 | 10 |
| 10 min (limite sugerido do assinante) | 300 + 1 = 301 | 3 |

Para vídeos longos, o servidor pode usar pedaços maiores (por exemplo, 200 quadros): menos Lambdas por render, cada um um pouco mais demorado. A fila geral do item 4 impede que se passe do limite. Se faltar, a AWS aumenta a cota a pedido.

---

## 6. "Adicionar à Tela de Início" (PWA)

Hoje o app só tem a tag `viewport`. Falta:

1. **Manifesto** (`manifest.webmanifest`): nome "Ascent Legendas", nome curto, `display: standalone` (tela cheia, sem barra do navegador), `start_url`, cores de fundo e tema, ícones de 192 e 512 px e um ícone "maskable" (Android recorta em círculo ou quadrado).
2. **Ícone do iPhone** (`apple-touch-icon`, 180 px) e as tags da Apple (`apple-mobile-web-app-capable`, cor da barra de status e título).
3. **`theme-color`**, para a barra do sistema ficar na cor do app.
4. **HTTPS**, que vem com o domínio e a hospedagem.
5. **Um service worker mínimo**, que guarda só a "casca" da tela para abrir rápido. Ele nunca guarda vídeos nem respostas da API.
6. **O desenho do ícone**: eu gero a partir do quadrado roxo da marca, a menos que você tenha um ícone.

**Login no iPhone.** Um app instalado na Tela de Início do iPhone guarda a sessão separada do Safari. Com o login por e-mail e senha (06/10/2026), a pessoa entra direto no app instalado, e o iPhone oferece salvar e preencher a senha. Só os links do e-mail (confirmar o cadastro e redefinir a senha) abrem no Safari: depois deles, basta entrar com a senha no app instalado.

---

## 7. Tarefas em ordem (blocos pequenos, testáveis um a um)

Legenda: **[VOCÊ]** contas, consoles, domínio e decisões; **[EU]** código, scripts e testes.

**Bloco 0 — Preparação**
1. [VOCÊ] Decidir as pendências da seção 9.
2. [VOCÊ] Criar um repositório **privado** no GitHub. Eu envio o código; o `.env` nunca vai.
3. ~~[VOCÊ] Comprar o domínio~~ ✅ já existe: `ascentstudio.com.br` (Hostinger). O app vai no subdomínio `legendas.ascentstudio.com.br`.
4. [VOCÊ] Criar o orçamento na AWS (Budgets) e ativar o Cost Anomaly Detection.

**Bloco 1 — Servidor pronto para nuvem** ✅ concluído em 05/10/2026 (a imagem Docker só é construída de verdade no Render, no Bloco 9).
1. [EU] Modo "servidor público": tela montada, `PORT` e `0.0.0.0`, sem "abrir pasta", sem importação local, sem Whisper local.
2. [EU] Dockerfile (Node 22 + ffmpeg) e uma rota de saúde (`/saude`).
3. [EU] Teste: rodar a imagem localmente e entrar pelo navegador.

**Bloco 2 — Bucket S3** ✅ concluído em 05/10/2026: bucket `ascent-legendas-videos-275060989338` criado por `nuvem/criar-bucket.ts` (rode de novo ao trocar o endereço do app). A permissão virou a política **gerenciada** `ascent-legendas-bucket-videos`, anexada ao `remotion-user`, porque as políticas em linha do usuário já estavam no limite de 2048 caracteres.
1. [EU] Script que cria o bucket privado em us-east-2, com CORS e as regras de expiração. [VOCÊ] Aprovar no console a política de permissão do usuário IAM: ler e escrever só nesse bucket, mais o Lambda que já existe.
2. [EU] Teste: enviar e ler um arquivo por endereço assinado.

**Bloco 3 — Envio direto do celular** ✅ concluído em 06/10/2026 (commit `fe0ff6c`; partes de 5 MB, 3 ao mesmo tempo, retomada guardada no aparelho; cópia provisória no disco até o Bloco 6). Testado no iPhone pelo túnel com um vídeo 4K de 9 s (IMG_2750), com os registros de diagnóstico (`3e11654`) e a correção da rotação (`1b50d5d`).
1. [EU] Rotas do envio em partes, Uppy na tela, limites do plano e ffprobe no fim.
2. [EU] Teste: enviar pelo túnel no 4G, derrubar a conexão no meio e retomar.
3. [VOCÊ] Teste no seu celular: enviar um vídeo de verdade.

**Bloco 4 — Prévia e capas pelo S3** ✅ concluído em 06/10/2026 (commit `d06536e`), testado no iPhone.
1. [EU] Endereços assinados para a prévia e as capas; prévia leve em H.264.
2. [EU] Teste: um vídeo HEVC de iPhone tocando no Chrome do Windows.

Decisões (06/10/2026): conversão no próprio servidor (Lambda só se a medição pedir);
enquanto a prévia leve não fica pronta, a capa com "Preparando a prévia…", sem tocar
o original; capas em JPG geradas na conversão; vídeos que só existem no disco
continuam lidos do disco até o Bloco 6.

**Achado: o iPhone converte para H.264 ao enviar pelo navegador.** Vídeos gravados em
"Alta eficiência" (HEVC) chegaram ao S3 em H.264 1080x1920, 30 fps, já em pé (sem
marca de rotação): o Safari converte o vídeo ao escolhê-lo no seletor de arquivos. Na
prática, o HEVC não chega pelo iPhone; a prévia leve continua valendo para HEVC vindo
de outros aparelhos ou do computador, e para aliviar o celular (540p).

**Medição da conversão** (ffmpeg com 2 threads, neste computador, Ryzen 5 3500X):
| Vídeo | Tempo | Pico de memória do ffmpeg | Prévia |
|---|---|---|---|
| iPhone, H.264 1080p, 27 s | 3,8 s | 142 MB | 3,2 MB |
| iPhone, H.264 1080p, 44 s | 7,8 s | 119 MB | 5,6 MB |
| IMG_2750, H.264 4K girado, 10 s | 4,8 s | 242 MB | 0,4 MB |

O servidor parado usa ~140 MB. No Starter do Render (512 MB, 0,5 CPU): 1080p cabe
(~260 MB no pico); 4K cabe com pouca folga (~390 MB). O tempo deve ficar perto de
1 min de conversão por minuto de vídeo 1080p (estimado: um quarto do processador
usado aqui). A capa sai em menos de 1 s, então a tela tem o que mostrar logo.

**Bloco 5 — Transcrição lendo do S3** ✅ concluído em 06/10/2026 (commit `d8344db`; limite do assinante ajustado para 10 em `8ca9922`). Ressalva: retomada da transcrição ao sair do app: falta teste no iPhone.
1. [EU] O ffmpeg lê o vídeo pelo endereço assinado e extrai o áudio; só o áudio vai para o WhisperX ou a Groq, como hoje. A detecção de voz usa o mesmo áudio.
2. [EU] Limite diário de transcrições por plano.
3. [EU] Teste: transcrever um vídeo enviado pelo celular.

Decisões (06/10/2026): transcrição solta da página, com retomada ao voltar (como a
exportação), e pedir de novo com uma em curso não começa outra; só contam no limite
as que terminaram; o dia é o do calendário de Brasília (renova à 00:00); o saldo
aparece no quadro do plano ("Restam N de 3 transcrições hoje"); a detecção de voz da
Sincronia precisa não conta; vídeos só no disco continuam transcritos do disco.
Migração 004: tabela `transcricoes` (a dos renders do Bloco 6 passa a ser a 005).

**Medição** (vídeo do iPhone, H.264 1080p, 27 s; WhisperX):
| | Tempo total | Extração do áudio | Processamento no Replicate | Custo |
|---|---|---|---|---|
| Antes (disco, 3 extrações) | 9,9 s | — | 5,7 s | US$ 0,0079 |
| Depois, do disco | 8,7 s | 0,1 s | 5,6 s | US$ 0,0079 |
| Depois, do S3 (3 vezes) | 11,8 a 17,0 s | 3,0 s | 6,1 a 11,1 s | US$ 0,0086 a 0,0156 |

O áudio extraído do S3 é idêntico ao do disco (mesmo md5): o custo depende só do
tempo de processamento no Replicate, que variou entre 6 e 11 s com o mesmo arquivo.
Os 3 s a mais da extração são o download do vídeo daqui (Brasil) até us-east-2; no
Render, perto da AWS, devem cair para menos de 1 s.

**Bloco 6 — Exportar no Lambda** ✅ concluído em 06/10/2026 (commit `43266a9`), testado no iPhone.

Decisões (06/10/2026): sai a cópia dos vídeos no disco (lista, duração, voz e "remover vídeo" pelo S3; os antigos, só no disco, exportam com o render local); função de 2048 MB, 60 quadros por Lambda até 90 s e 200 acima; saída limitada a 1080 x 1920 (deitado, 1920 x 1080), mantendo a proporção; vídeo pronto direto em `exportados/<conta>/`. O site do Lambda tem o nome da versão do código (`legendas-<hash>`) e é publicado por script (`npm run nuvem:site`): montar o site levou 10,6 s com pico de 776 MB de memória, acima dos 512 MB do Render; sem o site da versão, a exportação avisa. **Rodar `npm run nuvem:site` depois de mudar `src/`, `fontes/` ou `sons/`, antes de publicar o app.**

Teste no Lambda (06/10/2026, vídeo do iPhone de 27 s): 80 s do pedido ao vídeo pronto, US$ 0,016 no Lambda, saída 1080 x 1920 com áudio; dois pedidos juntos e um terceiro com o render em curso caíram no mesmo render; a exportação só foi registrada (desconto) quando o render terminou; na falha (permissão faltando), nada foi descontado e o arquivo parcial não ficou.
1. [EU] Migração 005 (tabela `renders`); [VOCÊ] colar no SQL Editor.
2. [EU] Exportar = Lambda, com o site já publicado; vigia de renders; desconto só no sucesso; download por endereço assinado; arquivo parcial apagado na falha.
3. [EU] Teste: exportar, fechar a aba no meio, reabrir e encontrar "pronto"; falha simulada sem desconto.

**Bloco 7 — Limites e fila** — código em 06/10/2026; falta o teste no seu celular.

Como ficou: uma transcrição e uma exportação por conta de cada vez (a segunda é recusada com aviso; o mesmo vídeo de novo acompanha a que está em curso); fila geral de 20 renders no Lambda e 10 transcrições ao mesmo tempo, com "Na fila, posição N" e saída sozinha da fila; 60 pedidos por minuto por conta e 10 nas rotas que custam (transcrever, exportar, abrir envio), com as consultas de andamento fora da conta. A fila de renders fica na tabela `renders` (migração 006) e se recupera depois de um reinício; a de transcrições fica na memória. Atenção: 10 transcrições ao mesmo tempo podem passar dos 512 MB do Starter do Render (cada uma extrai o áudio com o ffmpeg); as vagas mudam em `app/servidor/limites.ts`.
1. [EU] Uma tarefa por usuário, fila geral e limite de pedidos.
2. [EU] Teste: dez exportações ao mesmo tempo com contas de teste.

**Bloco 8 — PWA**
1. [EU] Manifesto, ícones, tags da Apple e service worker mínimo.
2. [VOCÊ] Adicionar à Tela de Início no seu iPhone ou Android e entrar com o e-mail e a senha.

**Bloco 9 — Publicar**
0. [VOCÊ/EU] **Obrigatório antes de cada publicação que mude `src/`, `fontes/` ou `sons/`: rodar `npm run nuvem:site`** (publica o site do Lambda da versão do código; sem ele, a exportação recusa com aviso).
1. [VOCÊ] Criar a conta no Render, conectar o repositório e colar as variáveis de ambiente (eu entrego a lista).
2. [VOCÊ] No painel de DNS da Hostinger, criar o registro de `legendas.ascentstudio.com.br` apontando para o Render (eu digo qual).
3. [VOCÊ] No Supabase, colocar `https://legendas.ascentstudio.com.br` em Site URL e Redirect URLs.
4. [EU] Teste completo no endereço público: login, envio, transcrição, edição, exportação e download, no celular e no computador.

**Bloco 10 — Antes dos testadores** (seção 8)

---

## 8. Pronto antes de abrir para testadores

- **E-mail próprio para o login:** o e-mail grátis do Supabase tem limite baixo e só envia para a equipe do projeto. Criar conta no Resend (plano grátis: 3.000 e-mails por mês, 100 por dia), verificar o domínio `ascentstudio.com.br` (registros DNS na Hostinger; o login sai, por exemplo, de `login@ascentstudio.com.br`) e colar o SMTP no Supabase (Authentication → Emails → SMTP Settings). Ajustar em português os modelos de e-mail de confirmação do cadastro e de redefinição de senha.
- **Crédito no Replicate:** abaixo de US$ 5, a conta fica limitada a 6 pedidos por minuto, um por vez. Sugestão: **US$ 20–25** (dá ~1.000–2.000 transcrições de 1 minuto).
- **Domínio** com HTTPS (`legendas.ascentstudio.com.br`): necessário para o PWA, o e-mail próprio e um endereço fixo para o login.
- **Orçamento e alertas** na AWS ativos (item 4).
- **Seus projetos importados** para a sua conta (rodando localmente, antes de publicar).
- **Plano dos testadores:** decidir se entram como grátis ou se você troca para assinante com `npm run plano`.
- **Páginas mínimas:** termos de uso e política de privacidade (vídeos de clientes, e-mail). Recomendável antes de abrir para fora do seu círculo.

**Custo mensal estimado no começo** (dezenas de usuários):
- Render: US$ 7–25.
- S3: cerca de US$ 1–10 (armazenamento pequeno com as expirações; o que mais pesa é a transferência dos vídeos baixados, US$ 0,09/GB).
- Por minuto exportado: Lambda ~US$ 0,03 + WhisperX ~US$ 0,01–0,02.
- Domínio: já pago (`ascentstudio.com.br`, Hostinger).
- Resend e Supabase: grátis nos planos iniciais.

---

## 9. Decisões que dependiam de você

Todas tomadas em 05/10/2026 (veja "Decisões tomadas", no começo). O domínio saiu desta lista: decidido em 06/10/2026.

1. **Hospedagem:** Render (recomendado, US$ 7–25/mês, fora dos créditos) ou Lightsail (US$ 10–25/mês, dentro dos créditos).
2. **Limites de envio por plano:** tamanho e duração (sugestão na seção 2).
3. **Limite de transcrições por dia:** 3 no grátis e 10 no assinante (06/10/2026; antes, 30).
4. **Por quantos dias guardar** os vídeos enviados (30) e os exportados (7).
5. **Valor do alerta de orçamento** na AWS (sugestão de US$ 50/mês) e crédito inicial no Replicate (US$ 20–25).
6. **Login:** e-mail e senha (06/10/2026; antes, código de 6 dígitos no e-mail).
7. **Ícone do app:** usar o seu ou eu gero a partir da marca.
8. **Testadores** entram como grátis ou assinante.

## Pendências

- **Retomada da transcrição ao sair do app** (Bloco 5): falta teste no iPhone.
- **Pacote C: refazer no estilo imobiliário (dois grupos, âncora + trilho, variações e templates lineares).** As duas versões de 06/10/2026 foram desfeitas (dois grupos com motion blur, `31f6b06`; âncora e trilho, `a349932`): o C voltou ao desenho de antes (c1 a c6 e linear, Anton e Kaushan Script). A prancha de referência está em `pacote-c-referencia.html`, na raiz.

---

Fontes de preços e situação dos serviços (consultadas em 05/10/2026):
[AWS App Runner deixa de aceitar clientes novos](https://dev.to/parag477/aws-app-runner-is-dead-heres-what-you-should-use-instead-2026-1hp7) ·
[ECS Express Mode](https://infoq.com/news/2025/12/aws-ecs-express-mode/) ·
[Preços do Render](https://www.srvrlss.io/provider/render/) ·
[Preços do Lightsail](https://www.cloudzero.com/blog/amazon-lightsail-pricing/) ·
[Limites do Replicate](https://replicate.com/docs/topics/predictions/rate-limits)

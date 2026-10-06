# Imagem do servidor público (Render). Node 24 (a mesma versão do computador) e o
# ffmpeg completo do Debian: duração, detecção de voz, áudio para o WhisperX/Groq
# e sons tocados. O render vai para o Lambda; a transcrição, para o WhisperX.
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependências primeiro (camada reaproveitada quando só o código muda). As de
# desenvolvimento entram também: tsx roda o servidor e vite monta a tela.
COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
# Tela montada uma vez (app/web/dist), servida como arquivos.
RUN npm run app:montar

# Variáveis secretas (Supabase, Replicate, Groq, AWS, ENDERECO_DO_APP) vêm do painel
# do Render, nunca da imagem. PORT também é definido pelo Render.
ENV NODE_ENV=production \
    SERVIDOR_PUBLICO=1 \
    PORT=10000
EXPOSE 10000

# Saúde: GET /saude (configurar no Render como Health Check Path).
CMD ["npx", "tsx", "app/servidor/index.ts", "--producao"]

import {spawn} from "node:child_process";
import {createWriteStream, existsSync} from "node:fs";
import {mkdir, rename, rm} from "node:fs/promises";
import type {Server} from "node:http";
import os from "node:os";
import path from "node:path";
import {pipeline} from "node:stream/promises";
import express from "express";
import type {Response} from "express";
import {groupWords} from "../../src/captions";
import {assignForStyle, novaSemente, wordsOfBlocks} from "../../src/motor/blocos";
import {renderVideo} from "../../src/motor/exportar";
import {caminhoDoSom, listarSons, somTocadoEmCache} from "../../src/motor/pasta-sons";
import {getVideoMetadata} from "../../src/motor/ferramentas";
import {
  loadCatalog,
  loadStyle,
  outputPathFor,
  readProject,
  saveProject,
  SINCRONIA_DE_PROJETO_NOVO,
  transcriptionPath,
} from "../../src/motor/projeto";
import type {Projeto} from "../../src/motor/projeto";
import {carregarEnv} from "../../src/motor/env";
import {transcrever} from "../../src/motor/transcricao";
import {detectarVozDoVideo} from "../../src/motor/voz";
import {reloadModules} from "../../src/template-loader";
import {configDosEfeitos, planejarEfeitos} from "../../src/sons";
import {cortesDosExcluidos, precisaoDoProjeto, sincroniaDoProjeto} from "../../src/entrada";
import type {AssignedCaptionBlock} from "../../src/types";

export type OpcoesServidor = {
  porta: number;
  // Pasta com templates/, paletas/, os vídeos e o transcricao.json.
  pastaProjeto: string;
  // "dev": a tela é servida pelo Vite; "producao": pelos arquivos já montados.
  modo: "dev" | "producao";
  // Aceita aparelhos da mesma rede (npm run app:rede). Sem isso, só a própria máquina.
  rede?: boolean;
};

// Envia uma tarefa longa como linhas JSON: progresso, depois fim ou erro.
const streamTask = async (
  response: Response,
  task: (progress: (etapa: string, fracao?: number) => void) => Promise<unknown>,
): Promise<void> => {
  response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache");
  const send = (data: unknown) => response.write(`${JSON.stringify(data)}\n`);
  try {
    const result = await task((etapa, fracao) => send({tipo: "progresso", etapa, fracao}));
    send({tipo: "fim", resultado: result});
  } catch (error) {
    send({tipo: "erro", mensagem: error instanceof Error ? error.message : String(error)});
  } finally {
    response.end();
  }
};

// Vídeos tirados da lista por "Remover vídeo" (o arquivo não é apagado).
const PASTA_DE_REMOVIDOS = "removidos";

// Caminho em pasta para nome, sem sobrescrever: "video (2).mp4" se já existir.
const destinoLivre = (pasta: string, nome: string): string => {
  const {name, ext} = path.parse(nome);
  let destino = path.join(pasta, nome);
  for (let n = 2; existsSync(destino); n++) {
    destino = path.join(pasta, `${name} (${n})${ext}`);
  }
  return destino;
};

export const iniciarServidor = async ({porta, pastaProjeto, modo, rede = false}: OpcoesServidor): Promise<Server> => {
  const root = path.resolve(pastaProjeto);
  // Chaves do Replicate e da Groq (transcrição) do .env da pasta do projeto.
  carregarEnv(root);
  const app = express();
  app.use(express.json({limit: "20mb"}));

  // Só uma tarefa longa (transcrever ou exportar) por vez.
  let tarefaAtual: string | undefined;
  const reservar = (nome: string, response: Response): boolean => {
    if (tarefaAtual) {
      response.status(409).json({mensagem: `Aguarde: ${tarefaAtual} em andamento.`});
      return false;
    }
    tarefaAtual = nome;
    return true;
  };

  const videoPath = (nome: string): string => {
    if (!loadCatalog(root).videos.includes(nome)) {
      throw new Error(`Vídeo não encontrado na pasta do projeto: ${nome}`);
    }
    return path.join(root, nome);
  };

  const handle =
    (fn: (request: express.Request, response: Response) => Promise<unknown> | unknown) =>
    async (request: express.Request, response: Response) => {
      try {
        const result = await fn(request, response);
        if (!response.headersSent) {
          response.json(result ?? {});
        }
      } catch (error) {
        response.status(400).json({mensagem: error instanceof Error ? error.message : String(error)});
      }
    };

  app.get("/api/catalogo", handle(() => loadCatalog(root)));

  // Relê templates/ e paletas/ sem reiniciar o servidor.
  app.post(
    "/api/recarregar",
    handle(async () => {
      await reloadModules();
      return loadCatalog(root);
    }),
  );

  // Efeitos sonoros da pasta sons/ (lista vazia se não houver nenhum).
  app.get("/api/sons", handle(() => listarSons(root)));

  // Um som da pasta sons/, para a prévia e o botão de ouvir. Os sons tocados
  // (tocados/..., veja somTocado em src/sons.ts) são gerados na primeira vez.
  const pastaDosSonsTocados = path.join(os.tmpdir(), "legendas-dinamicas-sons");
  app.get("/sons/*", async (request, response) => {
    const relativo = String((request.params as Record<string, string>)[0] ?? "");
    const arquivo = caminhoDoSom(root, relativo) ?? (await somTocadoEmCache(root, relativo, pastaDosSonsTocados).catch(() => undefined));
    if (!arquivo) {
      response.status(404).send("Som não encontrado em sons/.");
      return;
    }
    response.sendFile(arquivo);
  });

  app.get("/api/projeto", handle(() => ({projeto: readProject(root) ?? null})));

  app.put(
    "/api/projeto",
    handle((request) => {
      const projeto = request.body as Projeto;
      // A lista de palavras acompanha sempre as palavras dos blocos editados.
      saveProject(root, {...projeto, words: wordsOfBlocks(projeto.blocks)});
      return {ok: true};
    }),
  );

  app.get(
    "/api/estilo",
    handle(async (request) => {
      const {pacote, paleta} = request.query as {pacote?: string; paleta?: string};
      return loadStyle(root, {pacote, paleta}, readProject(root));
    }),
  );

  // Trechos de voz do áudio, para a Sincronia precisa de um projeto transcrito
  // antes de existir a detecção (a transcrição nova já salva a voz).
  app.get(
    "/api/voz",
    handle((request) => detectarVozDoVideo(videoPath(String(request.query.nome ?? "")))),
  );

  app.get(
    "/api/video-info",
    handle((request) => getVideoMetadata(videoPath(String(request.query.nome ?? "")))),
  );

  app.get("/media/:nome", (request, response) => {
    try {
      response.sendFile(videoPath(request.params.nome));
    } catch (error) {
      response.status(404).send(error instanceof Error ? error.message : String(error));
    }
  });

  // Importar vídeo: o corpo da requisição é o arquivo; ele é gravado num arquivo
  // temporário e só ganha o nome final quando a cópia termina.
  app.put("/api/importar", async (request, response) => {
    const nome = path.basename(String(request.query.nome ?? ""));
    const substituir = request.query.substituir === "1";
    if (!/\.(mp4|mov|mkv|webm)$/iu.test(nome) || nome.toLowerCase() === "saida.mp4") {
      response.status(400).json({mensagem: "Escolha um vídeo .mp4, .mov, .mkv ou .webm."});
      return;
    }
    const destino = path.join(root, nome);
    if (existsSync(destino) && !substituir) {
      response.status(409).json({mensagem: `Já existe um vídeo chamado ${nome}.`});
      return;
    }
    const temporario = `${destino}.importando`;
    try {
      await pipeline(request, createWriteStream(temporario));
      await rename(temporario, destino);
      response.json({nome});
    } catch (error) {
      await rm(temporario, {force: true});
      response.status(500).json({mensagem: error instanceof Error ? error.message : String(error)});
    }
  });

  // Vídeos exportados: download pelo navegador.
  app.get("/saidas/:nome", (request, response) => {
    const arquivo = path.join(root, "saidas", path.basename(request.params.nome));
    if (!existsSync(arquivo)) {
      response.status(404).send("Arquivo não encontrado em saidas/.");
      return;
    }
    response.download(arquivo);
  });

  // Abre a pasta saidas/ no explorador de arquivos do sistema.
  app.post(
    "/api/abrir-saidas",
    handle(async () => {
      const pasta = path.join(root, "saidas");
      await mkdir(pasta, {recursive: true});
      const comando =
        process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
      spawn(comando, [pasta], {detached: true, stdio: "ignore"}).unref();
      return {ok: true};
    }),
  );

  app.post("/api/transcrever", async (request, response) => {
    if (!reservar("transcrição", response)) {
      return;
    }
    // manterAjustes ("Recomeçar do zero"): as edições somem, mas os ajustes do vídeo
    // (efeitos sonoros e sincronia) continuam. A transcrição antiga só é trocada
    // quando a nova fica pronta: se o whisper falhar, ela continua como estava.
    const {video, pacote, paleta, manterAjustes} = request.body as {
      video: string;
      pacote?: string;
      paleta?: string;
      manterAjustes?: boolean;
    };
    try {
      await streamTask(response, async (progress) => {
        const anterior = readProject(root);
        const ajustes = manterAjustes && anterior?.source === video ? anterior : undefined;
        // WhisperX, com a Groq e o Whisper local de reserva; a voz do áudio
        // (Sincronia precisa) é detectada junto (veja src/motor/transcricao.ts).
        const {words, voz, model, avisos} = await transcrever(root, videoPath(video), {
          onProgress: progress,
          log: (texto) => console.log(`[${video}] ${texto}`),
        });
        progress("Escolhendo os layouts...");
        const style = await loadStyle(root, {pacote, paleta});
        const semente = novaSemente();
        const blocks = assignForStyle(groupWords(words), style, {semente});
        const projeto: Projeto = {
          source: video,
          language: "pt",
          model,
          pacote: style.pacote,
          paleta: style.paleta,
          semente,
          efeitos: ajustes?.efeitos,
          // Recomeçar do zero mantém a sincronia do projeto; um projeto novo nasce
          // com a Sincronia precisa ligada e 0 ms.
          ...(ajustes
            ? {sincroniaMs: ajustes.sincroniaMs, sincroniaPrecisa: ajustes.sincroniaPrecisa}
            : SINCRONIA_DE_PROJETO_NOVO),
          voz,
          words,
          blocks,
        };
        saveProject(root, projeto);
        // A tela mostra qual reserva foi usada, se não foi o WhisperX.
        return {projeto, avisos};
      });
    } finally {
      tarefaAtual = undefined;
    }
  });

  // Remover vídeo: o arquivo sai da lista indo para removidos/ (não é apagado) e a
  // transcrição dele é apagada. saidas/ não é tocada.
  app.post("/api/remover-video", async (request, response) => {
    if (!reservar("remoção de vídeo", response)) {
      return;
    }
    try {
      const nome = String((request.body as {nome?: string}).nome ?? "");
      const origem = videoPath(nome);
      const pasta = path.join(root, PASTA_DE_REMOVIDOS);
      await mkdir(pasta, {recursive: true});
      const destino = destinoLivre(pasta, nome);
      // No Windows o arquivo pode ficar preso por instantes (a prévia acabou de soltar).
      for (let tentativa = 1; ; tentativa++) {
        try {
          await rename(origem, destino);
          break;
        } catch (error) {
          const codigo = (error as NodeJS.ErrnoException).code;
          if (tentativa >= 10 || (codigo !== "EBUSY" && codigo !== "EPERM")) {
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
      const projeto = readProject(root);
      const apagouTranscricao = projeto?.source === nome;
      if (apagouTranscricao) {
        await rm(transcriptionPath(root), {force: true});
      }
      response.json({movidoPara: path.relative(root, destino), apagouTranscricao});
    } catch (error) {
      response.status(400).json({mensagem: error instanceof Error ? error.message : String(error)});
    } finally {
      tarefaAtual = undefined;
    }
  });

  app.post("/api/exportar", async (request, response) => {
    if (!reservar("exportação", response)) {
      return;
    }
    try {
      await streamTask(response, async (progress) => {
        const projeto = readProject(root);
        if (!projeto) {
          throw new Error("Não há transcricao.json para exportar.");
        }
        const inputPath = videoPath(projeto.source);
        const style = await loadStyle(root, {pacote: projeto.pacote, paleta: projeto.paleta}, projeto);
        const outputPath = outputPathFor(root, projeto.source, style.pacote, style.paleta);
        const missing = projeto.blocks.findIndex((block) => !style.templates[block.template]);
        if (missing >= 0) {
          throw new Error(
            `O bloco ${missing + 1} usa o layout '${projeto.blocks[missing].template}', que não existe no pacote ${style.pacote}.`,
          );
        }
        const video = await getVideoMetadata(inputPath);
        // Os blocos vão como foram editados na interface.
        const blocks = projeto.blocks as AssignedCaptionBlock[];
        const efeitos = configDosEfeitos(projeto.efeitos);
        const sincroniaMs = sincroniaDoProjeto(projeto.sincroniaMs, projeto.sincroniaPrecisa);
        const precisa = precisaoDoProjeto(projeto, video.fps);
        const cortesMs = cortesDosExcluidos(projeto.excluidos, style.templates, sincroniaMs, precisa);
        const sons = await listarSons(root);
        // No log do servidor: o que entra no render (pasta vazia = nenhum efeito).
        const plano = planejarEfeitos(blocks, style.templates, sons, efeitos, projeto.semente ?? 0, sincroniaMs, cortesMs, precisa);
        console.log(
          `Exportar: ${sons.length} sons em sons/, ${plano.length} efeitos (destaque ${efeitos.destaque}, linear ${efeitos.linear}, volume ${efeitos.volume}%), sincronia ${sincroniaMs} ms${precisa ? " (precisa)" : ""}.`,
        );
        await renderVideo(
          {
            root,
            inputPath,
            outputPath,
            blocks,
            templates: style.templates,
            palette: style.palette,
            palettes: style.paletas,
            video,
            efeitos: plano,
            volumeEfeitos: efeitos.volume,
            sincroniaMs,
            precisa,
            posicao: projeto.posicao,
            cortesMs,
          },
          progress,
        );
        return {caminho: outputPath};
      });
    } finally {
      tarefaAtual = undefined;
    }
  });

  // A tela: Vite em desenvolvimento, arquivos montados em produção (Electron).
  const webRoot = path.join(root, "app", "web");
  if (modo === "dev") {
    const {createServer} = await import("vite");
    const vite = await createServer({
      configFile: path.join(webRoot, "vite.config.ts"),
      // Na rede, sem recarregar sozinho: o canal do Vite só atende a própria máquina.
      // Aceita também túneis da Cloudflare (qualquer subdomínio de trycloudflare.com).
      server: {middlewareMode: true, ...(rede ? {hmr: false, allowedHosts: [".trycloudflare.com"]} : {})},
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(webRoot, "dist");
    if (!existsSync(dist)) {
      throw new Error("A tela ainda não foi montada. Rode: npm run app:montar");
    }
    app.use(express.static(dist));
    app.get("*", (_request, response) => response.sendFile(path.join(dist, "index.html")));
  }

  return new Promise((resolve) => {
    const server = app.listen(porta, rede ? "0.0.0.0" : "127.0.0.1", () => resolve(server));
  });
};

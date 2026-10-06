import {spawn} from "node:child_process";
import {createWriteStream, existsSync, writeFileSync} from "node:fs";
import {copyFile, mkdir, rename, rm} from "node:fs/promises";
import type {Server} from "node:http";
import os from "node:os";
import path from "node:path";
import {pipeline} from "node:stream/promises";
import express from "express";
import type {NextFunction, Request, Response} from "express";
import {groupWords} from "../../src/captions";
import {assignForStyle, novaSemente, wordsOfBlocks} from "../../src/motor/blocos";
import {renderVideo} from "../../src/motor/exportar";
import {caminhoDoSom, listarSons, somTocadoEmCache} from "../../src/motor/pasta-sons";
import {getVideoMetadata} from "../../src/motor/ferramentas";
import {
  listarVideos,
  loadCatalog,
  loadStyle,
  outputPathFor,
  readProject,
  SINCRONIA_DE_PROJETO_NOVO,
} from "../../src/motor/projeto";
import type {Projeto} from "../../src/motor/projeto";
import {carregarEnv} from "../../src/motor/env";
import {transcrever} from "../../src/motor/transcricao";
import {detectarVozDoVideo} from "../../src/motor/voz";
import {reloadModules} from "../../src/template-loader";
import {configDosEfeitos, planejarEfeitos} from "../../src/sons";
import {cortesDosExcluidos, precisaoDoProjeto, sincroniaDoProjeto} from "../../src/entrada";
import type {AssignedCaptionBlock} from "../../src/types";
import {configuracaoDoAmbiente} from "./configuracao";
import {contasDoAmbiente} from "./contas";
import {rotasDeEnvio} from "./envio";
import {s3DoAmbiente} from "./s3";
import type {ConfigDoLogin} from "./contas";
import {espacoDoUsuario, espacoLocal} from "./espaco";
import type {Espaco} from "./espaco";

export type OpcoesServidor = {
  porta: number;
  // Pasta com templates/, paletas/, os vídeos e o transcricao.json.
  pastaProjeto: string;
  // "dev": a tela é servida pelo Vite; "producao": pelos arquivos já montados.
  modo: "dev" | "producao";
  // Aceita aparelhos da mesma rede (npm run app:rede). Sem isso, só a própria máquina.
  rede?: boolean;
  // Servidor na internet (SERVIDOR_PUBLICO=1, veja configuracao.ts): exige login,
  // ouve em 0.0.0.0 atrás do proxy, sem o que só faz sentido no computador.
  publico?: boolean;
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
    // codigo: a tela mostra uma tela própria (ex.: "assine" → Assine para continuar).
    const codigo = error instanceof ErroDoPlano ? error.codigo : undefined;
    send({tipo: "erro", mensagem: error instanceof Error ? error.message : String(error), codigo});
  } finally {
    response.end();
  }
};

// Exportação que o plano não permite (o render nem começa).
class ErroDoPlano extends Error {
  constructor(
    mensagem: string,
    readonly codigo: string,
  ) {
    super(mensagem);
  }
}

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

// Espaço (vídeos e projetos) de quem fez o pedido, preenchido pela autenticação.
const espacoDe = (response: Response): Espaco => response.locals.espaco as Espaco;

// Token da sessão: no cabeçalho Authorization; nos GET de arquivos (vídeo da
// prévia, sons, download), que o navegador pede sem cabeçalho, no cookie sessao.
const tokenDoPedido = (request: Request): string | undefined => {
  const cabecalho = request.headers.authorization;
  if (cabecalho?.startsWith("Bearer ")) {
    return cabecalho.slice("Bearer ".length).trim() || undefined;
  }
  if (request.method !== "GET") {
    return undefined;
  }
  const cookie = (request.headers.cookie ?? "").split(";").map((parte) => parte.trim()).find((parte) => parte.startsWith("sessao="));
  return cookie ? decodeURIComponent(cookie.slice("sessao=".length)) || undefined : undefined;
};

// Pedido feito na própria máquina (não por túnel nem pela rede).
const pedidoLocal = (request: Request): boolean => {
  const endereco = request.socket.remoteAddress ?? "";
  const encaminhado = ["x-forwarded-for", "cf-connecting-ip", "x-real-ip", "forwarded"].some((nome) => request.headers[nome]);
  return !encaminhado && (endereco === "127.0.0.1" || endereco === "::1" || endereco === "::ffff:127.0.0.1");
};

export const iniciarServidor = async ({porta, pastaProjeto, modo, rede = false, publico = false}: OpcoesServidor): Promise<Server> => {
  const root = path.resolve(pastaProjeto);
  // Chaves do Replicate, da Groq e do Supabase do .env da pasta do projeto.
  carregarEnv(root);
  // Sem as variáveis do Supabase, o modo local de sempre, sem login.
  const contas = contasDoAmbiente();
  console.log(contas ? "Login pelo Supabase: ligado." : "Login: desligado (sem as variáveis do Supabase no .env), modo local.");
  // Na internet, nunca sem login (o modo local daria acesso a qualquer um).
  if (publico && !contas) {
    throw new Error("SERVIDOR_PUBLICO=1 exige SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e SUPABASE_SECRET_KEY.");
  }
  // Envio direto ao S3 (com login e com as credenciais da AWS); sem isso, o envio
  // passa pelo servidor e vai para o disco, como sempre.
  const armazenamento = contas ? s3DoAmbiente(configuracaoDoAmbiente()) : undefined;
  console.log(armazenamento ? `Envio de vídeos: direto para o S3 (${armazenamento.bucket}).` : "Envio de vídeos: pelo servidor, para o disco.");
  const app = express();
  // Atrás do proxy do Render: o endereço e o https verdadeiros vêm dos cabeçalhos.
  if (publico) {
    app.set("trust proxy", 1);
  }
  app.use(express.json({limit: "20mb"}));

  // Saúde, para o Render saber que o servidor subiu (sem login, sem dados).
  app.get("/saude", (_request, response) => {
    response.json({ok: true});
  });

  // Só uma tarefa longa (transcrever ou exportar) por vez nesta máquina.
  let tarefaAtual: string | undefined;
  const reservar = (nome: string, response: Response): boolean => {
    if (tarefaAtual) {
      response.status(409).json({mensagem: `Aguarde: ${tarefaAtual} em andamento.`});
      return false;
    }
    tarefaAtual = nome;
    return true;
  };

  const videoPath = (espaco: Espaco, nome: string): string => {
    if (!espaco.videos().includes(nome)) {
      throw new Error(`Vídeo não encontrado: ${nome}`);
    }
    return path.join(espaco.pasta, nome);
  };

  const handle =
    (fn: (request: Request, response: Response) => Promise<unknown> | unknown) =>
    async (request: Request, response: Response) => {
      try {
        const result = await fn(request, response);
        if (!response.headersSent) {
          response.json(result ?? {});
        }
      } catch (error) {
        response.status(400).json({mensagem: error instanceof Error ? error.message : String(error)});
      }
    };

  // O que a tela precisa para mostrar (ou não) o login. Sem token: é o primeiro
  // pedido. A chave publicável pode ir ao navegador; a secreta nunca.
  app.get("/api/config", (_request, response) => {
    const config: ConfigDoLogin = contas ? {...contas.config, envioDireto: Boolean(armazenamento)} : {login: false};
    response.json(config);
  });

  // Todas as outras rotas: com login, o token do usuário é validado e o pedido
  // passa a usar o espaço dele; sem login, o espaço local.
  app.use(["/api", "/media", "/saidas", "/sons"], async (request: Request, response: Response, next: NextFunction) => {
    if (!contas) {
      response.locals.espaco = espacoLocal(root);
      next();
      return;
    }
    const token = tokenDoPedido(request);
    if (!token) {
      response.status(401).json({mensagem: "Entre na sua conta."});
      return;
    }
    try {
      const usuario = await contas.validar(token);
      response.locals.espaco = espacoDoUsuario(root, contas, usuario, token);
      response.locals.token = token;
      next();
    } catch (error) {
      response.status(401).json({mensagem: error instanceof Error ? error.message : String(error)});
    }
  });

  // Envio direto do navegador para o S3, em partes (veja envio.ts).
  if (contas && armazenamento) {
    app.use("/api/envio", rotasDeEnvio({contas, armazenamento, espacoDe}));
  }

  // Vídeos do espaço e os que já têm projeto (para a lista do Início).
  const catalogo = async (espaco: Espaco) => ({...loadCatalog(root, espaco.pasta), projetos: await espaco.projetos()});

  app.get("/api/catalogo", handle((_request, response) => catalogo(espacoDe(response))));

  // Conta: e-mail e plano (o plano vem do perfil). Sem login: null.
  app.get(
    "/api/conta",
    handle(async (_request, response) => {
      const espaco = espacoDe(response);
      if (!contas || !espaco.usuario) {
        return {conta: null};
      }
      const perfil = await contas.perfil(espaco.usuario, response.locals.token as string);
      const uso = await espaco.cota?.uso();
      return {conta: {email: espaco.usuario.email, nome: perfil.nome, plano: perfil.plano, uso}};
    }),
  );

  // Relê templates/ e paletas/ sem reiniciar o servidor.
  app.post(
    "/api/recarregar",
    handle(async (_request, response) => {
      await reloadModules();
      return catalogo(espacoDe(response));
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

  // O projeto de um vídeo (?video=); sem vídeo, o último editado. No modo local,
  // o do transcricao.json (a tela confere se é do vídeo aberto).
  app.get(
    "/api/projeto",
    handle(async (request, response) => {
      const video = typeof request.query.video === "string" && request.query.video ? request.query.video : undefined;
      return {projeto: (await espacoDe(response).lerProjeto(video)) ?? null};
    }),
  );

  app.put(
    "/api/projeto",
    handle(async (request, response) => {
      const espaco = espacoDe(response);
      const projeto = request.body as Projeto;
      // Só projetos de vídeos do próprio espaço.
      videoPath(espaco, projeto.source);
      // A lista de palavras acompanha sempre as palavras dos blocos editados.
      await espaco.salvarProjeto({...projeto, words: wordsOfBlocks(projeto.blocks)});
      return {ok: true};
    }),
  );

  app.get(
    "/api/estilo",
    handle(async (request, response) => {
      const {pacote, paleta} = request.query as {pacote?: string; paleta?: string};
      return loadStyle(root, {pacote, paleta}, await espacoDe(response).lerProjeto());
    }),
  );

  // Trechos de voz do áudio, para a Sincronia precisa de um projeto transcrito
  // antes de existir a detecção (a transcrição nova já salva a voz).
  app.get(
    "/api/voz",
    handle((request, response) => detectarVozDoVideo(videoPath(espacoDe(response), String(request.query.nome ?? "")))),
  );

  app.get(
    "/api/video-info",
    handle((request, response) => getVideoMetadata(videoPath(espacoDe(response), String(request.query.nome ?? "")))),
  );

  app.get("/media/:nome", (request, response) => {
    try {
      response.sendFile(videoPath(espacoDe(response), request.params.nome));
    } catch (error) {
      response.status(404).send(error instanceof Error ? error.message : String(error));
    }
  });

  // Importar vídeo: o corpo da requisição é o arquivo; ele é gravado num arquivo
  // temporário e só ganha o nome final quando a cópia termina.
  app.put("/api/importar", async (request, response) => {
    const espaco = espacoDe(response);
    // Com envio direto ao S3, o vídeo não passa pelo servidor (e os limites do
    // plano valem lá): esta rota fica só para o modo local.
    if (armazenamento && espaco.usuario) {
      response.status(400).json({mensagem: "Atualize a página: o envio de vídeos agora vai direto para o armazenamento."});
      return;
    }
    const nome = path.basename(String(request.query.nome ?? ""));
    const substituir = request.query.substituir === "1";
    if (!/\.(mp4|mov|mkv|webm)$/iu.test(nome) || nome.toLowerCase() === "saida.mp4") {
      response.status(400).json({mensagem: "Escolha um vídeo .mp4, .mov, .mkv ou .webm."});
      return;
    }
    const destino = path.join(espaco.pasta, nome);
    if (existsSync(destino) && !substituir) {
      response.status(409).json({mensagem: `Já existe um vídeo chamado ${nome}.`});
      return;
    }
    const temporario = `${destino}.importando`;
    try {
      await mkdir(espaco.pasta, {recursive: true});
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
    const arquivo = path.join(espacoDe(response).pasta, "saidas", path.basename(request.params.nome));
    if (!existsSync(arquivo)) {
      response.status(404).send("Arquivo não encontrado em saidas/.");
      return;
    }
    response.download(arquivo);
  });

  // Abre a pasta saidas/ no explorador de arquivos do sistema.
  app.post(
    "/api/abrir-saidas",
    handle(async (_request, response) => {
      // Abre o Explorer da máquina do servidor: só no computador.
      if (publico) {
        throw new Error("Indisponível no app publicado: baixe o vídeo exportado.");
      }
      const pasta = path.join(espacoDe(response).pasta, "saidas");
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
    const espaco = espacoDe(response);
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
        const anterior = await espaco.lerProjeto(video);
        const ajustes = manterAjustes && anterior?.source === video ? anterior : undefined;
        // WhisperX, com a Groq e o Whisper local de reserva; a voz do áudio
        // (Sincronia precisa) é detectada junto (veja src/motor/transcricao.ts).
        const {words, voz, model, avisos} = await transcrever(root, videoPath(espaco, video), {
          // Na internet, sem o Whisper local (não fica no servidor).
          ...(publico ? {semWhisperLocal: true} : {}),
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
        await espaco.salvarProjeto(projeto);
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
      const espaco = espacoDe(response);
      const nome = String((request.body as {nome?: string}).nome ?? "");
      const origem = videoPath(espaco, nome);
      const pasta = path.join(espaco.pasta, PASTA_DE_REMOVIDOS);
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
      const apagouTranscricao = await espaco.apagarProjeto(nome);
      response.json({movidoPara: path.relative(espaco.pasta, destino), apagouTranscricao});
    } catch (error) {
      response.status(400).json({mensagem: error instanceof Error ? error.message : String(error)});
    } finally {
      tarefaAtual = undefined;
    }
  });

  // Antes de exportar: quanto vai descontar, quanto sobra, se sai com marca d'água
  // ou por que não pode. Sem login: sem limite. A exportação decide de novo.
  app.get(
    "/api/exportar/previa",
    handle(async (request, response) => {
      const espaco = espacoDe(response);
      if (!espaco.cota) {
        return {semLimite: true};
      }
      const video = String(request.query.video ?? "");
      const metadados = await getVideoMetadata(videoPath(espaco, video));
      return espaco.cota.decidir(video, metadados.durationInFrames / metadados.fps);
    }),
  );

  app.post("/api/exportar", async (request, response) => {
    if (!reservar("exportação", response)) {
      return;
    }
    const espaco = espacoDe(response);
    // O vídeo do projeto a exportar (sem ele, o último editado).
    const {video: pedido} = (request.body ?? {}) as {video?: string};
    try {
      await streamTask(response, async (progress) => {
        const projeto = await espaco.lerProjeto(pedido);
        if (!projeto || (pedido && projeto.source !== pedido)) {
          throw new Error("Não há projeto para exportar.");
        }
        const inputPath = videoPath(espaco, projeto.source);
        const style = await loadStyle(root, {pacote: projeto.pacote, paleta: projeto.paleta}, projeto);
        const outputPath = outputPathFor(espaco.pasta, projeto.source, style.pacote, style.paleta);
        const missing = projeto.blocks.findIndex((block) => !style.templates[block.template]);
        if (missing >= 0) {
          throw new Error(
            `O bloco ${missing + 1} usa o layout '${projeto.blocks[missing].template}', que não existe no pacote ${style.pacote}.`,
          );
        }
        const video = await getVideoMetadata(inputPath);
        // O plano decide aqui, com a duração do arquivo medida no servidor: se não
        // cabe, o render nem começa; a marca d'água vem do plano, nunca do pedido.
        const duracaoS = video.durationInFrames / video.fps;
        const decisao = await espaco.cota?.decidir(projeto.source, duracaoS);
        if (decisao && !decisao.permitido) {
          throw new ErroDoPlano(decisao.motivo ?? "O seu plano não permite esta exportação.", decisao.codigo ?? "plano");
        }
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
            marcaDagua: decisao?.comMarca ?? false,
          },
          progress,
        );
        // Só o que terminou desconta: o registro vem depois do render.
        if (decisao) {
          await espaco.cota!.registrar(projeto.source, duracaoS, decisao);
        }
        return {caminho: outputPath, descontoS: decisao?.descontoS};
      });
    } finally {
      tarefaAtual = undefined;
    }
  });

  // "Importar projetos deste computador": no primeiro login, traz para a conta os
  // vídeos da pasta do projeto e o transcricao.json (copiados; o modo local
  // continua com eles). Só pedido na própria máquina (não pelo túnel nem pela
  // rede) e uma vez só: a primeira conta que importa fica registrada.
  const marcaDaImportacao = path.join(root, "usuarios", ".importacao-local.json");
  const importacaoLocal = async (request: Request, espaco: Espaco) => {
    const videos = listarVideos(root);
    const projeto = readProject(root);
    const projetoValido = projeto && videos.includes(projeto.source) ? projeto : undefined;
    const disponivel =
      Boolean(contas && espaco.usuario) &&
      !publico &&
      pedidoLocal(request) &&
      !existsSync(marcaDaImportacao) &&
      videos.length > 0 &&
      espaco.videos().length === 0 &&
      (await espaco.projetos()).length === 0;
    return {disponivel, videos, projeto: projetoValido};
  };

  app.get(
    "/api/importacao-local",
    handle(async (request, response) => {
      const {disponivel, videos, projeto} = await importacaoLocal(request, espacoDe(response));
      return disponivel ? {disponivel, videos, projeto: projeto?.source ?? null} : {disponivel: false};
    }),
  );

  app.post("/api/importacao-local", async (request, response) => {
    if (!reservar("importação dos projetos", response)) {
      return;
    }
    const espaco = espacoDe(response);
    try {
      await streamTask(response, async (progress) => {
        const {disponivel, videos, projeto} = await importacaoLocal(request, espaco);
        if (!disponivel) {
          throw new Error("A importação deste computador não está disponível para esta conta.");
        }
        await mkdir(espaco.pasta, {recursive: true});
        for (const [indice, nome] of videos.entries()) {
          progress(`Copiando ${nome}...`, indice / videos.length);
          await copyFile(path.join(root, nome), path.join(espaco.pasta, nome));
        }
        if (projeto) {
          progress("Importando o projeto...");
          await espaco.salvarProjeto(projeto);
        }
        writeFileSync(marcaDaImportacao, JSON.stringify({usuario: espaco.usuario?.id, quando: new Date().toISOString()}, null, 2));
        return {videos: videos.length, projetos: projeto ? 1 : 0};
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
    const server = app.listen(porta, rede || publico ? "0.0.0.0" : "127.0.0.1", () => resolve(server));
  });
};


import {spawn} from "node:child_process";
import {createHash, timingSafeEqual} from "node:crypto";
import {createWriteStream, existsSync, writeFileSync} from "node:fs";
import {copyFile, mkdir, rename, rm, stat} from "node:fs/promises";
import type {Server} from "node:http";
import os from "node:os";
import path from "node:path";
import {pipeline} from "node:stream/promises";
import express from "express";
import type {NextFunction, Request, Response} from "express";
import {groupWords} from "../../src/captions";
import {assignForStyle, migrarPacoteC, novaSemente, temPacoteCAntigo, wordsOfBlocks} from "../../src/motor/blocos";
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
import {PASTAS_NO_BUCKET, configuracaoDoAmbiente} from "./configuracao";
import {contasDoAmbiente} from "./contas";
import {rotasDeEnvio} from "./envio";
import {previasLeves, tirarCapa} from "./previa-leve";
import {videosDasContas} from "./videos";
import {apiDoMercadoPago, mercadoPagoDoAmbiente, validarWebhook} from "./mercadopago";
import {assinaturaVigente, bancoNoSupabase, processadorDeEventos, regraDaAssinatura, resumoDaAssinatura} from "./assinaturas";
import type {ResumoDaAssinatura} from "./assinaturas";
import {DIAS_DO_PIX, ErroDoPix, bancoDoPixNoSupabase, cpfValido, motivoParaNaoPagarPix, processadorDePix, vistaDoPix} from "./pix";
import {LIMITES} from "./cota";
import {compararNiveis, nivelValido, planoPago, planosPagos} from "./planos";
import type {Nivel} from "./planos";
import type {PlanoPago} from "./planos";
import {LIMITES_DE_USO, filaComVagas, limiteDePedidos, textoDaFila} from "./limites";
import {idDoEnvio, memoriaMB, registrarEnvio, segundos, semEnderecos} from "./registro";

// Números dos planos para a página de apresentação (quem chega sem login), lidos da
// configuração: o preço do Mercado Pago (ASSINATURA_VALOR_BRL; sem o Mercado Pago,
// não vai), os minutos do assinante, os dias do Pix e os vídeos do grátis.
// pagos: Básico, Pro e Editor (planos.ts), só com o Mercado Pago ligado.
export type PlanosDaApresentacao = {
  precoBRL?: number;
  pagos?: PlanoPago[];
  minutosDoAssinante: number;
  diasDoPix: number;
  videosNoGratis: number;
};

// Erro com mensagem já pronta para a tela.
class ErroParaATela extends Error {}
// "07/11" no horário de Brasília.
const dataCurtaBr = (iso: string | undefined) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", {day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo"}) : "o fim do período";
import {rendersNoLambda} from "./renders";
import type {ExportacaoMontada} from "./renders";
import type {AwsRegion} from "@remotion/lambda/client";
import {tituloDoVideo} from "./titulo";
import {tarefasSoltas} from "./tarefas-soltas";
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
  const previas = armazenamento ? previasLeves(armazenamento) : undefined;
  // Exportação no Lambda (com login e S3; veja renders.ts). O site do Lambda é
  // publicado por script (npm run nuvem:site): montar o site não cabe na memória do
  // servidor na nuvem. Sem o site desta versão, a exportação avisa.
  const lambda =
    contas && armazenamento
      ? rendersNoLambda({raiz: root, regiao: configuracaoDoAmbiente().regiaoAws as AwsRegion, contas, armazenamento})
      : undefined;
  if (lambda) {
    lambda
      .prontoParaExportar()
      .then(({site, funcao}) => console.log(`Exportação: no Lambda (${funcao}, site ${site.nome}).`))
      .catch((erro: unknown) => console.log(`Exportação: ${erro instanceof Error ? erro.message : String(erro)}`));
  }
  console.log(armazenamento ? `Envio de vídeos: direto para o S3 (${armazenamento.bucket}).` : "Envio de vídeos: pelo servidor, para o disco.");
  const app = express();
  // Atrás do proxy do Render: o endereço e o https verdadeiros vêm dos cabeçalhos.
  if (publico) {
    app.set("trust proxy", 1);
  }
  app.use(express.json({limit: "20mb"}));

  // Saúde, para o Render saber que o servidor está de pé (sem login, sem dados de
  // ninguém). Antes do login e do limite de pedidos, e só com números da memória (sem
  // banco nem S3): responde na hora mesmo com a fila cheia. /saude é o nome antigo.
  app.get(["/api/saude", "/saude"], (_request, response) => {
    const fila = (vagas: {ocupadas: () => number; esperando: () => number}) => ({rodando: vagas.ocupadas(), esperando: vagas.esperando()});
    response.setHeader("Cache-Control", "no-store");
    response.json({
      ok: true,
      memoriaMB: memoriaMB(),
      ligadoHaS: Math.round(process.uptime()),
      filas: {previas: previas?.fila(), transcricoes: fila(filaDeTranscricoes), sons: fila(filaDeSons)},
    });
  });

  // Assinatura pelo Mercado Pago (Etapa 2c, veja assinaturas.ts). Sem
  // MERCADOPAGO_ACCESS_TOKEN, não há assinatura: o "Assinar" não aparece.
  const mercadoPago = contas ? mercadoPagoDoAmbiente() : undefined;
  const apiMp = mercadoPago ? apiDoMercadoPago(mercadoPago) : undefined;
  const bancoDasAssinaturas = contas ? bancoNoSupabase(contas.admin) : undefined;
  // Pix avulso de 30 dias (Etapa 2d, veja pix.ts): o mesmo token e o mesmo webhook.
  const pixMp = apiMp && bancoDasAssinaturas && contas ? processadorDePix({banco: bancoDoPixNoSupabase(contas.admin, bancoDasAssinaturas), api: apiMp}) : undefined;
  const eventosMp =
    apiMp && bancoDasAssinaturas ? processadorDeEventos({banco: bancoDasAssinaturas, api: apiMp, outroPagamento: pixMp?.doPagamento}) : undefined;
  console.log(
    mercadoPago
      ? `Assinatura: Mercado Pago ligado (${planosPagos().map((p) => `${p.nome} R$ ${p.valor} / ${p.minutos} min`).join(", ")}; por mês ou 30 dias por Pix).`
      : "Assinatura: desligada (sem MERCADOPAGO_ACCESS_TOKEN).",
  );
  const processarEventosMp = () =>
    void eventosMp
      ?.processarPendentes()
      .then((resultados) => resultados.forEach((linha) => console.log(`Mercado Pago: ${linha}`)))
      .catch((erro: unknown) => console.log(`Mercado Pago: ${erro instanceof Error ? erro.message : String(erro)}`));
  // Os que falharam são tentados de novo (e os que chegaram com o servidor ocupado).
  // Junto, a verificação periódica: pendentes há mais de 2 minutos e ativas perto da
  // cobrança são consultadas no Mercado Pago (com limite, veja assinaturas.ts).
  const verificarAssinaturasMp = () =>
    void eventosMp
      ?.verificarAssinaturas()
      .then((resultados) => resultados.forEach((linha) => console.log(`Mercado Pago: ${linha}`)))
      .catch((erro: unknown) => console.log(`Mercado Pago: verificação: ${erro instanceof Error ? erro.message : String(erro)}`));
  const verificarPixMp = () =>
    void pixMp
      ?.verificar()
      .then((resultados) => resultados.forEach((linha) => console.log(`Pix: ${linha}`)))
      .catch((erro: unknown) => console.log(`Pix: verificação: ${erro instanceof Error ? erro.message : String(erro)}`));
  if (eventosMp) {
    setInterval(() => {
      processarEventosMp();
      verificarAssinaturasMp();
      verificarPixMp();
    }, 60_000).unref();
  }

  // Diagnóstico da assinatura (só com a chave própria CHAVE_ADMIN no cabeçalho
  // x-chave-admin; sem ela no ambiente, as rotas nem existem). Devolve só o
  // necessário para entender o estado: nada de valores, meio de pagamento ou e-mail.
  // Cada uso (e cada chave errada) fica no log, com o endereço de quem pediu.
  const chaveAdminConfere = (request: Request) => {
    const chave = process.env.CHAVE_ADMIN?.trim();
    const recebida = request.header("x-chave-admin");
    if (!chave || chave.length < 32 || !recebida) return false;
    const resumo = (texto: string) => createHash("sha256").update(texto).digest();
    const confere = timingSafeEqual(resumo(chave), resumo(recebida));
    if (!confere) console.log(`Admin: chave errada em ${request.method} ${request.path} de ${request.ip ?? "?"}.`);
    return confere;
  };
  const idDaAssinaturaValido = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);
  const registrarUsoAdmin = (request: Request, id: string, resultado: string) =>
    console.log(`Admin: ${request.method} ${request.path.replace(id, "…")} assinatura ${id} de ${request.ip ?? "?"}: ${resultado}.`);
  const diagnosticoDaAssinatura = async (preapprovalId: string) => {
    const pre = await apiMp!.assinatura(preapprovalId);
    const linha = await bancoDasAssinaturas!.assinaturaPorPreapproval(preapprovalId);
    const cobrancas = await apiMp!.cobrancasDaAssinatura(preapprovalId).catch((erro: unknown) => {
      console.log(`Admin: cobranças de ${preapprovalId}: ${erro instanceof Error ? erro.message : String(erro)}`);
      return undefined;
    });
    const perfil = linha ? await bancoDasAssinaturas!.perfil(linha.usuario_id) : undefined;
    return {
      mercadoPago: {
        status: pre.status,
        external_reference_confere: Boolean(linha && pre.external_reference === linha.usuario_id),
        date_created: pre.date_created,
        next_payment_date: pre.next_payment_date,
        cobrancas_feitas: pre.summarized?.charged_quantity ?? null,
        ultima_cobranca: pre.summarized?.last_charged_date ?? null,
        semaforo: pre.summarized?.semaphore ?? null,
      },
      cobrancas: cobrancas
        ? cobrancas.map((cobranca) => ({
            id: cobranca.id,
            status: cobranca.status,
            debit_date: cobranca.debit_date,
            pagamento: cobranca.payment ? {status: cobranca.payment.status, status_detail: cobranca.payment.status_detail} : undefined,
          }))
        : {erro: "não deu para consultar (detalhe no log)"},
      banco: linha ? {status: linha.status, pago_ate: linha.pago_ate, proxima_cobranca: linha.proxima_cobranca, cobranca_falhou_em: linha.cobranca_falhou_em} : null,
      perfil: perfil ? {plano: perfil.plano, plano_origem: perfil.plano_origem, plano_ate: perfil.plano_ate, ciclo_fim: perfil.ciclo_fim} : undefined,
    };
  };
  app.get("/admin/assinatura/:id", async (request: Request, response: Response) => {
    const id = String(request.params.id);
    if (!apiMp || !bancoDasAssinaturas || !chaveAdminConfere(request) || !idDaAssinaturaValido(id)) {
      response.status(404).json({ok: false});
      return;
    }
    try {
      response.json(await diagnosticoDaAssinatura(id));
      registrarUsoAdmin(request, id, "consultada");
    } catch (erro) {
      registrarUsoAdmin(request, id, `falhou (${erro instanceof Error ? erro.message : String(erro)})`);
      response.status(502).json({erro: "não deu para consultar (detalhe no log)"});
    }
  });
  app.post("/admin/assinatura/:id/sincronizar", async (request: Request, response: Response) => {
    const id = String(request.params.id);
    if (!apiMp || !bancoDasAssinaturas || !eventosMp || !chaveAdminConfere(request) || !idDaAssinaturaValido(id)) {
      response.status(404).json({ok: false});
      return;
    }
    try {
      const linha = await bancoDasAssinaturas.assinaturaPorPreapproval(id);
      if (!linha) {
        registrarUsoAdmin(request, id, "desconhecida");
        response.status(404).json({erro: "assinatura desconhecida"});
        return;
      }
      const resultado = await eventosMp.sincronizar(linha);
      registrarUsoAdmin(request, id, `reprocessada (${resultado})`);
      response.json({resultado, ...(await diagnosticoDaAssinatura(linha.mp_preapproval_id))});
    } catch (erro) {
      registrarUsoAdmin(request, id, `falhou (${erro instanceof Error ? erro.message : String(erro)})`);
      response.status(502).json({erro: "não deu para reprocessar (detalhe no log)"});
    }
  });

  // Webhook do Mercado Pago: público (sem login, fora do limite de pedidos). Valida o
  // x-signature (e recusa ts antigo), guarda o evento (o repetido é ignorado),
  // responde 200 na hora e processa depois, sempre consultando o Mercado Pago.
  app.post("/webhooks/mercadopago", async (request: Request, response: Response) => {
    if (!eventosMp || !mercadoPago) {
      response.status(404).json({ok: false});
      return;
    }
    const consulta = request.query as Record<string, unknown>;
    const corpo = (request.body ?? {}) as {type?: string; data?: {id?: string | number}};
    const dataId = String(consulta["data.id"] ?? (consulta.data as {id?: string} | undefined)?.id ?? corpo.data?.id ?? consulta.id ?? "");
    const tipo = String(consulta.type ?? consulta.topic ?? corpo.type ?? "");
    const requestId = request.header("x-request-id") ?? undefined;
    const validacao = validarWebhook({assinatura: request.header("x-signature") ?? undefined, requestId, dataId, segredo: mercadoPago.segredoDoWebhook});
    if (!validacao.valido) {
      console.log(`Mercado Pago: webhook recusado (${validacao.motivo}).`);
      response.status(401).json({ok: false});
      return;
    }
    if (!requestId || !dataId || !tipo) {
      response.status(200).json({ok: true});
      return;
    }
    try {
      const recebido = await eventosMp.receber({request_id: requestId, tipo, data_id: dataId});
      response.status(200).json({ok: true});
      if (recebido === "novo") processarEventosMp();
      else console.log(`Mercado Pago: evento repetido ignorado (${tipo} ${dataId}).`);
    } catch (erro) {
      // Sem guardar o evento, o Mercado Pago tenta de novo.
      console.log(`Mercado Pago: não deu para guardar o evento: ${erro instanceof Error ? erro.message : String(erro)}`);
      response.status(500).json({ok: false});
    }
  });

  // O que roda neste computador (render local e importação): uma coisa por vez.
  // Transcrições e exportações no Lambda seguem os limites por conta e a fila geral
  // (veja limites.ts).
  let tarefaAtual: string | undefined;
  const reservar = (nome: string, response: Response): boolean => {
    if (tarefaAtual) {
      response.status(409).json({mensagem: `Aguarde: ${tarefaAtual} em andamento.`});
      return false;
    }
    tarefaAtual = nome;
    return true;
  };

  // Os vídeos de cada conta: os enviados no S3, os antigos no disco (veja videos.ts).
  const videos = videosDasContas(armazenamento);
  // Caminho de um vídeo que está no disco (o antigo, ou o modo local); erro se não está.
  const noDisco = async (espaco: Espaco, nome: string): Promise<string> => {
    const fonte = await videos.fonte(espaco, nome);
    if (fonte.onde !== "disco") {
      throw new Error(`Vídeo não encontrado no disco: ${nome}`);
    }
    return fonte.caminho;
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
    const planos: PlanosDaApresentacao = {
      precoBRL: mercadoPago?.valor,
      pagos: mercadoPago ? planosPagos() : undefined,
      minutosDoAssinante: LIMITES.segundosPorMesNoAssinante / 60,
      diasDoPix: DIAS_DO_PIX,
      videosNoGratis: LIMITES.videosNoGratis,
    };
    response.json(contas ? {...config, planos} : config);
  });

  // Todas as outras rotas: com login, o token do usuário é validado e o pedido
  // passa a usar o espaço dele; sem login, o espaço local.
  app.use(["/api", "/media", "/capa", "/saidas", "/sons"], async (request: Request, response: Response, next: NextFunction) => {
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

  // Pedidos por minuto, por conta (sem login, por endereço): veja limites.ts.
  app.use(
    "/api",
    limiteDePedidos((request, response) => (response.locals.espaco as Espaco | undefined)?.usuario?.id ?? request.ip ?? "?"),
  );

  // Envio direto do navegador para o S3, em partes (veja envio.ts).
  if (contas && armazenamento && previas) {
    app.use("/api/envio", rotasDeEnvio({contas, armazenamento, previas, videos, espacoDe}));
  }

  // Prévia leve e capa do vídeo (veja previa-leve.ts). Sem S3, ou vídeo só no disco:
  // "local", e a tela usa /media como sempre. tentar=1: tenta de novo uma que falhou.
  app.get(
    "/api/previa",
    handle(async (request, response) => {
      const espaco = espacoDe(response);
      const nome = String(request.query.nome ?? "");
      const fonte = await videos.fonte(espaco, nome);
      // Vídeo só no disco: a capa em JPG também, feita aqui (GET /capa).
      const capaLocal = `/capa/${encodeURIComponent(nome)}`;
      if (fonte.onde === "disco" || !previas || !espaco.usuario) {
        return {estado: "local", capa: capaLocal};
      }
      const estado = await previas.estado(espaco.usuario.id, nome, undefined, request.query.tentar === "1");
      return estado.estado === "local" ? {...estado, capa: capaLocal} : estado;
    }),
  );

  // Vídeos do espaço e os que já têm projeto (para a lista do Início).
  // Título de cada vídeo na tela (veja titulo.ts): o guardado no envio ao S3; sem
  // ele (enviado antes, ou só no disco), o nome do arquivo, ou "Vídeo de DD/MM,
  // HH:MM" com a hora do envio (do S3) ou do arquivo no disco.
  const tituloDe = async (espaco: Espaco, video: string): Promise<string> => {
    if (armazenamento && espaco.usuario) {
      const sobre = await armazenamento.sobre(`${PASTAS_NO_BUCKET.videos.prefixo}${espaco.usuario.id}/${video}`).catch(() => undefined);
      if (sobre) {
        return sobre.titulo ?? tituloDoVideo(video, sobre.enviadoEm);
      }
    }
    const quando = await stat(path.join(espaco.pasta, video)).then(
      (info) => info.mtime,
      () => new Date(),
    );
    return tituloDoVideo(video, quando);
  };
  const catalogo = async (espaco: Espaco) => {
    // Pacotes e paletas do disco; os vídeos, do S3 e do disco.
    const lido = {...loadCatalog(root, espaco.pasta), videos: await videos.listar(espaco)};
    const [projetos, titulos] = await Promise.all([
      espaco.projetos(),
      Promise.all(lido.videos.map(async (video) => [video, await tituloDe(espaco, video)] as const)),
    ]);
    return {...lido, projetos, titulos: Object.fromEntries(titulos)};
  };

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
      const assinatura = await resumoDaConta(espaco, response.locals.token as string);
      return {conta: {email: espaco.usuario.email, nome: perfil.nome, plano: perfil.plano, uso, assinatura}};
    }),
  );

  // Resumo da assinatura para a tela (sem a migração 007: nenhuma assinatura). A
  // assinatura que vale é a mais nova já paga (um checkout de troca de plano aberto
  // não muda a situação).
  const resumoDaConta = async (espaco: Espaco, token: string): Promise<ResumoDaAssinatura> => {
    const perfil = await contas!.perfil(espaco.usuario!, token);
    const lista = (await bancoDasAssinaturas?.assinaturasDaConta(espaco.usuario!.id).catch(() => undefined)) ?? [];
    return resumoDaAssinatura(perfil.assinatura, assinaturaVigente(lista), new Date(), Boolean(apiMp));
  };
  // Plano pedido pela tela (só escolhe o checkout; o nível vale pelo valor pago).
  const nivelDoPedido = (request: Request): Nivel => {
    const pedido = (request.body as {nivel?: unknown} | undefined)?.nivel ?? "basico";
    if (!nivelValido(pedido)) throw new Error("Plano desconhecido.");
    return pedido;
  };

  // "Assinar": cria a assinatura no Mercado Pago e devolve o checkout (init_point).
  // O retorno do checkout não vale como prova de pagamento: o plano só muda pelo
  // webhook validado, depois da consulta ao Mercado Pago. Um erro do Mercado Pago
  // aparece na tela como mensagem simples; o detalhe fica só no log.
  const SEM_CHECKOUT = "Não foi possível abrir o pagamento agora. Tente de novo em instantes.";
  const noMercadoPago = async <T>(acao: string, pedido: () => Promise<T>): Promise<T> => {
    try {
      return await pedido();
    } catch (erro) {
      console.log(`Mercado Pago: ${acao}: ${erro instanceof Error ? erro.message : String(erro)}`);
      throw new Error(SEM_CHECKOUT);
    }
  };
  // Corpo: {nivel} (basico, pro ou editor). Sem assinatura: checkout do plano. Com a
  // assinatura por cartão valendo: subir abre o checkout do plano novo (pago cheio, o
  // mês recomeça; a antiga só é cancelada com o pagamento novo aprovado, veja
  // assinaturas.ts); descer muda o valor das próximas cobranças (o nível troca na
  // renovação); o mesmo plano com uma descida agendada desfaz a descida.
  app.post(
    "/api/assinatura",
    handle(async (request, response) => {
      const espaco = espacoDe(response);
      if (!apiMp || !mercadoPago || !bancoDasAssinaturas || !espaco.usuario) {
        throw new Error("A assinatura não está disponível agora.");
      }
      const nivel = nivelDoPedido(request);
      const plano = planoPago(nivel);
      const resumo = await resumoDaConta(espaco, response.locals.token as string);
      if (resumo.situacao === "cortesia") throw new Error("A sua conta já é assinante (cortesia), sem cobrança.");
      if (resumo.situacao === "pix") {
        throw new Error(`Você está no Pix até ${dataCurtaBr(resumo.ate)}. Depois dessa data, você pode assinar com cartão.`);
      }
      if (resumo.situacao === "falhou") throw new Error("A cobrança da sua assinatura falhou. Atualize a forma de pagamento no Mercado Pago antes de trocar de plano.");
      const lista = await bancoDasAssinaturas.assinaturasDaConta(espaco.usuario.id);
      const vigente = assinaturaVigente(lista);
      const nivelAtual = resumo.nivel ?? "basico";
      const troca = resumo.situacao === "nenhuma" ? 0 : compararNiveis(nivel, nivelAtual);
      if (resumo.situacao === "cancelada" && troca <= 0) {
        throw new Error(`Sua assinatura vale até ${dataCurtaBr(resumo.ate)}. Depois dessa data, você pode assinar de novo.`);
      }
      // Descer, ou desfazer uma descida agendada: o valor das próximas cobranças muda.
      if (resumo.situacao === "ativa" && vigente && (troca < 0 || (troca === 0 && resumo.nivelNaRenovacao))) {
        await noMercadoPago(`trocar o valor de ${vigente.mp_preapproval_id}`, () => apiMp.alterarValorDaAssinatura(vigente.mp_preapproval_id, plano.valor));
        await bancoDasAssinaturas.salvarAssinatura(vigente.id, {valor: plano.valor, nivel});
        await bancoDasAssinaturas.salvarPerfil(espaco.usuario.id, {nivel_na_renovacao: troca < 0 ? nivel : null});
        console.log(`Assinatura: ${espaco.usuario.id} ${troca < 0 ? `desce para ${nivel} na renovação` : "desfez a descida"} (${vigente.mp_preapproval_id}).`);
        return {trocado: true, assinatura: await resumoDaConta(espaco, response.locals.token as string)};
      }
      if (resumo.situacao === "ativa" && troca === 0) throw new Error(`Você já está no plano ${plano.nome}.`);
      const atual = lista[0];
      // Assinar de novo depois de um pagamento recusado: a assinatura recusada é
      // cancelada no Mercado Pago (para ele não tentar cobrar de novo e a pessoa
      // pagar duas vezes) e um checkout novo é aberto.
      if (atual && atual.status !== "cancelada" && atual.cobranca_falhou_em) {
        const anterior = await noMercadoPago("consultar a assinatura recusada", () => apiMp.assinatura(atual.mp_preapproval_id));
        const pre = anterior.status === "cancelled" ? anterior : await noMercadoPago("cancelar a assinatura recusada", () => apiMp.cancelarAssinatura(atual.mp_preapproval_id));
        const efeito = regraDaAssinatura(atual, pre, await bancoDasAssinaturas.perfil(espaco.usuario.id), new Date());
        await bancoDasAssinaturas.salvarAssinatura(atual.id, efeito.assinatura);
        if (efeito.perfil) await bancoDasAssinaturas.salvarPerfil(espaco.usuario.id, efeito.perfil);
        console.log(`Assinatura: recusada cancelada antes do novo checkout de ${espaco.usuario.id} (${atual.mp_preapproval_id}).`);
      } else if (atual?.status === "pendente" && atual.init_point && (atual.nivel ?? "basico") === nivel && Date.now() - new Date(atual.criado_em).getTime() < 60 * 60 * 1000) {
        // Tocou em Assinar de novo logo depois: o mesmo checkout.
        return {endereco: atual.init_point};
      }
      const pre = await noMercadoPago(`abrir o checkout de ${espaco.usuario.id}`, () =>
        apiMp.criarAssinatura({
          usuarioId: espaco.usuario!.id,
          email: espaco.usuario!.email,
          valor: plano.valor,
          nome: plano.nome,
          voltaPara: `${configuracaoDoAmbiente().enderecoDoApp}/?assinatura=retorno`,
        }),
      );
      if (!pre.init_point) {
        console.log(`Mercado Pago: abrir o checkout de ${espaco.usuario.id}: resposta sem init_point (${pre.id}).`);
        throw new Error(SEM_CHECKOUT);
      }
      await bancoDasAssinaturas.criarAssinatura({
        usuario_id: espaco.usuario.id,
        mp_preapproval_id: pre.id,
        status: "pendente",
        valor: plano.valor,
        nivel,
        init_point: pre.init_point,
      });
      console.log(`Assinatura: checkout ${troca > 0 ? `de troca para ${nivel}` : `do ${nivel}`} aberto para ${espaco.usuario.id} (${pre.id}).`);
      return {endereco: pre.init_point};
    }),
  );

  // Volta do checkout: o servidor consulta a assinatura desta conta no Mercado Pago
  // (o retorno em si não prova nada) e aplica as mesmas regras do webhook.
  app.post(
    "/api/assinatura/confirmar",
    handle(async (_request, response) => {
      const espaco = espacoDe(response);
      if (!contas || !espaco.usuario) throw new Error("Entre na sua conta.");
      if (eventosMp) {
        const resultado = await eventosMp.confirmarDaConta(espaco.usuario.id).catch((erro: unknown) => `erro ${erro instanceof Error ? erro.message : String(erro)}`);
        console.log(`Mercado Pago: confirmação de ${espaco.usuario.id}: ${resultado}`);
      }
      const perfil = await contas.perfil(espaco.usuario, response.locals.token as string);
      const assinatura = await resumoDaConta(espaco, response.locals.token as string);
      // O checkout mais novo: pago (pago_ate) ou recusado (a cobrança falhou sem nunca
      // ter sido paga; numa troca de plano, a nova já foi cancelada e o plano antigo segue).
      const atual = await bancoDasAssinaturas?.assinaturaDaConta(espaco.usuario.id).catch(() => undefined);
      const pago = Boolean(atual?.pago_ate) && perfil.plano === "assinante";
      const recusado = !pago && Boolean(atual?.cobranca_falhou_em) && (assinatura.situacao === "nenhuma" || atual?.status === "cancelada");
      return {plano: perfil.plano, assinatura, pago, recusado};
    }),
  );

  // Cancelar: no Mercado Pago (sem novas cobranças); assinante até o fim do ciclo pago.
  app.post(
    "/api/assinatura/cancelar",
    handle(async (_request, response) => {
      const espaco = espacoDe(response);
      if (!apiMp || !bancoDasAssinaturas || !espaco.usuario) {
        throw new Error("A assinatura não está disponível agora.");
      }
      const atual = assinaturaVigente(await bancoDasAssinaturas.assinaturasDaConta(espaco.usuario.id));
      if (!atual || atual.status === "cancelada") throw new Error("Não há assinatura ativa para cancelar.");
      const pre = await apiMp.cancelarAssinatura(atual.mp_preapproval_id).catch((erro: unknown) => {
        console.log(`Mercado Pago: cancelar ${atual.mp_preapproval_id}: ${erro instanceof Error ? erro.message : String(erro)}`);
        throw new Error("Não foi possível cancelar agora. Tente de novo em instantes.");
      });
      const perfil = await bancoDasAssinaturas.perfil(espaco.usuario.id);
      const efeito = regraDaAssinatura(atual, pre, perfil, new Date());
      await bancoDasAssinaturas.salvarAssinatura(atual.id, efeito.assinatura);
      if (efeito.perfil) await bancoDasAssinaturas.salvarPerfil(espaco.usuario.id, efeito.perfil);
      console.log(`Assinatura: cancelada por ${espaco.usuario.id} (${atual.mp_preapproval_id}).`);
      return {assinatura: await resumoDaConta(espaco, response.locals.token as string)};
    }),
  );

  // Pix avulso de 30 dias (Etapa 2d). Erros para a tela em português claro, com um
  // código (cpf-necessario: a tela pede o CPF); o detalhe fica só no log. O CPF vai
  // direto ao Mercado Pago: não é guardado nem registrado.
  const rotaDoPix =
    (fn: (request: Request, response: Response) => Promise<unknown>) => async (request: Request, response: Response) => {
      try {
        response.json(await fn(request, response));
      } catch (erro) {
        if (erro instanceof ErroDoPix) {
          response.status(400).json({mensagem: erro.message, codigo: erro.codigo});
          return;
        }
        if (erro instanceof ErroParaATela) {
          response.status(400).json({mensagem: erro.message});
          return;
        }
        console.log(`Pix: ${request.path}: ${erro instanceof Error ? erro.message : String(erro)}`);
        response.status(400).json({mensagem: "Não foi possível falar com o Mercado Pago agora. Tente de novo em instantes."});
      }
    };
  const contaDoPix = (response: Response) => {
    const espaco = espacoDe(response);
    if (!contas || !espaco.usuario) throw new ErroParaATela("Entre na sua conta.");
    if (!pixMp || !mercadoPago) throw new ErroParaATela("O pagamento por Pix não está disponível agora.");
    return {espaco, usuario: espaco.usuario, pix: pixMp};
  };
  // O último Pix da conta (para a tela retomar um código ainda dentro do prazo).
  app.get(
    "/api/pix",
    rotaDoPix(async (_request, response) => {
      const {espaco, usuario, pix} = contaDoPix(response);
      const ultimo = await pix.conferir(usuario.id);
      return {pix: ultimo ? vistaDoPix(ultimo) : null, assinatura: await resumoDaConta(espaco, response.locals.token as string)};
    }),
  );
  // Gerar (ou retomar) um Pix. Corpo: {cpf?} (só quando o Mercado Pago pediu).
  app.post(
    "/api/pix",
    rotaDoPix(async (request, response) => {
      const {espaco, usuario, pix} = contaDoPix(response);
      // Corpo: {cpf?, nivel}. O valor é o do plano (definido aqui, não pela tela).
      const nivel = nivelDoPedido(request);
      const resumo = await resumoDaConta(espaco, response.locals.token as string);
      const motivo = motivoParaNaoPagarPix(resumo, nivel);
      if (motivo) throw new ErroParaATela(motivo);
      const recebido = String((request.body as {cpf?: unknown} | undefined)?.cpf ?? "").trim();
      const cpf = recebido ? cpfValido(recebido) : undefined;
      if (recebido && !cpf) throw new ErroDoPix("cpf-invalido", "CPF inválido. Confira os 11 números.");
      // Um checkout de cartão aberto e não pago é cancelado (para não haver as duas cobranças).
      const cartao = await bancoDasAssinaturas?.assinaturaDaConta(usuario.id).catch(() => undefined);
      if (cartao?.status === "pendente" && apiMp && bancoDasAssinaturas) {
        await apiMp
          .cancelarAssinatura(cartao.mp_preapproval_id)
          .then(() => bancoDasAssinaturas.salvarAssinatura(cartao.id, {status: "cancelada", cancelada_em: new Date().toISOString()}))
          .catch((erro: unknown) => console.log(`Pix: cancelar o checkout de cartão ${cartao.mp_preapproval_id}: ${erro instanceof Error ? erro.message : String(erro)}`));
      }
      return {pix: vistaDoPix(await pix.gerar({id: usuario.id, email: usuario.email}, planoPago(nivel).valor, cpf, nivel))};
    }),
  );
  // A tela do Pix conferindo se o pagamento caiu (o servidor consulta o Mercado Pago).
  app.post(
    "/api/pix/conferir",
    rotaDoPix(async (_request, response) => {
      const {espaco, usuario, pix} = contaDoPix(response);
      const ultimo = await pix.conferir(usuario.id);
      return {pix: ultimo ? vistaDoPix(ultimo) : null, assinatura: await resumoDaConta(espaco, response.locals.token as string)};
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
  // (tocados/..., veja somTocado em src/sons.ts) são gerados na primeira vez: a prévia
  // pede todos de uma vez, então vão para a fila (um ffmpeg por som) e o mesmo som
  // pedido duas vezes é gerado uma só.
  const pastaDosSonsTocados = path.join(os.tmpdir(), "legendas-dinamicas-sons");
  const filaDeSons = filaComVagas(LIMITES_DE_USO.sonsAoMesmoTempo);
  const sonsSendoFeitos = new Map<string, Promise<string | undefined>>();
  const somTocado = (relativo: string): Promise<string | undefined> => {
    let feito = sonsSendoFeitos.get(relativo);
    if (!feito) {
      feito = filaDeSons
        .entrar()
        .then((liberar) => somTocadoEmCache(root, relativo, pastaDosSonsTocados).finally(liberar))
        .catch(() => undefined)
        .finally(() => sonsSendoFeitos.delete(relativo));
      sonsSendoFeitos.set(relativo, feito);
    }
    return feito;
  };
  app.get("/sons/*", async (request, response) => {
    const relativo = String((request.params as Record<string, string>)[0] ?? "");
    const arquivo = caminhoDoSom(root, relativo) ?? (await somTocado(relativo));
    if (!arquivo) {
      response.status(404).send("Som não encontrado em sons/.");
      return;
    }
    response.sendFile(arquivo);
  });

  // Projeto ainda com layouts do pacote C antigo (c1 a c6): os layouts são escolhidos
  // de novo com o C versão 2 (o editor salva na próxima edição; o render usa já).
  const comPacoteCNovo = async (projeto: Projeto): Promise<Projeto> =>
    temPacoteCAntigo(projeto.blocks)
      ? {...projeto, blocks: migrarPacoteC(projeto, await loadStyle(root, {pacote: projeto.pacote, paleta: projeto.paleta}, projeto))}
      : projeto;

  // O projeto de um vídeo (?video=); sem vídeo, o último editado. No modo local,
  // o do transcricao.json (a tela confere se é do vídeo aberto).
  app.get(
    "/api/projeto",
    handle(async (request, response) => {
      const video = typeof request.query.video === "string" && request.query.video ? request.query.video : undefined;
      const projeto = await espacoDe(response).lerProjeto(video);
      return {projeto: projeto ? await comPacoteCNovo(projeto) : null};
    }),
  );

  app.put(
    "/api/projeto",
    handle(async (request, response) => {
      const espaco = espacoDe(response);
      const projeto = request.body as Projeto;
      // Só projetos de vídeos do próprio espaço.
      await videos.fonte(espaco, projeto.source);
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
    handle(async (request, response) => {
      const entrada = await videos.entrada(espacoDe(response), String(request.query.nome ?? ""));
      // Extrai o áudio do vídeo inteiro: na mesma fila das transcrições.
      const liberar = await filaDeTranscricoes.entrar();
      try {
        return await detectarVozDoVideo(entrada);
      } finally {
        liberar();
      }
    }),
  );

  app.get(
    "/api/video-info",
    handle(async (request, response) => getVideoMetadata(await videos.entrada(espacoDe(response), String(request.query.nome ?? "")))),
  );

  // Capa em JPG de um vídeo que só existe no disco (a do S3 vem com a prévia leve).
  // Feita na primeira vez e guardada na pasta temporária (refeita se o vídeo mudar).
  // O navegador não precisa abrir o vídeo inteiro para mostrar um quadro (no iPhone,
  // o <video> muitas vezes nem desenha o quadro).
  const capasSendoFeitas = new Map<string, Promise<void>>();
  app.get("/capa/:nome", async (request, response) => {
    try {
      const espaco = espacoDe(response);
      const video = await noDisco(espaco, request.params.nome);
      const pasta = path.join(os.tmpdir(), "legendas-capas", espaco.usuario?.id ?? "local");
      const capa = path.join(pasta, `${request.params.nome}.jpg`);
      const atualizada = async () => {
        try {
          return (await stat(capa)).mtimeMs >= (await stat(video)).mtimeMs;
        } catch {
          return false;
        }
      };
      if (!(await atualizada())) {
        let feita = capasSendoFeitas.get(capa);
        if (!feita) {
          feita = mkdir(pasta, {recursive: true})
            .then(() => tirarCapa(video, capa))
            .finally(() => capasSendoFeitas.delete(capa));
          capasSendoFeitas.set(capa, feita);
        }
        await feita;
      }
      response.setHeader("Cache-Control", "private, max-age=3600");
      response.sendFile(capa);
    } catch (error) {
      response.status(404).send(error instanceof Error ? error.message : String(error));
    }
  });

  // Vídeo do disco para a prévia (os do S3 tocam pela prévia leve, veja /api/previa).
  app.get("/media/:nome", async (request, response) => {
    try {
      response.sendFile(await noDisco(espacoDe(response), request.params.nome));
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

  // Transcrição (Etapa 3, bloco 5), solta do pedido como a exportação (veja
  // tarefas-soltas.ts): GET /api/transcricao diz o andamento ou o resultado; com uma
  // do mesmo vídeo em curso, POST devolve a mesma. O vídeo é lido do S3 pelo
  // endereço assinado (o ffmpeg só extrai o áudio); o que só existe no disco, do disco.
  // Limite diário do plano (cota.ts): conferido antes; só a que terminou é gravada.
  // manterAjustes ("Recomeçar do zero"): as edições somem, mas os ajustes do vídeo
  // (efeitos sonoros e sincronia) continuam. A transcrição antiga só é trocada
  // quando a nova fica pronta: se o whisper falhar, ela continua como estava.
  const transcricoes = tarefasSoltas();
  const filaDeTranscricoes = filaComVagas(LIMITES_DE_USO.transcricoesAoMesmoTempo);

  app.post(
    "/api/transcrever",
    handle(async (request, response) => {
      const espaco = espacoDe(response);
      const {video, pacote, paleta, manterAjustes} = request.body as {
        video: string;
        pacote?: string;
        paleta?: string;
        manterAjustes?: boolean;
      };
      await videos.fonte(espaco, video);
      const chave = chaveDaTarefa(espaco, video);
      const atual = transcricoes.emAndamento(chave);
      if (atual) {
        return atual;
      }
      if (espaco.cota) {
        const decisao = await espaco.cota.podeTranscrever();
        if (!decisao.permitido) {
          response.status(429).json({mensagem: decisao.motivo, codigo: "limite-transcricoes", uso: decisao.uso});
          return undefined;
        }
      }
      // Uma transcrição por conta de cada vez.
      const daConta = transcricoes.daConta(contaDe(espaco));
      if (daConta) {
        response.status(409).json({mensagem: "Você já tem uma transcrição em andamento. Espere ela terminar para começar outra."});
        return undefined;
      }
      return transcricoes.iniciar(
        chave,
        video,
        async (progress) => {
          // Fila geral: com todas as vagas ocupadas, espera a vez ("Na fila, você é o próximo").
          const pedido = Date.now();
          const liberar = await filaDeTranscricoes.entrar((posicao) => progress(textoDaFila(posicao)));
          const esperaNaFila = segundos(pedido);
          const inicio = Date.now();
          let resultado = "falhou";
          try {
          const anterior = await espaco.lerProjeto(video);
          const ajustes = manterAjustes && anterior?.source === video ? anterior : undefined;
          const origem = await videos.entrada(espaco, video);
          console.log(`[${video}] Transcrição: lendo o vídeo ${origem.startsWith("http") ? "do S3" : "do disco"}.`);
          // WhisperX, com a Groq e o Whisper local de reserva; a voz do áudio
          // (Sincronia precisa) é detectada junto (veja src/motor/transcricao.ts).
          const {words, voz, model, motor, avisos} = await transcrever(root, origem, {
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
          // Conta no limite do dia só agora, que terminou. Uma falha ao gravar não
          // desfaz a transcrição (fica no log).
          await espaco.cota?.registrarTranscricao(video, motor, voz.duracaoMs / 1000).catch((erro: unknown) => {
            console.log(`[${video}] Transcrição: não deu para registrar no limite do dia: ${erro instanceof Error ? erro.message : String(erro)}`);
          });
          resultado = motor;
          // A tela mostra qual reserva foi usada, se não foi o WhisperX.
          return {projeto, avisos};
          } catch (erro) {
            resultado = `falhou (${semEnderecos(erro instanceof Error ? erro.message : String(erro)).split("\n")[0].slice(0, 200)})`;
            throw erro;
          } finally {
            liberar();
            registrarEnvio(
              idDoEnvio(contaDe(espaco), video),
              `transcrição: fila ${esperaNaFila}, ${resultado} em ${segundos(inicio)} | fila de transcrições ${filaDeTranscricoes.ocupadas()} rodando, ${filaDeTranscricoes.esperando()} esperando`,
            );
          }
        },
        () => undefined,
      );
    }),
  );

  // Andamento (ou resultado) da última transcrição deste vídeo.
  app.get(
    "/api/transcricao",
    handle((request, response) => transcricoes.ler(chaveDaTarefa(espacoDe(response), String(request.query.video ?? ""))) ?? {estado: "nenhuma"}),
  );

  // Remover vídeo: sai da lista e a transcrição dele é apagada. O enviado ao S3 é
  // apagado (com a prévia leve e a capa); o antigo, do disco, vai para removidos/.
  app.post("/api/remover-video", async (request, response) => {
    try {
      const espaco = espacoDe(response);
      const nome = String((request.body as {nome?: string}).nome ?? "");
      const movidoPara = await videos.remover(espaco, nome);
      const apagouTranscricao = await espaco.apagarProjeto(nome);
      response.json({movidoPara, apagouTranscricao});
    } catch (error) {
      response.status(400).json({mensagem: error instanceof Error ? error.message : String(error)});
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
      const metadados = await getVideoMetadata(await videos.entrada(espaco, video));
      return espaco.cota.decidir(video, metadados.durationInFrames / metadados.fps);
    }),
  );

  // Exportação (render neste computador até o Bloco 6, no Lambda depois), solta do
  // pedido (veja tarefas-soltas.ts): GET /api/exportacao diz o andamento ou o
  // resultado; com uma do mesmo vídeo em curso, POST devolve a mesma (sem outro render).
  const exportacoes = tarefasSoltas();
  const contaDe = (espaco: Espaco) => espaco.usuario?.id ?? "local";
  const chaveDaTarefa = (espaco: Espaco, video: string) => `${contaDe(espaco)}:${video}`;

  // O que vai para o render (local ou no Lambda): estilo, efeitos, sincronia e a
  // decisão do plano, com a duração medida no servidor. entrada: o vídeo (caminho no
  // disco ou endereço assinado do S3).
  const montarExportacao = async (espaco: Espaco, salvo: Projeto, entrada: string): Promise<ExportacaoMontada> => {
    const projeto = await comPacoteCNovo(salvo);
    const style = await loadStyle(root, {pacote: projeto.pacote, paleta: projeto.paleta}, projeto);
    const missing = projeto.blocks.findIndex((block) => !style.templates[block.template]);
    if (missing >= 0) {
      throw new Error(
        `O bloco ${missing + 1} usa o layout '${projeto.blocks[missing].template}', que não existe no pacote ${style.pacote}.`,
      );
    }
    const video = await getVideoMetadata(entrada);
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
    return {
      props: {
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
        entradaLinear: projeto.entradaLinear,
      },
      decisao,
      duracaoS,
      pacote: style.pacote,
      paleta: style.paleta,
    };
  };

  // Render neste computador: o modo local e os vídeos antigos, só no disco.
  const renderizarProjeto = async (espaco: Espaco, projeto: Projeto, progress: (etapa: string, fracao?: number) => void) => {
    const inputPath = await noDisco(espaco, projeto.source);
    const {props, decisao, duracaoS, pacote, paleta} = await montarExportacao(espaco, projeto, inputPath);
    const outputPath = outputPathFor(espaco.pasta, projeto.source, pacote, paleta);
    await renderVideo({root, inputPath, outputPath, ...props}, progress);
    // Só o que terminou desconta: o registro vem depois do render.
    if (decisao) {
      await espaco.cota!.registrar(projeto.source, duracaoS, decisao);
    }
    return {caminho: outputPath, descontoS: decisao?.descontoS};
  };

  app.post(
    "/api/exportar",
    handle(async (request, response) => {
      const espaco = espacoDe(response);
      // O vídeo do projeto a exportar (sem ele, o último editado).
      const {video: pedido} = (request.body ?? {}) as {video?: string};
      const projeto = await espaco.lerProjeto(pedido);
      if (!projeto || (pedido && projeto.source !== pedido)) {
        throw new Error("Não há projeto para exportar.");
      }
      // Vídeo enviado ao S3 (com login): no Lambda. Antigo, só no disco: aqui.
      const fonte = await videos.fonte(espaco, projeto.source);
      if (lambda && espaco.usuario && fonte.onde === "s3") {
        return lambda.exportar(espaco, projeto, fonte.chave, (entrada) => montarExportacao(espaco, projeto, entrada));
      }
      const chave = chaveDaTarefa(espaco, projeto.source);
      const atual = exportacoes.emAndamento(chave);
      if (atual) {
        console.log(`Exportar: ${projeto.source} já está sendo exportado; o pedido acompanha o mesmo render.`);
        return atual;
      }
      // Uma exportação por conta de cada vez.
      if (exportacoes.daConta(contaDe(espaco))) {
        response.status(409).json({mensagem: "Você já tem uma exportação em andamento. Espere ela terminar para começar outra."});
        return undefined;
      }
      if (!reservar("exportação", response)) {
        return undefined;
      }
      return exportacoes.iniciar(
        chave,
        projeto.source,
        (progress) => renderizarProjeto(espaco, projeto, progress),
        () => {
          tarefaAtual = undefined;
        },
      );
    }),
  );

  // Andamento (ou resultado) da última exportação deste vídeo.
  app.get(
    "/api/exportacao",
    handle(async (request, response) => {
      const espaco = espacoDe(response);
      const video = String(request.query.video ?? "");
      const local = exportacoes.ler(chaveDaTarefa(espaco, video));
      // No Lambda (vídeo do S3): a última exportação registrada no Supabase.
      const doLambda = lambda && espaco.usuario && !local ? await lambda.estado(espaco, video) : undefined;
      return local ?? doLambda ?? {estado: "nenhuma"};
    }),
  );

  // "Importar projetos deste computador": no primeiro login, traz para a conta os
  // vídeos da pasta do projeto e o transcricao.json (copiados; o modo local
  // continua com eles). Só pedido na própria máquina (não pelo túnel nem pela
  // rede) e uma vez só: a primeira conta que importa fica registrada.
  const marcaDaImportacao = path.join(root, "usuarios", ".importacao-local.json");
  const importacaoLocal = async (request: Request, espaco: Espaco) => {
    const daMaquina = listarVideos(root);
    const projeto = readProject(root);
    const projetoValido = projeto && daMaquina.includes(projeto.source) ? projeto : undefined;
    const disponivel =
      Boolean(contas && espaco.usuario) &&
      !publico &&
      pedidoLocal(request) &&
      !existsSync(marcaDaImportacao) &&
      daMaquina.length > 0 &&
      (await videos.listar(espaco)).length === 0 &&
      (await espaco.projetos()).length === 0;
    return {disponivel, videos: daMaquina, projeto: projetoValido};
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
    // Cache: a página, o service worker e o manifesto sempre conferidos com o servidor
    // (uma versão nova do app chega sozinha); os arquivos da tela têm o hash no nome
    // (assets/), então podem ficar guardados por um ano.
    const SEM_CACHE = "no-cache";
    app.use(
      express.static(dist, {
        setHeaders: (response, caminho) => {
          const relativo = path.relative(dist, caminho).replaceAll("\\", "/");
          response.setHeader(
            "Cache-Control",
            relativo.startsWith("assets/") ? "public, max-age=31536000, immutable" : relativo.startsWith("icones/") ? "public, max-age=86400" : SEM_CACHE,
          );
        },
      }),
    );
    app.get("*", (_request, response) => {
      response.setHeader("Cache-Control", SEM_CACHE);
      response.sendFile(path.join(dist, "index.html"));
    });
  }

  // Último recurso: erro que escapou de uma rota vira resposta 500 e uma linha no log
  // (sem o corpo do pedido), em vez de derrubar o pedido sem resposta.
  app.use((erro: unknown, request: Request, response: Response, next: NextFunction) => {
    console.error(`Erro em ${request.method} ${request.path}: ${erro instanceof Error ? erro.message : String(erro)}`);
    if (response.headersSent) {
      next(erro);
      return;
    }
    response.status(500).json({mensagem: "Algo deu errado no servidor. Tente de novo."});
  });

  return new Promise((resolve) => {
    const server = app.listen(porta, rede || publico ? "0.0.0.0" : "127.0.0.1", () => resolve(server));
  });
};


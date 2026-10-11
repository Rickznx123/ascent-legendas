// Entrada do plugin do Premiere (ramo plugin-premiere). O painel usa o mesmo caminho do app:
//   1. login no Supabase (o endereço e a chave pública vêm de GET /api/config);
//   2. envio do áudio da sequência pelo envio em partes ao S3 (envio.ts, que aceita os áudios abaixo);
//   3. POST /api/transcrever com origem "plugin" (mesma fila, mesmo WhisperX, estilo padrão do app);
//   4. GET /api/transcricao para o andamento (mesmas mensagens de fila do app); pronta, já traz os blocos;
//   5. GET /api/plugin/blocos para ler de novo os blocos de um áudio já transcrito.
// Contrato completo: ascent-legendas-premiere/API-PLUGIN.md.
// Os projetos do plugin ficam marcados com dados.origem = "plugin" (sem coluna nova): não aparecem
// na lista do app e dá para contar o uso (select count(*) from projetos where dados->>'origem' = 'plugin').
import express from "express";
import type {Request, Response} from "express";
import {findKeywordIndex} from "../../src/captions";
import {blocosNaTela, precisaoDoProjeto, sincroniaDoProjeto} from "../../src/entrada";
import {assignForStyle, markShortBlocks, novaSemente} from "../../src/motor/blocos";
import {loadStyle} from "../../src/motor/projeto";
import type {Projeto} from "../../src/motor/projeto";
import type {Plano} from "./contas";
import {LIMITES} from "./cota";
import type {Espaco} from "./espaco";

export const ORIGEM_DO_PLUGIN = "plugin";

// Áudio curto da sequência do Premiere (só para transcrever; não aparece na lista de vídeos do app).
export const EXTENSAO_DE_AUDIO = /\.(wav|m4a|mp3|aac)$/iu;

// Regras do plano para o plugin: o ÚNICO lugar onde elas são decididas.
//   - envio do áudio: o mesmo tamanho e duração por arquivo que o plano já permite para vídeos;
//   - transcrição: o mesmo limite diário de transcrições do plano (cota.ts), que conta as do plugin também;
//   - exportação: o plugin não renderiza (quem monta o vídeo é o Premiere), então não desconta minutos.
export const REGRAS_DO_PLUGIN = {
  envio: (plano: Plano): {bytes: number; segundos: number} => LIMITES.envio[plano],
  podeTranscrever: async (espaco: Espaco): Promise<{permitido: boolean; motivo?: string; uso?: unknown}> =>
    espaco.cota ? espaco.cota.podeTranscrever() : {permitido: true},
};

export type BlocoDoPlugin = {
  inicio: number;
  fim: number;
  tipo: "destaque" | "linear";
  palavras: {texto: string; inicio: number}[];
  // Posição da palavra-chave (a partir de 0), só nos blocos de destaque.
  chave?: number;
};

// Blocos como o painel do Premiere usa: o mesmo caminho do render (nuvem/props.ts) com o estilo e a semente
// do projeto (ritmo e layouts do app), depois os tempos de tela (sincronia e antecipação da entrada).
export const blocosParaOPlugin = async (root: string, projeto: Projeto): Promise<{blocos: BlocoDoPlugin[]}> => {
  const estilo = await loadStyle(root, {}, projeto);
  const blocos = markShortBlocks(
    assignForStyle(projeto.blocks ?? [], estilo, {semente: projeto.semente ?? novaSemente(), preserveAssignments: projeto.pacote === estilo.pacote}),
  );
  const naTela = blocosNaTela(blocos, estilo.templates, sincroniaDoProjeto(projeto.sincroniaMs, projeto.sincroniaPrecisa), precisaoDoProjeto(projeto));
  const s = (ms: number) => Math.round(ms) / 1000;
  return {
    blocos: naTela.map((b) => ({
      inicio: s(b.startMs),
      fim: s(b.endMs),
      tipo: b.family === "destaque" ? "destaque" : "linear",
      palavras: b.words.map((w) => ({texto: w.text, inicio: s(w.startMs)})),
      ...(b.family === "destaque" ? {chave: findKeywordIndex(b.words, b.keyword)} : {}),
    })),
  };
};

// GET /api/plugin/blocos?audio=<nome>: os blocos de um áudio já transcrito pelo plugin (por exemplo, depois
// de um reinício do servidor, quando o andamento guardado na memória já não existe).
export const rotasDoPlugin = ({root, espacoDe}: {root: string; espacoDe: (response: Response) => Espaco}): express.Router => {
  const rotas = express.Router();
  rotas.get("/blocos", async (request: Request, response: Response) => {
    try {
      const audio = String(request.query.audio ?? "");
      const projeto = audio ? await espacoDe(response).lerProjeto(audio) : undefined;
      if (!projeto || projeto.source !== audio || projeto.origem !== ORIGEM_DO_PLUGIN) {
        response.status(404).json({mensagem: "Este áudio ainda não foi transcrito pelo plugin."});
        return;
      }
      response.json(await blocosParaOPlugin(root, projeto));
    } catch (erro) {
      response.status(400).json({mensagem: erro instanceof Error ? erro.message : String(erro)});
    }
  });
  return rotas;
};

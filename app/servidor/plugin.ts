// Entrada do plugin do Premiere (ramo plugin-premiere). O painel usa o mesmo caminho do app:
//   1. login no Supabase (o endereço e a chave pública vêm de GET /api/config);
//   2. envio do áudio da sequência pelo envio em partes ao S3 (envio.ts, que aceita os áudios abaixo);
//   3. POST /api/transcrever com origem "plugin" (mesma fila, mesmo WhisperX, estilo padrão do app);
//   4. GET /api/transcricao para o andamento (mesmas mensagens de fila do app); pronta, já traz os blocos;
//   5. GET /api/plugin/blocos para ler de novo os blocos de um áudio já transcrito.
// Contrato completo: ascent-legendas-premiere/API-PLUGIN.md.
// Os projetos do plugin ficam marcados com dados.origem = "plugin" (sem coluna nova): não aparecem
// na lista do app e dá para contar o uso (select count(*) from projetos where dados->>'origem' = 'plugin').
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

// Log curto por envio: duração de cada etapa, filas e memória. Sem dados pessoais:
// o envio aparece por um código (resumo da conta e do nome do vídeo), nunca pelo
// nome do arquivo, e-mail ou chave.
import {createHash} from "node:crypto";

export const idDoEnvio = (conta: string, nome: string): string =>
  createHash("sha256").update(`${conta}/${nome}`).digest("hex").slice(0, 8);

// Memória do processo Node agora (o ffmpeg é outro processo: veja medir-carga.ts).
export const memoriaMB = (): number => Math.round(process.memoryUsage().rss / 1024 / 1024);

export const segundos = (desdeMs: number): string => `${((Date.now() - desdeMs) / 1000).toFixed(1)} s`;

export const registrarEnvio = (id: string, texto: string) => console.log(`[envio ${id}] ${texto} | memória ${memoriaMB()} MB`);

// Erros do ffmpeg trazem a linha de comando, com o endereço assinado do S3 (que dá
// acesso ao vídeo): fora do log.
export const semEnderecos = (texto: string): string => texto.replace(/https?:\/\/\S+/gu, "<endereço>");

// Áudio para a medição (a detecção de voz é a mesma da Sincronia precisa, em
// src/motor/voz.ts) e o WAV da página de conferência.
import {TAXA} from "../src/motor/voz";

export * from "../src/motor/voz";

// WAV mono 16 bits (para tocar na página de conferência).
export const wav = (audio: Float32Array): Buffer => {
  const dados = Buffer.alloc(audio.length * 2);
  audio.forEach((amostra, i) => dados.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(amostra * 32767))), i * 2));
  const cabecalho = Buffer.alloc(44);
  cabecalho.write("RIFF", 0);
  cabecalho.writeUInt32LE(36 + dados.length, 4);
  cabecalho.write("WAVE", 8);
  cabecalho.write("fmt ", 12);
  cabecalho.writeUInt32LE(16, 16);
  cabecalho.writeUInt16LE(1, 20);
  cabecalho.writeUInt16LE(1, 22);
  cabecalho.writeUInt32LE(TAXA, 24);
  cabecalho.writeUInt32LE(TAXA * 2, 28);
  cabecalho.writeUInt16LE(2, 32);
  cabecalho.writeUInt16LE(16, 34);
  cabecalho.write("data", 36);
  cabecalho.writeUInt32LE(dados.length, 40);
  return Buffer.concat([cabecalho, dados]);
};

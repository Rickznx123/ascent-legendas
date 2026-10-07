// npx tsx scripts/gerar-icones.ts
// Ícones provisórios do app instalado (PWA), gerados a partir da marca: o quadrado
// roxo arredondado (o .marca i da tela) sobre o fundo escuro do tema. Saem em
// app/web/public/icones/ (o Vite copia para a tela montada). PNG feito aqui mesmo,
// sem dependências: cada pixel com 4 x 4 amostras, para a borda sair lisa.
// Trocar pelo ícone definitivo: substituir os PNGs (mesmos nomes e tamanhos).
import {mkdirSync, writeFileSync} from "node:fs";
import path from "node:path";
import {deflateSync} from "node:zlib";

// As cores do tema (app/web/tema.css): --fundo e --acento.
const FUNDO = [0x0e, 0x0e, 0x11];
const ACENTO = [0x7c, 0x5c, 0xff];

// lado: tamanho do quadrado roxo em fração do ícone; raio: em fração do quadrado.
const desenhar = (tamanho: number, lado: number, raio = 0.27): Buffer => {
  const meio = tamanho / 2;
  const metade = (lado * tamanho) / 2;
  const r = raio * lado * tamanho;
  const dentro = (x: number, y: number) => {
    const dx = Math.max(Math.abs(x - meio) - (metade - r), 0);
    const dy = Math.max(Math.abs(y - meio) - (metade - r), 0);
    return Math.abs(x - meio) <= metade && Math.abs(y - meio) <= metade && dx * dx + dy * dy <= r * r;
  };
  const AMOSTRAS = 4;
  const linhas: Buffer[] = [];
  for (let y = 0; y < tamanho; y++) {
    const linha = Buffer.alloc(1 + tamanho * 3);
    for (let x = 0; x < tamanho; x++) {
      let cobertura = 0;
      for (let sy = 0; sy < AMOSTRAS; sy++) {
        for (let sx = 0; sx < AMOSTRAS; sx++) {
          if (dentro(x + (sx + 0.5) / AMOSTRAS, y + (sy + 0.5) / AMOSTRAS)) cobertura++;
        }
      }
      const a = cobertura / (AMOSTRAS * AMOSTRAS);
      for (let c = 0; c < 3; c++) linha[1 + x * 3 + c] = Math.round(FUNDO[c] * (1 - a) + ACENTO[c] * a);
    }
    linhas.push(linha);
  }
  return png(tamanho, Buffer.concat(linhas));
};

// PNG RGB de 8 bits (sem transparência: o iPhone pinta de preto o fundo transparente).
const crc32 = (dados: Buffer): number => {
  let crc = ~0;
  for (const byte of dados) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ~crc >>> 0;
};
const pedaco = (tipo: string, dados: Buffer): Buffer => {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, "ascii"), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tamanho, corpo, crc]);
};
const png = (tamanho: number, pixels: Buffer): Buffer => {
  const cabecalho = Buffer.alloc(13);
  cabecalho.writeUInt32BE(tamanho, 0);
  cabecalho.writeUInt32BE(tamanho, 4);
  cabecalho[8] = 8; // bits por canal
  cabecalho[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco("IHDR", cabecalho),
    pedaco("IDAT", deflateSync(pixels, {level: 9})),
    pedaco("IEND", Buffer.alloc(0)),
  ]);
};

const pasta = path.join(import.meta.dirname, "..", "app", "web", "public", "icones");
mkdirSync(pasta, {recursive: true});
const icones: [string, number, number][] = [
  // Ícones comuns: o quadrado ocupa metade do ícone (como a marca na tela).
  ["icone-192.png", 192, 0.5],
  ["icone-512.png", 512, 0.5],
  // Maskable (Android recorta em círculo ou quadrado): o quadrado fica dentro da
  // área segura (o círculo central de 80%).
  ["icone-maskable-512.png", 512, 0.46],
  // iPhone (Tela de Início): 180 x 180, o iOS arredonda os cantos sozinho.
  ["apple-touch-icon-180.png", 180, 0.5],
  ["favicon-32.png", 32, 0.62],
];
for (const [nome, tamanho, lado] of icones) {
  writeFileSync(path.join(pasta, nome), desenhar(tamanho, lado));
  console.log(`${nome} (${tamanho} x ${tamanho})`);
}

// Configuração do servidor, lida das variáveis de ambiente (no computador, do .env;
// no Render, do painel). É o único lugar com o endereço público do app.
//
//   SERVIDOR_PUBLICO=1  modo de servidor na internet (Render): exige login, ouve em
//                       0.0.0.0, sem "abrir pasta", sem importar projetos deste
//                       computador e sem o Whisper local.
//   PORT                porta (o Render define); sem ela, PORTA ou 5174.
//   ENDERECO_DO_APP     endereço público do app, sem barra no fim (provisório:
//                       o do Render, ex.: https://ascent-legendas.onrender.com).
//                       Trocar aqui quando houver domínio próprio (e rodar de novo
//                       npx tsx nuvem/criar-bucket.ts, que libera o endereço no S3).
//   BUCKET_DOS_VIDEOS   bucket S3 dos vídeos (privado). Padrão: o da conta.
//   REMOTION_AWS_REGION região da AWS (a do Lambda e do bucket). Padrão: us-east-2.

export type Configuracao = {
  publico: boolean;
  porta: number;
  enderecoDoApp: string;
  bucketDosVideos: string;
  regiaoAws: string;
};

// Prefixos no bucket, um por tipo (as regras de expiração do S3 são por prefixo):
// <prefixo><id do usuário>/<arquivo>. Dias até o S3 apagar sozinho.
export const PASTAS_NO_BUCKET = {
  videos: {prefixo: "videos/", dias: 30},
  previas: {prefixo: "previas/", dias: 30},
  exportados: {prefixo: "exportados/", dias: 7},
} as const;
// Envios em partes abandonados no meio: apagados depois de tantos dias.
export const DIAS_PARA_ENVIO_ABANDONADO = 2;

// Região da AWS: única fonte, usada pelo servidor e pelos scripts de nuvem/.
export const REGIAO_AWS_PADRAO = "us-east-2";
export const regiaoAwsDoAmbiente = (): string => process.env.REMOTION_AWS_REGION?.trim() || REGIAO_AWS_PADRAO;

export const configuracaoDoAmbiente = (): Configuracao => {
  const publico = process.env.SERVIDOR_PUBLICO?.trim() === "1";
  const porta = Number(process.env.PORT ?? process.env.PORTA ?? 5174);
  const enderecoDoApp = (process.env.ENDERECO_DO_APP?.trim() || `http://localhost:${porta}`).replace(/\/+$/u, "");
  const bucketDosVideos = process.env.BUCKET_DOS_VIDEOS?.trim() || "ascent-legendas-videos-275060989338";
  const regiaoAws = regiaoAwsDoAmbiente();
  return {publico, porta, enderecoDoApp, bucketDosVideos, regiaoAws};
};

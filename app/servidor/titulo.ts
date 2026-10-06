// Título de um vídeo na tela: o nome do arquivo sem a extensão. O iPhone, ao
// escolher um vídeo da galeria no navegador, entrega o arquivo com um código no
// lugar do nome ("33ed3a7e-0c2e-....mp4", às vezes "trim.<código>.MOV"): esses viram
// "Vídeo de DD/MM, HH:MM" (horário de Brasília), com a hora do envio.
import path from "node:path";

const CODIGO = /^(trim\.)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export const tituloDoVideo = (nome: string, quando: Date): string => {
  const semExtensao = path.parse(nome).name;
  if (!CODIGO.test(semExtensao)) {
    return semExtensao;
  }
  const data = quando.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  });
  return `Vídeo de ${data}`;
};

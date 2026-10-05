// Lê o .env da pasta do projeto (chaves do Replicate e da Groq, TRANSCRICAO=local).
// Nunca imprime valores. Variáveis já definidas no ambiente têm prioridade.
import {existsSync} from "node:fs";
import path from "node:path";

export const carregarEnv = (pasta: string): void => {
  const arquivo = path.join(pasta, ".env");
  if (existsSync(arquivo)) {
    process.loadEnvFile(arquivo);
  }
};

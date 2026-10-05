// Lê o .env da raiz do projeto para os scripts de nuvem/. Nunca imprime valores:
// só diz quais variáveis faltam.
import {existsSync} from "node:fs";
import path from "node:path";
import type {AwsRegion} from "@remotion/lambda";

export const RAIZ = path.resolve(import.meta.dirname, "..");

const arquivo = path.join(RAIZ, ".env");
if (existsSync(arquivo)) {
  process.loadEnvFile(arquivo);
}

export const exigir = (...nomes: string[]): void => {
  const faltando = nomes.filter((nome) => !process.env[nome]?.trim());
  if (faltando.length > 0) {
    throw new Error(`Faltam no .env: ${faltando.join(", ")} (veja .env.example).`);
  }
};

export const REGIAO = (process.env.REMOTION_AWS_REGION?.trim() || "us-east-1") as AwsRegion;

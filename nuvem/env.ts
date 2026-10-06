// Lê o .env da raiz do projeto para os scripts de nuvem/. Nunca imprime valores:
// só diz quais variáveis faltam.
import {existsSync} from "node:fs";
import path from "node:path";
import type {AwsRegion} from "@remotion/lambda";
import {regiaoAwsDoAmbiente} from "../app/servidor/configuracao";

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

// Lida depois do .env, da mesma fonte do servidor (padrão us-east-2).
export const REGIAO = regiaoAwsDoAmbiente() as AwsRegion;

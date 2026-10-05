import {exec} from "node:child_process";
import os from "node:os";
import {iniciarServidor} from "./servidor";

// npm run app — sobe a interface local e abre no navegador.
// npm run app:rede — o mesmo, aceitando também aparelhos da mesma rede Wi-Fi.
const porta = Number(process.env.PORTA ?? 5174);
const modo = process.argv.includes("--producao") ? "producao" : "dev";
const rede = process.argv.includes("--rede");

// Endereços IPv4 desta máquina na rede local (para abrir no celular).
const enderecosNaRede = (): string[] =>
  Object.values(os.networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((info) => info.family === "IPv4" && !info.internal)
    .map((info) => `http://${info.address}:${porta}`);

iniciarServidor({porta, pastaProjeto: process.cwd(), modo, rede})
  .then(() => {
    const url = `http://localhost:${porta}`;
    console.log(`Interface aberta em ${url}`);
    if (rede) {
      const enderecos = enderecosNaRede();
      console.log(
        enderecos.length > 0
          ? `No celular (mesma rede Wi-Fi), abra:\n${enderecos.map((endereco) => `  ${endereco}`).join("\n")}`
          : "Nenhuma rede encontrada: conecte o computador ao Wi-Fi.",
      );
      console.log(
        "Atenção: qualquer aparelho desta rede pode abrir o app e mexer nos vídeos. Use só em rede de confiança.\n" +
          "Se o celular não abrir, libere o Node.js no Firewall do Windows (rede privada).",
      );
    }
    if (process.env.NAO_ABRIR) {
      return;
    }
    const abrir =
      process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open ${url}` : `xdg-open ${url}`;
    exec(abrir);
  })
  .catch((error: unknown) => {
    console.error(`Erro: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });

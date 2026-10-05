// npx tsx nuvem/medir-velocidade.ts [--memoria 2048]
// Dois renders no Lambda com mais pedaços (60 e 120 quadros por Lambda) e um
// resumo de custo e tempo de cada um, ao lado do render de 576 quadros mais
// recente. Precisa de um limite de execuções simultâneas bem acima de 10 (com 60
// quadros, este vídeo usa ~30 Lambdas ao mesmo tempo). Os resultados também vão
// para nuvem/resultados/renders.json.
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import path from "node:path";
import {ServiceQuotasClient, GetServiceQuotaCommand} from "@aws-sdk/client-service-quotas";
import {RAIZ, REGIAO, exigir} from "./env";

exigir("REMOTION_AWS_ACCESS_KEY_ID", "REMOTION_AWS_SECRET_ACCESS_KEY");

const indice = process.argv.indexOf("--memoria");
const memoria = indice > 0 ? process.argv[indice + 1] : "2048";
const QUADROS = [60, 120];

const {Quota} = await new ServiceQuotasClient({
  region: REGIAO,
  credentials: {
    accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID!.trim(),
    secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY!.trim(),
  },
}).send(new GetServiceQuotaCommand({ServiceCode: "lambda", QuotaCode: "L-B99A9384"}));
console.log(`Limite de execuções simultâneas em ${REGIAO}: ${Quota?.Value}`);
if ((Quota?.Value ?? 0) < 50) {
  throw new Error("Limite baixo demais para estes renders (precisa de uns 35). Peça o aumento antes.");
}

type Registro = {
  rotulo: string;
  memoriaMb: number;
  quadrosPorLambda: number;
  pedacos: number;
  duracaoVideoS: number;
  custoUsd: number;
  tempoTotalS: number | null;
  tempoRemotionS: number;
};
const lerRegistros = (): Registro[] =>
  JSON.parse(readFileSync(path.join(RAIZ, "nuvem", "resultados", "renders.json"), "utf8")) as Registro[];

const feitos: Registro[] = [];
for (const quadros of QUADROS) {
  execFileSync(
    process.execPath,
    [
      path.join(RAIZ, "node_modules", "tsx", "dist", "cli.mjs"),
      path.join(RAIZ, "nuvem", "renderizar.ts"),
      "--rotulo",
      `velocidade-${memoria}mb-${quadros}q`,
      "--memoria",
      memoria,
      "--quadros",
      String(quadros),
    ],
    {stdio: "inherit", cwd: RAIZ},
  );
  feitos.push(lerRegistros().at(-1)!);
}

const referencia = lerRegistros()
  .filter((r) => r.quadrosPorLambda === 576 && r.memoriaMb === Number(memoria))
  .at(-1);
console.log("\nquadros/Lambda  pedaços  custo (US$)  tempo total  custo por minuto de vídeo");
for (const r of [...(referencia ? [referencia] : []), ...feitos]) {
  const tempo = r.tempoTotalS ?? r.tempoRemotionS;
  console.log(
    `${String(r.quadrosPorLambda).padStart(14)}  ${String(r.pedacos).padStart(7)}  ${r.custoUsd.toFixed(4).padStart(11)}  ${`${tempo.toFixed(0)} s`.padStart(11)}  ${(r.custoUsd / (r.duracaoVideoS / 60)).toFixed(4).padStart(10)}`,
  );
}

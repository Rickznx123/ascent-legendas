// npx tsx nuvem/verificar-permissoes.ts
// Confere, sem criar nada na AWS, se o usuário do .env tem todas as permissões
// que o Remotion Lambda pede (é a mesma verificação de "remotion lambda policies validate").
// A simulação não informa a região, então uma SCP que só libera algumas regiões
// aparece como "FALTA" mesmo quando a região do .env funciona. Por isso a palavra
// final é de uma chamada real de leitura (listar funções Lambda) na região do .env.
import {getFunctions, simulatePermissions} from "@remotion/lambda";
import {REGIAO, exigir} from "./env";

exigir("REMOTION_AWS_ACCESS_KEY_ID", "REMOTION_AWS_SECRET_ACCESS_KEY");

const {results} = await simulatePermissions({region: REGIAO});
const negadas = results.filter((resultado) => resultado.decision !== "allowed");
for (const resultado of results) {
  console.log(`${resultado.decision === "allowed" ? "OK  " : "FALTA"} ${resultado.name}`);
}
console.log(
  negadas.length === 0
    ? `\nSimulação: ${results.length} permissões liberadas.`
    : `\nSimulação: ${negadas.length} de ${results.length} permissões negadas (pode ser SCP de região).`,
);

try {
  await getFunctions({region: REGIAO, compatibleOnly: false});
  console.log(`Chamada real em ${REGIAO}: liberada.`);
} catch (erro) {
  console.log(`Chamada real em ${REGIAO}: negada.\n${(erro as Error).message}`);
  process.exitCode = 1;
}

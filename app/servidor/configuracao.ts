// Configuração do servidor, lida das variáveis de ambiente (no computador, do .env;
// no Render, do painel). É o único lugar com o endereço público do app.
//
//   SERVIDOR_PUBLICO=1  modo de servidor na internet (Render): exige login, ouve em
//                       0.0.0.0, sem "abrir pasta", sem importar projetos deste
//                       computador e sem o Whisper local.
//   PORT                porta (o Render define); sem ela, PORTA ou 5174.
//   ENDERECO_DO_APP     endereço público do app, sem barra no fim (provisório:
//                       o do Render, ex.: https://ascent-legendas.onrender.com).
//                       Trocar aqui quando houver domínio próprio.

export type Configuracao = {
  publico: boolean;
  porta: number;
  enderecoDoApp: string;
};

export const configuracaoDoAmbiente = (): Configuracao => {
  const publico = process.env.SERVIDOR_PUBLICO?.trim() === "1";
  const porta = Number(process.env.PORT ?? process.env.PORTA ?? 5174);
  const enderecoDoApp = (process.env.ENDERECO_DO_APP?.trim() || `http://localhost:${porta}`).replace(/\/+$/u, "");
  return {publico, porta, enderecoDoApp};
};

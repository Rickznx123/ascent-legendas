// Estado da prévia leve de um vídeo (Etapa 3, bloco 4), para o editor e as capas do
// Início. Enquanto prepara, pergunta de novo a cada 3 s; pronta, renova os
// endereços assinados a cada 50 min (eles valem ao menos 2 h).
import {useCallback, useEffect, useState} from "react";
import {api} from "./api";
import type {EstadoDaPrevia} from "./api";

const PERGUNTAR_DE_NOVO_MS = 3000;
const RENOVAR_MS = 50 * 60 * 1000;

// ativo: falso enquanto não precisa (ex.: cartão fora da tela).
export const usePreviaLeve = (nome: string | undefined, ativo = true) => {
  const [estado, setEstado] = useState<EstadoDaPrevia>();
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    setEstado(undefined);
    if (!nome || !ativo) {
      return;
    }
    let cancelado = false;
    let timer: number | undefined;
    const perguntar = (tentarDeNovo: boolean) =>
      api
        .previa(nome, tentarDeNovo)
        .catch((erro: unknown): EstadoDaPrevia => ({estado: "falhou", mensagem: erro instanceof Error ? erro.message : String(erro)}))
        .then((novo) => {
          if (cancelado) {
            return;
          }
          // Mesmo endereço (assinado na mesma hora): nada muda na tela.
          setEstado((atual) => (JSON.stringify(atual) === JSON.stringify(novo) ? atual : novo));
          if (novo.estado === "preparando") {
            timer = window.setTimeout(() => perguntar(false), PERGUNTAR_DE_NOVO_MS);
          } else if (novo.estado === "pronta") {
            timer = window.setTimeout(() => perguntar(false), RENOVAR_MS);
          }
        });
    void perguntar(tentativa > 0);
    return () => {
      cancelado = true;
      window.clearTimeout(timer);
    };
  }, [nome, ativo, tentativa]);

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), []);
  return {estado, tentarDeNovo};
};

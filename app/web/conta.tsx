// Conta logada para os menus e o plano (e-mail, plano, uso, Sair). Sem login:
// conta null.
import {createContext, useContext} from "react";
import type {Conta} from "./api";

export type ContextoDaConta = {
  conta: Conta | null;
  sair: () => void;
  // Relê a conta (o uso do plano muda depois de exportar).
  atualizarConta: () => void;
};

export const ContaContexto = createContext<ContextoDaConta>({conta: null, sair: () => undefined, atualizarConta: () => undefined});

export const useConta = (): ContextoDaConta => useContext(ContaContexto);

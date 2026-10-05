// Conta logada para os menus (e-mail, plano, Sair). Sem login: conta null.
import {createContext, useContext} from "react";
import type {Conta} from "./api";

export type ContextoDaConta = {
  conta: Conta | null;
  sair: () => void;
};

export const ContaContexto = createContext<ContextoDaConta>({conta: null, sair: () => undefined});

export const useConta = (): ContextoDaConta => useContext(ContaContexto);

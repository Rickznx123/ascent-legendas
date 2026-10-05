// Abas dos painéis laterais. O conteúdo da aba atual fica no painel logo abaixo.
export type Aba<T extends string> = {valor: T; nome: string};

export const Abas = <T extends string>({
  id,
  rotulo,
  abas,
  atual,
  onTrocar,
}: {
  id: string;
  rotulo: string;
  abas: Aba<T>[];
  atual: T;
  onTrocar: (aba: T) => void;
}) => (
  <div className="abas" role="tablist" aria-label={rotulo}>
    {abas.map(({valor, nome}) => (
      <button
        key={valor}
        type="button"
        role="tab"
        id={`${id}-aba-${valor}`}
        aria-selected={atual === valor}
        aria-controls={`${id}-painel`}
        className="aba"
        onClick={() => onTrocar(valor)}
      >
        {nome}
      </button>
    ))}
  </div>
);

export const PainelDaAba = <T extends string>({
  id,
  atual,
  children,
}: {
  id: string;
  atual: T;
  children: React.ReactNode;
}) => (
  <div className="conteudo" role="tabpanel" id={`${id}-painel`} aria-labelledby={`${id}-aba-${atual}`}>
    {children}
  </div>
);

// Guarda a aba escolhida neste navegador (sem armazenamento, só não é lembrada).
export const abaGuardada = <T extends string>(chave: string, opcoes: readonly T[], padrao: T): T => {
  try {
    const salva = localStorage.getItem(chave);
    return opcoes.find((opcao) => opcao === salva) ?? padrao;
  } catch {
    return padrao;
  }
};

export const guardarAba = (chave: string, valor: string) => {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // Sem armazenamento no navegador: a aba só não é lembrada.
  }
};

import {useEffect} from "react";

export type Aviso = {id: number; texto: string};

// Quanto tempo um aviso fica na tela.
const DURACAO_DO_AVISO_MS = 6000;

const AvisoQueSome: React.FC<{aviso: Aviso; onFechar: (id: number) => void}> = ({aviso, onFechar}) => {
  useEffect(() => {
    const timer = window.setTimeout(() => onFechar(aviso.id), DURACAO_DO_AVISO_MS);
    return () => window.clearTimeout(timer);
  }, [aviso.id, onFechar]);
  return (
    <div className="mensagem">
      <span>{aviso.texto}</span>
      <button type="button" className="ic ic-p" aria-label="Fechar aviso" onClick={() => onFechar(aviso.id)}>
        ✕
      </button>
    </div>
  );
};

// Avisos somem sozinhos; um erro fica até ser fechado.
export const Avisos: React.FC<{
  avisos: Aviso[];
  erro?: string;
  onFecharAviso: (id: number) => void;
  onFecharErro: () => void;
}> = ({avisos, erro, onFecharAviso, onFecharErro}) => (
  <div className="mensagens" aria-live="polite">
    {erro ? (
      <div className="mensagem mensagem-erro" role="alert">
        <span>{erro}</span>
        <button type="button" className="ic ic-p" aria-label="Fechar erro" onClick={onFecharErro}>
          ✕
        </button>
      </div>
    ) : null}
    {avisos.map((aviso) => (
      <AvisoQueSome key={aviso.id} aviso={aviso} onFechar={onFecharAviso} />
    ))}
  </div>
);

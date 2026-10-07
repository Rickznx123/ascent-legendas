// Conta no topo do computador: e-mail, plano, Trocar senha e Sair (o equivalente ao menu ☰ do
// celular). Sem login (modo local), não aparece.
import {useEffect, useRef, useState} from "react";
import {nomeDoPlano, resumoDasTranscricoes, resumoDoUso} from "./celular/plano";
import {useConta} from "./conta";
import {JanelaTrocarSenha} from "./Senha";
import {JanelaDaAcao, ROTULO_DA_ACAO, acaoDaAssinatura, avisoDaAssinatura} from "./Assinatura";
import type {AcaoDaAssinatura} from "./Assinatura";

export const MenuDaConta: React.FC<{ocupado: boolean}> = ({ocupado}) => {
  const {conta, sair} = useConta();
  const [aberto, setAberto] = useState(false);
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [janelaDaAssinatura, setJanelaDaAssinatura] = useState<AcaoDaAssinatura>();
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) {
      return;
    }
    const aoClicar = (event: PointerEvent) => {
      if (event.target instanceof Node && !raiz.current?.contains(event.target)) {
        setAberto(false);
      }
    };
    const aoTeclar = (event: KeyboardEvent) => event.key === "Escape" && setAberto(false);
    document.addEventListener("pointerdown", aoClicar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("pointerdown", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);
  if (!conta) {
    return null;
  }
  return (
    <div ref={raiz} className="conta-raiz">
      <button
        type="button"
        className="bt"
        aria-haspopup="menu"
        aria-expanded={aberto}
        title={conta.email}
        onClick={() => setAberto(!aberto)}
      >
        Conta
      </button>
      {aberto ? (
        <div className="conta-menu" role="menu">
          <div>
            <div className="suave pequeno">Conta e plano</div>
            <div className="conta-email">
              <b>{conta.email}</b>
            </div>
            <div className="suave">Plano {nomeDoPlano(conta)}</div>
            {conta.uso ? (
              <div className="conta-uso">
                <div>{resumoDoUso(conta.uso).titulo}</div>
                <div className="suave pequeno">{resumoDoUso(conta.uso).detalhe}</div>
                {resumoDasTranscricoes(conta.uso) ? <div className="suave pequeno">{resumoDasTranscricoes(conta.uso)}</div> : null}
                {avisoDaAssinatura(conta.assinatura) ? (
                  <div className={`pequeno ${conta.assinatura?.situacao === "falhou" ? "assinatura-aviso" : "suave"}`}>{avisoDaAssinatura(conta.assinatura)}</div>
                ) : null}
                <div className="cel-medidor">
                  <i style={{width: `${Math.min(100, resumoDoUso(conta.uso).fracao * 100)}%`}} />
                </div>
              </div>
            ) : null}
          </div>
          {acaoDaAssinatura(conta.assinatura) ? (
            <button
              type="button"
              role="menuitem"
              className={`bt ${acaoDaAssinatura(conta.assinatura) === "assinar" ? "primario" : ""}`}
              onClick={() => {
                setAberto(false);
                setJanelaDaAssinatura(acaoDaAssinatura(conta.assinatura));
              }}
            >
              {ROTULO_DA_ACAO[acaoDaAssinatura(conta.assinatura)!]}
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="bt"
            onClick={() => {
              setAberto(false);
              setTrocandoSenha(true);
            }}
          >
            Trocar senha
          </button>
          <button
            type="button"
            role="menuitem"
            className="bt"
            disabled={ocupado}
            onClick={() => {
              setAberto(false);
              sair();
            }}
          >
            Sair
          </button>
        </div>
      ) : null}
      {trocandoSenha ? <JanelaTrocarSenha email={conta.email} onFechar={() => setTrocandoSenha(false)} /> : null}
      <JanelaDaAcao acao={janelaDaAssinatura} onFechar={() => setJanelaDaAssinatura(undefined)} />
    </div>
  );
};

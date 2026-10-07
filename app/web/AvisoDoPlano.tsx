// Antes de exportar (com login): o que a exportação vai descontar, quanto sobra e
// se sai com marca d'água; se o plano não deixa, a tela "Assine para continuar".
// Só mostra a decisão do servidor (app/servidor/cota.ts); a exportação decide de
// novo lá.
import {useState} from "react";
import {JanelaAssinar} from "./Assinatura";
import type {DecisaoDeExportacao} from "./api";
import {avisoDaExportacao} from "./celular/plano";
import {useConta} from "./conta";

export const AvisoDoPlano: React.FC<{
  decisao: DecisaoDeExportacao;
  ocupado: boolean;
  onExportar: () => void;
  onVoltar: () => void;
  // Classe dos botões (o celular usa botões cheios).
  classeDoBotao?: string;
}> = ({decisao, ocupado, onExportar, onVoltar, classeDoBotao = ""}) => {
  const {conta} = useConta();
  const [assinando, setAssinando] = useState(false);
  // Sem o Mercado Pago no servidor, não há "Assinar" (e quem já assina não vê).
  const podeAssinar = Boolean(conta?.assinatura?.disponivel && conta.assinatura.situacao === "nenhuma");
  if (!decisao.permitido) {
    return (
      <div className="aviso-do-plano" role="alert">
        <h2>{decisao.codigo === "assine" ? "Assine para continuar" : "Sem minutos suficientes"}</h2>
        <p>{decisao.motivo}</p>
        <div className="aviso-do-plano-botoes">
          {podeAssinar ? (
            <button type="button" className={`bt primario ${classeDoBotao}`} onClick={() => setAssinando(true)}>
              Assinar
            </button>
          ) : null}
          <button type="button" className={`bt ${classeDoBotao}`} onClick={onVoltar}>
            Voltar a editar
          </button>
        </div>
        {assinando ? <JanelaAssinar onFechar={() => setAssinando(false)} /> : null}
      </div>
    );
  }
  return (
    <div className="aviso-do-plano">
      {avisoDaExportacao(decisao).map((linha) => (
        <p key={linha}>{linha}</p>
      ))}
      <div className="aviso-do-plano-botoes">
        <button type="button" className={`bt primario ${classeDoBotao}`} disabled={ocupado} onClick={onExportar}>
          Exportar agora
        </button>
        <button type="button" className={`bt ${classeDoBotao}`} onClick={onVoltar}>
          Voltar a editar
        </button>
      </div>
    </div>
  );
};

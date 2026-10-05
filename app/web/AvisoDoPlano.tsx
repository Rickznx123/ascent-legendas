// Antes de exportar (com login): o que a exportação vai descontar, quanto sobra e
// se sai com marca d'água; se o plano não deixa, a tela "Assine para continuar".
// Só mostra a decisão do servidor (app/servidor/cota.ts); a exportação decide de
// novo lá.
import type {DecisaoDeExportacao} from "./api";
import {avisoDaExportacao} from "./celular/plano";

export const AvisoDoPlano: React.FC<{
  decisao: DecisaoDeExportacao;
  ocupado: boolean;
  onExportar: () => void;
  onVoltar: () => void;
  // Classe dos botões (o celular usa botões cheios).
  classeDoBotao?: string;
}> = ({decisao, ocupado, onExportar, onVoltar, classeDoBotao = ""}) => {
  if (!decisao.permitido) {
    return (
      <div className="aviso-do-plano" role="alert">
        <h2>{decisao.codigo === "assine" ? "Assine para continuar" : "Sem minutos suficientes"}</h2>
        <p>{decisao.motivo}</p>
        <div className="aviso-do-plano-botoes">
          <button type="button" className={`bt primario ${classeDoBotao}`} disabled title="A assinatura chega em breve">
            Assinar <small>em breve</small>
          </button>
          <button type="button" className={`bt ${classeDoBotao}`} onClick={onVoltar}>
            Voltar a editar
          </button>
        </div>
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

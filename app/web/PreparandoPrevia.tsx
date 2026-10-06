// No lugar da prévia enquanto a prévia leve do vídeo não fica pronta (Etapa 3,
// bloco 4): a capa, com "Preparando a prévia…" por cima. A prévia entra sozinha
// quando fica pronta (usePreviaLeve pergunta de novo). Com falha, um botão para
// tentar de novo. O original nunca toca aqui.
import type {EstadoDaPrevia} from "./api";

export const PreparandoPrevia: React.FC<{
  estado: EstadoDaPrevia | undefined;
  // Largura / altura do vídeo (a caixa tem a mesma proporção da prévia).
  proporcao: number;
  onTentarDeNovo: () => void;
}> = ({estado, proporcao, onTentarDeNovo}) => {
  const capa = estado && "capa" in estado ? estado.capa : undefined;
  return (
    <div className="previa preparando-previa" style={{aspectRatio: String(proporcao), ["--proporcao" as string]: proporcao}}>
      {capa ? <img src={capa} alt="" /> : null}
      <div className="preparando-previa-texto" role="status">
        {estado?.estado === "falhou" ? (
          <>
            <span>{estado.mensagem}</span>
            <button type="button" className="bt" onClick={onTentarDeNovo}>
              Tentar de novo
            </button>
          </>
        ) : (
          <>
            <span className="preparando-previa-roda" aria-hidden="true" />
            <span>Preparando a prévia…</span>
          </>
        )}
      </div>
    </div>
  );
};

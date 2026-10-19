import type {BlockTiming} from "../../src/tempos";
import type {AssignedCaptionBlock} from "../../src/types";

// Passo dos botões − e + do início e do fim.
const PASSO_MS = 100;

// 12 400 ms -> "12,4s".
const segundos = (ms: number): string => `${(ms / 1000).toFixed(1).replace(".", ",")}s`;

// Início e fim do bloco na tela, com ajuste à mão (PC e celular). Os tempos
// mostrados são os da prévia; os salvos no bloco ficam sem a sincronia (andam com
// ela). Os limites (anterior, seguinte, 0,3 s mínimo) são aplicados pela linha do
// tempo (src/tempos.ts); os botões partem sempre do tempo que vale agora.
export const TempoDoBloco: React.FC<{
  indice: number;
  bloco: AssignedCaptionBlock;
  timing: BlockTiming | undefined;
  sincroniaMs: number;
  // Tempo atual da prévia, em ms (lido no clique).
  tempoAtualMs: () => number;
  ocupado: boolean;
  onTempo: (bloco: number, tempo: {inicioMs?: number; fimMs?: number}) => void;
}> = ({indice, bloco, timing, sincroniaMs, tempoAtualMs, ocupado, onTempo}) => {
  if (!timing) {
    return null;
  }
  const manual = bloco.inicioMs !== undefined || bloco.fimMs !== undefined;
  // Novo tempo (de tela) para o início ou o fim; o outro continua como está salvo.
  const mudar = (qual: "inicioMs" | "fimMs", telaMs: number) =>
    onTempo(indice, {inicioMs: bloco.inicioMs, fimMs: bloco.fimMs, [qual]: telaMs - sincroniaMs});
  const botao = (rotulo: string, titulo: string, aoClicar: () => void) => (
    <button type="button" className="bt bt-p" disabled={ocupado} title={titulo} aria-label={`${titulo} (bloco ${indice + 1})`} onClick={aoClicar}>
      {rotulo}
    </button>
  );
  return (
    <div className="campo campo-tempo">
      <span className="rotulo">Tempo</span>
      <span className="campo-direita">
        <span title={manual ? "Tempo escolhido à mão" : "Tempo automático"}>
          {segundos(timing.showMs)} → {segundos(timing.hideMs)}
          {manual ? " (manual)" : ""}
        </span>
        <span className="tempo-botoes">
          <span className="suave">Início</span>
          {botao("−", "Início 0,1 s antes", () => mudar("inicioMs", timing.showMs - PASSO_MS))}
          {botao("+", "Início 0,1 s depois", () => mudar("inicioMs", timing.showMs + PASSO_MS))}
          <span className="suave">Fim</span>
          {botao("−", "Fim 0,1 s antes", () => mudar("fimMs", timing.hideMs - PASSO_MS))}
          {botao("+", "Fim 0,1 s depois", () => mudar("fimMs", timing.hideMs + PASSO_MS))}
        </span>
        <span className="tempo-botoes">
          {botao("Cortar aqui", "Encerra o bloco no tempo atual da prévia", () => mudar("fimMs", tempoAtualMs()))}
          <button
            type="button"
            className="bt bt-p"
            disabled={ocupado || !manual}
            title="Volta ao início e ao fim automáticos"
            onClick={() => onTempo(indice, {})}
          >
            Automático
          </button>
        </span>
      </span>
    </div>
  );
};

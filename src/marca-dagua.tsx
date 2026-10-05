// Marca d'água do plano grátis, desenhada dentro da composição: sai no vídeo
// exportado (render local e na nuvem). Quem decide se aparece é o servidor, pelo
// plano da conta (props.marcaDagua); o que vem do navegador não liga nem desliga.
//
// Posição: canto superior esquerdo, logo abaixo da faixa de topo das telas do
// Instagram (≈14% de cima) e do TikTok (≈7%), longe da coluna de botões da
// direita e do rodapé com o nome e a descrição (≈22–25% de baixo). As legendas
// ficam no centro da largura (padrão a 68% da altura; predefinições a 22%, 50% e
// 78%), então a marca não divide espaço com elas.
import {AbsoluteFill} from "remotion";

export const TEXTO_DA_MARCA = "Ascent Legendas";

// Em % da largura e da altura do vídeo.
export const POSICAO_DA_MARCA = {esquerda: 6, topo: 14.5};

export const MarcaDagua: React.FC = () => (
  <AbsoluteFill style={{containerType: "inline-size", pointerEvents: "none"}}>
    <div
      style={{
        position: "absolute",
        left: `${POSICAO_DA_MARCA.esquerda}%`,
        top: `${POSICAO_DA_MARCA.topo}%`,
        display: "flex",
        alignItems: "center",
        gap: "1.1cqw",
        fontFamily: "Inter Tight",
        fontWeight: 800,
        fontSize: "2.6cqw",
        letterSpacing: "-0.01em",
        lineHeight: 1,
        color: "rgba(255, 255, 255, 0.9)",
        // Pílula escura translúcida: legível sobre parede clara ou cena escura,
        // sem virar uma tarja.
        background: "rgba(0, 0, 0, 0.3)",
        padding: "0.75cqw 1.4cqw 0.75cqw 1.1cqw",
        borderRadius: "99cqw",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: "2.3cqw",
          height: "2.3cqw",
          borderRadius: "0.55cqw",
          background: "rgba(255, 255, 255, 0.9)",
          display: "block",
        }}
      />
      {TEXTO_DA_MARCA}
    </div>
  </AbsoluteFill>
);

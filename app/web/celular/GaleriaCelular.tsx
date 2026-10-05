// Galeria de templates no celular: a mesma do computador, mas o pacote vai para o
// vídeo inteiro segurando o dedo no chip (o botão "Aplicar pacote" fica escondido
// em celular.css). Um toque curto continua só filtrando as miniaturas.
import {useEffect, useRef} from "react";
import {PACOTE_MISTO} from "../../../src/motor/blocos";
import {GaleriaDoProjeto} from "../GaleriaDoProjeto";
import type {Editor} from "../useEditor";

// Tempo segurando o chip (ms) para aplicar o pacote.
const TEMPO_PARA_APLICAR = 500;
// Dedo que andou mais que isso (px) está rolando os chips, não segurando.
const FOLGA_DO_DEDO = 10;
// Duração do retorno visual depois de aplicar (ms).
const TEMPO_DO_RETORNO = 600;

type Toque = {chip: HTMLElement; x: number; y: number; timer: number};

export const GaleriaCelular: React.FC<{e: Editor}> = ({e}) => {
  const toque = useRef<Toque | undefined>(undefined);

  // Os chips seguem a ordem da galeria: Misto e depois os pacotes do estilo.
  const pacotes = e.estiloGaleria ? Object.values(e.estiloGaleria.pacotes).map((rules) => rules.name) : [];
  const ordem = [PACOTE_MISTO, ...pacotes];
  const podeAplicar = (pacote: string) =>
    !e.ocupado && pacote !== e.estilo?.pacote && (pacote !== PACOTE_MISTO || pacotes.length > 1);

  const soltar = () => {
    if (toque.current) {
      window.clearTimeout(toque.current.timer);
      toque.current.chip.classList.remove("cel-chip-segurando");
      toque.current = undefined;
    }
  };
  useEffect(() => soltar, []);

  return (
    <div
      className="cel-galeria"
      onPointerDown={(event) => {
        const chip = event.target instanceof Element ? event.target.closest<HTMLElement>(".chips > .chip") : null;
        if (!chip) {
          return;
        }
        const pacote = ordem[Array.from(chip.parentElement?.children ?? []).indexOf(chip)];
        if (!pacote || !podeAplicar(pacote)) {
          return;
        }
        soltar();
        chip.classList.add("cel-chip-segurando");
        const timer = window.setTimeout(() => {
          soltar();
          navigator.vibrate?.(20);
          chip.classList.add("cel-chip-aplicado");
          window.setTimeout(() => chip.classList.remove("cel-chip-aplicado"), TEMPO_DO_RETORNO);
          void e.trocarPacote(pacote);
        }, TEMPO_PARA_APLICAR);
        toque.current = {chip, x: event.clientX, y: event.clientY, timer};
      }}
      onPointerMove={(event) => {
        if (
          toque.current &&
          Math.hypot(event.clientX - toque.current.x, event.clientY - toque.current.y) > FOLGA_DO_DEDO
        ) {
          soltar();
        }
      }}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      onPointerLeave={soltar}
      // Segurar o dedo não abre o menu do navegador.
      onContextMenu={(event) => event.target instanceof Element && event.target.closest(".chips") && event.preventDefault()}
    >
      <p className="cel-ajuda">Toque no pacote para ver os layouts · segure para aplicar ao vídeo inteiro</p>
      <GaleriaDoProjeto e={e} />
    </div>
  );
};

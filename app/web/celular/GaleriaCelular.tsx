// Galeria de templates no celular: a mesma do computador, mas tocar no chip de um
// pacote já o aplica ao vídeo inteiro (o botão "Aplicar pacote" fica escondido em
// celular.css). O chip tocado também passa a filtrar as miniaturas, então fica
// marcado como o escolhido; a troca entra no desfazer.
import {PACOTE_MISTO} from "../../../src/motor/blocos";
import {GaleriaDoProjeto} from "../GaleriaDoProjeto";
import type {Editor} from "../useEditor";
import {Dica, marcarDica} from "./Dica";

// Duração do retorno visual depois de aplicar (ms).
const TEMPO_DO_RETORNO = 600;

export const GaleriaCelular: React.FC<{e: Editor}> = ({e}) => {
  // Os chips seguem a ordem da galeria: Misto e depois os pacotes do estilo.
  const pacotes = e.estiloGaleria ? Object.values(e.estiloGaleria.pacotes).map((rules) => rules.name) : [];
  const ordem = [PACOTE_MISTO, ...pacotes];
  const podeAplicar = (pacote: string) =>
    !e.ocupado && Boolean(e.projetoDoVideo) && pacote !== e.estilo?.pacote && (pacote !== PACOTE_MISTO || pacotes.length > 1);

  return (
    <div
      className="cel-galeria"
      // Proporção do vídeo: as miniaturas recortam a composição em volta da legenda.
      style={{["--proporcao-mini" as string]: e.videoInfo ? e.videoInfo.width / e.videoInfo.height : 9 / 16}}
      onClick={(event) => {
        const chip = event.target instanceof Element ? event.target.closest<HTMLElement>(".chips > .chip") : null;
        if (!chip) {
          return;
        }
        const pacote = ordem[Array.from(chip.parentElement?.children ?? []).indexOf(chip)];
        if (!pacote || !podeAplicar(pacote)) {
          return;
        }
        chip.classList.add("cel-chip-aplicado");
        window.setTimeout(() => chip.classList.remove("cel-chip-aplicado"), TEMPO_DO_RETORNO);
        void e.trocarPacote(pacote);
        marcarDica("templates");
      }}
    >
      <Dica nome="templates">Toque no pacote para aplicar ao vídeo inteiro</Dica>
      <GaleriaDoProjeto e={e} />
    </div>
  );
};

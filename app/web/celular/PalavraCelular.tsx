// Uma palavra da legenda no celular: um campo de texto sempre presente, com cara de
// texto. Um toque já foca o campo (o próprio navegador foca, dentro do toque; o iOS só
// abre o teclado assim) e seleciona a palavra. OK/Enter ou tocar fora confirma; Esc
// desfaz. Campo vazio confirmado exclui a palavra; durante a edição, a barra logo
// acima do teclado também tem "Excluir palavra".
import {useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";

// Barra acima do teclado: tocar nela não conta como "tocar fora".
const BARRA_DO_TECLADO = "cel-barra-teclado";

export const PalavraCelular: React.FC<{
  texto: string;
  chave: boolean;
  rotulo: string;
  onEditar: (texto: string) => void;
  onExcluir: () => void;
}> = ({texto, chave, rotulo, onEditar, onExcluir}) => {
  const campo = useRef<HTMLInputElement>(null);
  const [rascunho, setRascunho] = useState<string>();
  const editando = rascunho !== undefined;
  const valor = rascunho ?? texto;

  // Valores atuais para confirmar fora do render (tocar fora, a folha fechando).
  const atual = useRef({rascunho, texto, onEditar, onExcluir});
  atual.current = {rascunho, texto, onEditar, onExcluir};
  // Encerra a edição sem gravar nada (o que vier depois, como o blur, não grava).
  const encerrar = () => {
    atual.current.rascunho = undefined;
    setRascunho(undefined);
  };
  const confirmar = () => {
    const {rascunho: escrito, texto: antes, onEditar: editar, onExcluir: excluir} = atual.current;
    if (escrito === undefined) {
      return;
    }
    encerrar();
    const limpo = escrito.trim();
    if (!limpo) {
      excluir();
    } else if (limpo !== antes) {
      editar(limpo);
    }
  };
  const excluirAgora = () => {
    encerrar();
    atual.current.onExcluir();
  };

  // Tocar fora confirma: no iOS, tocar onde não há campo nem sempre tira o foco.
  useEffect(() => {
    if (!editando) {
      return;
    }
    const aoTocar = (event: PointerEvent) => {
      const alvo = event.target instanceof Element ? event.target : null;
      if (alvo !== campo.current && !alvo?.closest(`.${BARRA_DO_TECLADO}`)) {
        campo.current?.blur();
      }
    };
    document.addEventListener("pointerdown", aoTocar, true);
    return () => document.removeEventListener("pointerdown", aoTocar, true);
  }, [editando]);

  // Saiu da tela editando (a folha fechou, a lista mudou): confirma o que foi escrito.
  useEffect(() => () => confirmar(), []);

  // A barra vai para a raiz do layout (.cel), cujo fundo fica logo acima do teclado.
  const raiz = editando ? campo.current?.closest(".cel") : null;

  return (
    <span className={`palavra cel-palavra ${chave ? "palavra-chave" : ""}`} data-valor={`${valor} `}>
      <input
        ref={campo}
        value={valor}
        // Largura própria mínima: quem mede a palavra é o ::after (celular.css).
        size={1}
        aria-label={`${rotulo}${chave ? " (palavra-chave)" : ""}`}
        enterKeyHint="done"
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        onClick={(event) => event.stopPropagation()}
        onFocus={(event) => {
          const elemento = event.currentTarget;
          setRascunho(texto);
          elemento.select();
          // O iOS põe o cursor no ponto tocado logo depois do foco: seleciona de novo.
          window.setTimeout(() => {
            if (document.activeElement === elemento) {
              elemento.setSelectionRange(0, elemento.value.length);
            }
          }, 0);
        }}
        onChange={(event) => setRascunho(event.target.value)}
        onBlur={confirmar}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            encerrar();
            event.currentTarget.blur();
          }
        }}
      />
      {raiz
        ? createPortal(
            <div className={BARRA_DO_TECLADO} role="toolbar" aria-label="Edição da palavra">
              <button
                type="button"
                className="bt perigo"
                // preventDefault no pointerdown: o campo não perde o foco (o blur
                // confirmaria a edição em vez de excluir). A exclusão fica para o
                // clique: feita já no pointerdown, a barra e o teclado sumiriam antes
                // de o dedo subir, e o clique cairia no que estivesse embaixo.
                onPointerDown={(event) => event.preventDefault()}
                onClick={excluirAgora}
              >
                🗑 Excluir palavra
              </button>
            </div>,
            raiz,
          )
        : null}
    </span>
  );
};

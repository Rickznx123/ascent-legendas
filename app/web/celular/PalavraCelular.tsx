// Uma palavra da legenda no celular: um campo de texto sempre presente, com cara de
// texto. Um toque já foca o campo (o próprio navegador foca, dentro do toque; o iOS só
// abre o teclado assim) e seleciona a palavra. OK/Enter ou tocar fora confirma; Esc
// desfaz; campo vazio volta ao texto anterior.
import {useEffect, useRef, useState} from "react";

export const PalavraCelular: React.FC<{
  texto: string;
  chave: boolean;
  rotulo: string;
  onEditar: (texto: string) => void;
}> = ({texto, chave, rotulo, onEditar}) => {
  const campo = useRef<HTMLInputElement>(null);
  const [rascunho, setRascunho] = useState<string>();
  const editando = rascunho !== undefined;
  const valor = rascunho ?? texto;

  // Valores atuais para confirmar fora do render (tocar fora, a folha fechando).
  const atual = useRef({rascunho, texto, onEditar});
  atual.current = {rascunho, texto, onEditar};
  const confirmar = () => {
    const {rascunho: escrito, texto: antes, onEditar: editar} = atual.current;
    if (escrito === undefined) {
      return;
    }
    atual.current.rascunho = undefined;
    setRascunho(undefined);
    const limpo = escrito.trim();
    if (limpo && limpo !== antes) {
      editar(limpo);
    }
  };

  // Tocar fora confirma: no iOS, tocar onde não há campo nem sempre tira o foco.
  useEffect(() => {
    if (!editando) {
      return;
    }
    const aoTocar = (event: PointerEvent) => {
      if (event.target !== campo.current) {
        campo.current?.blur();
      }
    };
    document.addEventListener("pointerdown", aoTocar, true);
    return () => document.removeEventListener("pointerdown", aoTocar, true);
  }, [editando]);

  // Saiu da tela editando (a folha fechou, a lista mudou): confirma o que foi escrito.
  useEffect(() => () => confirmar(), []);

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
            atual.current.rascunho = undefined;
            setRascunho(undefined);
            event.currentTarget.blur();
          }
        }}
      />
    </span>
  );
};

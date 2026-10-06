// Campos de senha e o formulário de senha nova: usados na tela de entrada, na
// redefinição ("Esqueci minha senha") e no "Trocar senha" do menu da conta.
import {useState} from "react";
import {SENHA_MINIMA, definirSenha} from "./sessao";

// Campo de senha com o botão de mostrar/ocultar. autoComplete: current-password
// (entrar) ou new-password (criar e trocar), para o iPhone oferecer salvar a senha.
export const CampoDeSenha: React.FC<{
  id: string;
  rotulo: string;
  valor: string;
  autoComplete: "current-password" | "new-password";
  desativado?: boolean;
  onMudar: (valor: string) => void;
}> = ({id, rotulo, valor, autoComplete, desativado, onMudar}) => {
  const [visivel, setVisivel] = useState(false);
  return (
    <>
      <label htmlFor={id} className="rotulo">
        {rotulo}
      </label>
      <div className="campo-senha">
        <input
          id={id}
          name={autoComplete === "current-password" ? "password" : "new-password"}
          type={visivel ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          minLength={autoComplete === "new-password" ? SENHA_MINIMA : undefined}
          value={valor}
          disabled={desativado}
          onChange={(event) => onMudar(event.target.value)}
        />
        <button
          type="button"
          className="bt campo-senha-ver"
          aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visivel}
          disabled={desativado}
          onClick={() => setVisivel(!visivel)}
        >
          {visivel ? "Ocultar" : "Mostrar"}
        </button>
      </div>
    </>
  );
};

// O que falta numa senha nova (vazio: está boa).
export const problemaDaSenhaNova = (senha: string, repetida: string): string | undefined => {
  if (senha.length < SENHA_MINIMA) {
    return `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`;
  }
  if (senha !== repetida) {
    return "As duas senhas não são iguais.";
  }
  return undefined;
};

// Senha nova da conta que já está entrada. email: vai num campo escondido, para o
// iPhone saber de que conta é a senha que ele oferece salvar.
export const FormularioDeSenhaNova: React.FC<{
  email?: string;
  textoDoBotao: string;
  onPronto: () => void;
  onCancelar?: () => void;
}> = ({email, textoDoBotao, onPronto, onCancelar}) => {
  const [senha, setSenha] = useState("");
  const [repetida, setRepetida] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string>();

  const salvar = async (event: React.FormEvent) => {
    event.preventDefault();
    const problema = problemaDaSenhaNova(senha, repetida);
    if (problema) {
      setErro(problema);
      return;
    }
    setSalvando(true);
    setErro(undefined);
    try {
      await definirSenha(senha);
      onPronto();
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={(event) => void salvar(event)}>
      {email ? <input type="email" name="email" autoComplete="email" value={email} readOnly hidden /> : null}
      <CampoDeSenha id="senha-nova" rotulo={`Senha nova (mínimo ${SENHA_MINIMA} caracteres)`} valor={senha} autoComplete="new-password" desativado={salvando} onMudar={setSenha} />
      <CampoDeSenha id="senha-repetida" rotulo="Repita a senha nova" valor={repetida} autoComplete="new-password" desativado={salvando} onMudar={setRepetida} />
      <button type="submit" className="bt primario cheio" disabled={salvando || !senha || !repetida}>
        {salvando ? "Salvando…" : textoDoBotao}
      </button>
      {onCancelar ? (
        <button type="button" className="bt cheio" disabled={salvando} onClick={onCancelar}>
          Cancelar
        </button>
      ) : null}
      {erro ? (
        <p className="login-erro" role="alert">
          {erro}
        </p>
      ) : null}
    </form>
  );
};

// "Trocar senha" do menu da conta: o formulário numa janela por cima do app.
export const JanelaTrocarSenha: React.FC<{email: string; onFechar: () => void}> = ({email, onFechar}) => {
  const [pronto, setPronto] = useState(false);
  return (
    <div className="login janela-fundo" role="dialog" aria-modal="true" aria-labelledby="trocar-senha-titulo">
      <div className="login-caixa">
        <h1 id="trocar-senha-titulo">Trocar senha</h1>
        {pronto ? (
          <>
            <p className="suave">Senha trocada. Use a senha nova da próxima vez que entrar.</p>
            <button type="button" className="bt primario cheio" onClick={onFechar}>
              Fechar
            </button>
          </>
        ) : (
          <>
            <p className="suave">{email}</p>
            <FormularioDeSenhaNova email={email} textoDoBotao="Salvar senha nova" onPronto={() => setPronto(true)} onCancelar={onFechar} />
          </>
        )}
      </div>
    </div>
  );
};

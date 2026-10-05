// Tela de login: link mágico no e-mail (sem senha). O botão do Google só aparece
// com LOGIN_GOOGLE=1 no .env do servidor (depois de configurar o Google no Supabase).
import {useState} from "react";
import {entrarComGoogle, enviarLinkMagico} from "./sessao";

export const TelaDeLogin: React.FC<{google: boolean; aviso?: string}> = ({google, aviso}) => {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState<string>();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | undefined>(aviso);

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    const endereco = email.trim();
    if (!endereco) {
      return;
    }
    setEnviando(true);
    setErro(undefined);
    try {
      await enviarLinkMagico(endereco);
      setEnviado(endereco);
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="login">
      <div className="login-caixa">
        <div className="marca login-marca">
          <i aria-hidden="true" />
          Ascent Legendas
        </div>
        {enviado ? (
          <>
            <h1>Confira seu e-mail</h1>
            <p className="suave">
              Enviamos um link de acesso para <b>{enviado}</b>. Toque no link para entrar. Ele vale por pouco tempo e
              pode ser aberto neste ou em outro aparelho.
            </p>
            <button type="button" className="bt cheio" onClick={() => setEnviado(undefined)}>
              Usar outro e-mail
            </button>
          </>
        ) : (
          <>
            <h1>Entrar</h1>
            <p className="suave">Sem senha: enviamos um link de acesso para o seu e-mail.</p>
            <form onSubmit={(event) => void enviar(event)}>
              <label htmlFor="login-email" className="rotulo">
                E-mail
              </label>
              <input
                id="login-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                placeholder="voce@exemplo.com"
                value={email}
                disabled={enviando}
                onChange={(event) => setEmail(event.target.value)}
              />
              <button type="submit" className="bt primario cheio" disabled={enviando || !email.trim()}>
                {enviando ? "Enviando…" : "Enviar link de acesso"}
              </button>
            </form>
            {google ? (
              <>
                <div className="login-ou" aria-hidden="true">
                  ou
                </div>
                <button
                  type="button"
                  className="bt cheio"
                  disabled={enviando}
                  onClick={() => entrarComGoogle().catch((error: unknown) => setErro(error instanceof Error ? error.message : String(error)))}
                >
                  Entrar com Google
                </button>
              </>
            ) : null}
          </>
        )}
        {erro ? (
          <p className="login-erro" role="alert">
            {erro}
          </p>
        ) : null}
      </div>
    </main>
  );
};

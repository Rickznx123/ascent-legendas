// Tela de entrada: e-mail e senha (Supabase Auth). Abas "Entrar" e "Criar conta";
// "Esqueci minha senha" manda o e-mail de redefinição (o link volta ao app, que
// pede a senha nova; veja Entrada.tsx). Contas antigas, criadas pelo link do
// e-mail, ainda não têm senha: entram pelo "Esqueci minha senha".
// O botão do Google só aparece com LOGIN_GOOGLE=1 no .env do servidor.
import {useState} from "react";
import {CampoDeSenha, problemaDaSenhaNova} from "./Senha";
import {SENHA_MINIMA, criarConta, entrar, entrarComGoogle, noAppInstalado, pedirRedefinicao, reenviarConfirmacao} from "./sessao";

type Vista = "entrar" | "criar" | "esqueci";
// Depois de enviar um e-mail: qual e para quem.
type Enviado = {tipo: "confirmacao" | "redefinicao"; email: string};

const mensagem = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Nas telas de e-mail enviado e de "Esqueci minha senha".
const AVISO_DE_SPAM = "Não achou? Veja a pasta de spam ou lixo eletrônico. O e-mail vem de login@ascentstudio.com.br.";

const CampoDeEmail: React.FC<{valor: string; desativado: boolean; onMudar: (valor: string) => void}> = ({valor, desativado, onMudar}) => (
  <>
    <label htmlFor="login-email" className="rotulo">
      E-mail
    </label>
    <input
      id="login-email"
      name="email"
      type="email"
      inputMode="email"
      autoComplete="email"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      required
      placeholder="voce@exemplo.com"
      value={valor}
      disabled={desativado}
      onChange={(event) => onMudar(event.target.value)}
    />
  </>
);

export const TelaDeLogin: React.FC<{google: boolean; aviso?: string}> = ({google, aviso}) => {
  const [vista, setVista] = useState<Vista>("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [repetida, setRepetida] = useState("");
  const [enviado, setEnviado] = useState<Enviado>();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | undefined>(aviso);
  const [reenviado, setReenviado] = useState(false);
  const [aceitou, setAceitou] = useState(false);

  const trocarVista = (nova: Vista) => {
    setVista(nova);
    setErro(undefined);
    setSenha("");
    setRepetida("");
  };

  // Roda uma ação da tela com o "ocupado" e o erro em português.
  const executar = async (acao: () => Promise<void>) => {
    setOcupado(true);
    setErro(undefined);
    try {
      await acao();
    } catch (error) {
      setErro(mensagem(error));
    } finally {
      setOcupado(false);
    }
  };

  const enviar = (event: React.FormEvent) => {
    event.preventDefault();
    const endereco = email.trim();
    if (vista === "entrar") {
      // Entrou: a Entrada abre a conta sozinha (ouvirSessao).
      void executar(() => entrar(endereco, senha));
    } else if (vista === "criar") {
      const problema = problemaDaSenhaNova(senha, repetida);
      if (problema) {
        setErro(problema);
        return;
      }
      void executar(async () => {
        await criarConta(endereco, senha);
        setReenviado(false);
        setEnviado({tipo: "confirmacao", email: endereco});
      });
    } else {
      void executar(async () => {
        await pedirRedefinicao(endereco);
        setEnviado({tipo: "redefinicao", email: endereco});
      });
    }
  };

  const titulo = vista === "esqueci" ? "Esqueci minha senha" : vista === "criar" ? "Criar conta" : "Entrar";

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
            {enviado.tipo === "confirmacao" ? (
              <p className="suave">
                Enviamos um link de confirmação para <b>{enviado.email}</b>. Toque no link para ativar a conta; depois,
                você entra com o e-mail e a senha.
                {noAppInstalado() ? " O link abre no Safari: depois de tocar nele, volte para este app e entre com o e-mail e a senha." : null}
              </p>
            ) : (
              <p className="suave">
                Se <b>{enviado.email}</b> tem conta, enviamos um link para criar uma senha nova. Toque no link: o app abre
                pedindo a senha nova.
                {noAppInstalado()
                  ? " O link abre no Safari: defina a senha nova lá e depois volte para este app para entrar com ela."
                  : null}
              </p>
            )}
            <p className="suave">{AVISO_DE_SPAM}</p>
            {enviado.tipo === "confirmacao" ? (
              <button
                type="button"
                className="bt cheio"
                disabled={ocupado || reenviado}
                onClick={() =>
                  void executar(async () => {
                    await reenviarConfirmacao(enviado.email);
                    setReenviado(true);
                  })
                }
              >
                {reenviado ? "Link reenviado" : ocupado ? "Reenviando…" : "Reenviar o link"}
              </button>
            ) : null}
            <button
              type="button"
              className="bt primario cheio"
              onClick={() => {
                setEnviado(undefined);
                trocarVista("entrar");
              }}
            >
              Voltar para entrar
            </button>
          </>
        ) : (
          <>
            {vista !== "esqueci" ? (
              <div className="login-abas" role="tablist" aria-label="Entrar ou criar conta">
                <button type="button" role="tab" aria-selected={vista === "entrar"} onClick={() => trocarVista("entrar")}>
                  Entrar
                </button>
                <button type="button" role="tab" aria-selected={vista === "criar"} onClick={() => trocarVista("criar")}>
                  Criar conta
                </button>
              </div>
            ) : null}
            <h1>{titulo}</h1>
            {vista === "esqueci" ? (
              <>
                <p className="suave">Enviamos um link para o seu e-mail; ele abre o app pedindo a senha nova. Serve também para criar a senha de uma conta antiga, que entrava pelo link.</p>
                <p className="suave">{AVISO_DE_SPAM}</p>
              </>
            ) : null}
            <form onSubmit={enviar}>
              <CampoDeEmail valor={email} desativado={ocupado} onMudar={setEmail} />
              {vista === "entrar" ? (
                <CampoDeSenha id="login-senha" rotulo="Senha" valor={senha} autoComplete="current-password" desativado={ocupado} onMudar={setSenha} />
              ) : null}
              {vista === "criar" ? (
                <>
                  <CampoDeSenha
                    id="login-senha-nova"
                    rotulo={`Senha (mínimo ${SENHA_MINIMA} caracteres)`}
                    valor={senha}
                    autoComplete="new-password"
                    desativado={ocupado}
                    onMudar={setSenha}
                  />
                  <CampoDeSenha id="login-senha-repetida" rotulo="Repita a senha" valor={repetida} autoComplete="new-password" desativado={ocupado} onMudar={setRepetida} />
                  {/* Ao criar a conta, a pessoa declara que leu os termos e a política. */}
                  <label className="login-aceite">
                    <input type="checkbox" required checked={aceitou} disabled={ocupado} onChange={(event) => setAceitou(event.target.checked)} />
                    <span>
                      Li e aceito os{" "}
                      <a href="/termos.html" target="_blank" rel="noopener">
                        Termos de uso
                      </a>{" "}
                      e a{" "}
                      <a href="/privacidade.html" target="_blank" rel="noopener">
                        Política de privacidade
                      </a>
                      .
                    </span>
                  </label>
                </>
              ) : null}
              <button
                type="submit"
                className="bt primario cheio"
                disabled={ocupado || !email.trim() || (vista !== "esqueci" && !senha) || (vista === "criar" && !aceitou)}
              >
                {ocupado
                  ? "Aguarde…"
                  : vista === "entrar"
                    ? "Entrar"
                    : vista === "criar"
                      ? "Criar conta"
                      : "Enviar link para criar senha nova"}
              </button>
            </form>
            {vista === "entrar" ? (
              <button type="button" className="bt-link" onClick={() => trocarVista("esqueci")}>
                Esqueci minha senha
              </button>
            ) : null}
            {vista === "esqueci" ? (
              <button type="button" className="bt-link" onClick={() => trocarVista("entrar")}>
                Voltar para entrar
              </button>
            ) : null}
            {google && vista !== "esqueci" ? (
              <>
                <div className="login-ou" aria-hidden="true">
                  ou
                </div>
                <button
                  type="button"
                  className="bt cheio"
                  disabled={ocupado}
                  onClick={() => entrarComGoogle().catch((error: unknown) => setErro(mensagem(error)))}
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
        <p className="login-legal">
          <a href="/termos.html" target="_blank" rel="noopener">
            Termos de uso
          </a>{" "}
          ·{" "}
          <a href="/privacidade.html" target="_blank" rel="noopener">
            Política de privacidade
          </a>
        </p>
      </div>
    </main>
  );
};

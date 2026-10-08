// Entrada do app: sem login no servidor, o editor de sempre. Com login: a tela de
// login, depois (no primeiro login, se houver) a oferta de importar os projetos
// deste computador, e o editor da conta. Sair, ou a sessão expirar, volta ao login.
// Sem sessão, quem chega pelo navegador vê antes a página de apresentação
// (Apresentacao.tsx); no app instalado (PWA), o login direto. Com sessão, o editor,
// sem passar pela página: ela só aparece depois de saber que não há sessão.
import {useCallback, useEffect, useRef, useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {App} from "./App";
import {Apresentacao, TITULO_DA_APRESENTACAO} from "./Apresentacao";
import {EVENTO_SESSAO_EXPIRADA, api, executarTarefa} from "./api";
import type {Andamento, Conta} from "./api";
import {ContaContexto} from "./conta";
import {TelaDeLogin} from "./Login";
import {FormularioDeSenhaNova} from "./Senha";
import {RetornoDaAssinatura, checkoutRecente} from "./Assinatura";
import {AvisoDoPix} from "./Pix";
import {iniciarSessao, lerConfig, noAppInstalado, ouvirSessao, pedeSenhaNova, sair} from "./sessao";
import type {ConfigDoLogin} from "./sessao";

type Estado =
  | {tela: "carregando"}
  | {tela: "erro"; mensagem: string}
  | {tela: "local"}
  // Página de apresentação (sem sessão, fora do app instalado).
  | {tela: "apresentacao"}
  // vista: a aba em que o login abre (a página manda para "criar" ou "entrar").
  | {tela: "login"; aviso?: string; vista?: VistaDoLogin}
  // Veio do link "Esqueci minha senha": a sessão está aberta, falta a senha nova.
  | {tela: "senha-nova"; sessao: Session}
  | {tela: "importar"; conta: Conta; usuario: string; videos: string[]; projeto: string | null}
  | {tela: "editor"; conta: Conta; usuario: string};

type VistaDoLogin = "entrar" | "criar";

// Os botões da página de apresentação levam a #criar-conta e #entrar: o endereço
// abre direto essa aba do login (e o voltar do navegador volta à página).
const vistaDoEndereco = (): VistaDoLogin | undefined =>
  location.hash === "#criar-conta" ? "criar" : location.hash === "#entrar" ? "entrar" : undefined;

// Sem sessão: a aba pedida no endereço; senão, a página de apresentação, ou o login
// no app instalado (quem instalou já conhece o app).
const semSessao = (): Estado => {
  const vista = vistaDoEndereco();
  if (vista) return {tela: "login", vista};
  return noAppInstalado() ? {tela: "login"} : {tela: "apresentacao"};
};

// "Agora não" na importação fica lembrado neste navegador, por conta.
const chaveDaRecusa = (usuario: string) => `importacao-local-recusada:${usuario}`;
const recusou = (usuario: string): boolean => {
  try {
    return localStorage.getItem(chaveDaRecusa(usuario)) === "1";
  } catch {
    return false;
  }
};

// Primeiro login: oferece trazer os vídeos e o projeto desta máquina para a conta.
const TelaImportarLocal: React.FC<{
  videos: string[];
  projeto: string | null;
  onImportar: (onAndamento: (andamento: Andamento) => void) => Promise<void>;
  onPular: () => void;
}> = ({videos, projeto, onImportar, onPular}) => {
  const [andamento, setAndamento] = useState<Andamento>();
  const [erro, setErro] = useState<string>();
  const importando = Boolean(andamento);
  return (
    <main className="login">
      <div className="login-caixa">
        <h1>Importar projetos deste computador</h1>
        <p className="suave">
          Encontramos {videos.length} {videos.length === 1 ? "vídeo" : "vídeos"}
          {projeto ? " e 1 projeto em edição" : ""} neste computador. Quer trazê-los para a sua conta? Eles são copiados; os
          originais continuam aqui.
        </p>
        <ul className="login-lista">
          {videos.map((nome) => (
            <li key={nome}>
              {nome}
              {nome === projeto ? " (em edição)" : ""}
            </li>
          ))}
        </ul>
        {andamento ? <p className="suave">{andamento.etapa}</p> : null}
        <button
          type="button"
          className="bt primario cheio"
          disabled={importando}
          onClick={() => {
            setErro(undefined);
            setAndamento({etapa: "Começando..."});
            onImportar(setAndamento).catch((error: unknown) => {
              setAndamento(undefined);
              setErro(error instanceof Error ? error.message : String(error));
            });
          }}
        >
          {importando ? "Importando…" : "Importar"}
        </button>
        <button type="button" className="bt cheio" disabled={importando} onClick={onPular}>
          Agora não
        </button>
        {erro ? (
          <p className="login-erro" role="alert">
            {erro}
          </p>
        ) : null}
      </div>
    </main>
  );
};

// Volta do checkout do Mercado Pago (?assinatura=retorno): lido uma vez, ao abrir, e
// tirado do endereço. Só mostra a espera; quem confirma é o servidor (webhook).
const voltouDoCheckout = (() => {
  const parametros = new URLSearchParams(location.search);
  if (parametros.get("assinatura") !== "retorno") return false;
  parametros.delete("assinatura");
  // O Mercado Pago pode acrescentar os próprios parâmetros (preapproval_id etc.).
  for (const chave of [...parametros.keys()]) if (chave.startsWith("preapproval") || chave === "status") parametros.delete(chave);
  const resto = parametros.toString();
  history.replaceState(null, "", location.pathname + (resto ? `?${resto}` : ""));
  return true;
})();

export const Entrada: React.FC = () => {
  const [mostrarRetorno, setMostrarRetorno] = useState(() => voltouDoCheckout || checkoutRecente());
  // App instalado: o checkout abre e volta numa janela do Safari; ao voltar para o app
  // (que fica aberto por baixo), a confirmação aparece.
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && checkoutRecente()) setMostrarRetorno(true);
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, []);
  const [config, setConfig] = useState<ConfigDoLogin>();
  const [estado, setEstado] = useState<Estado>({tela: "carregando"});
  const telaAtual = useRef<Estado["tela"]>("carregando");
  telaAtual.current = estado.tela;

  // Com a sessão: a conta (e-mail e plano) e, no primeiro login, a importação.
  const abrirConta = useCallback(async (sessao: Session) => {
    try {
      const conta = await api.conta();
      if (!conta) {
        throw new Error("O servidor não reconheceu a conta.");
      }
      // Veio da página de apresentação (#entrar, #criar-conta): limpa o endereço.
      if (vistaDoEndereco()) history.replaceState(null, "", location.pathname + location.search);
      const usuario = sessao.user.id;
      const oferta = recusou(usuario) ? {disponivel: false} : await api.importacaoLocal();
      setEstado(
        oferta.disponivel
          ? {tela: "importar", conta, usuario, videos: oferta.videos ?? [], projeto: oferta.projeto ?? null}
          : {tela: "editor", conta, usuario},
      );
    } catch (error) {
      setEstado({tela: "login", aviso: error instanceof Error ? error.message : String(error)});
    }
  }, []);

  useEffect(() => {
    let cancelado = false;
    let deixarDeOuvir = () => undefined as void;
    (async () => {
      const lida = await lerConfig();
      if (cancelado) {
        return;
      }
      setConfig(lida);
      if (!lida.login) {
        setEstado({tela: "local"});
        return;
      }
      const sessao = await iniciarSessao(lida);
      deixarDeOuvir = ouvirSessao((nova) => {
        // Saiu (ou a sessão acabou): login. Entrou enquanto o login estava na tela
        // (o link do e-mail aberto em outra aba deste navegador): abre a conta. A
        // renovação do token, com o editor aberto, não muda nada. Fora do callback
        // do Supabase (ele pede para não fazer chamadas dentro dele).
        window.setTimeout(() => {
          if (!nova) {
            // O Supabase avisa "sem sessão" logo ao começar a ouvir: com a tela ainda
            // carregando, na página de apresentação ou no login, nada muda (a entrada
            // decide sozinha). Saiu de dentro do app: login.
            const semMudar: Estado["tela"][] = ["carregando", "apresentacao", "login"];
            if (!semMudar.includes(telaAtual.current)) setEstado({tela: "login"});
          } else if (telaAtual.current === "login" || telaAtual.current === "apresentacao") {
            setEstado({tela: "carregando"});
            void abrirConta(nova);
          }
        }, 0);
      });
      if (cancelado) {
        deixarDeOuvir();
        return;
      }
      if (sessao && pedeSenhaNova()) {
        setEstado({tela: "senha-nova", sessao});
      } else if (sessao) {
        await abrirConta(sessao);
      } else {
        setEstado(semSessao());
      }
    })().catch((error: unknown) => setEstado({tela: "erro", mensagem: error instanceof Error ? error.message : String(error)}));
    return () => {
      cancelado = true;
      deixarDeOuvir();
    };
  }, [abrirConta]);

  // Voltar e avançar do navegador entre a página de apresentação e o login.
  useEffect(() => {
    const aoNavegar = () => {
      if (telaAtual.current === "login" || telaAtual.current === "apresentacao") {
        setEstado(semSessao());
      }
    };
    window.addEventListener("popstate", aoNavegar);
    return () => window.removeEventListener("popstate", aoNavegar);
  }, []);

  // Título da aba: o da chamada principal na página de apresentação.
  useEffect(() => {
    document.title = estado.tela === "apresentacao" ? TITULO_DA_APRESENTACAO : "Ascent Legendas";
  }, [estado.tela]);

  // Da página de apresentação para o login, na aba pedida (fica no histórico).
  const irParaOLogin = useCallback((vista: VistaDoLogin) => {
    history.pushState(null, "", vista === "criar" ? "#criar-conta" : "#entrar");
    setEstado({tela: "login", vista});
  }, []);

  // Sessão expirada (o servidor respondeu 401): volta ao login.
  useEffect(() => {
    const expirou = () => {
      void sair().finally(() => setEstado({tela: "login", aviso: "Sua sessão expirou. Entre de novo."}));
    };
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, expirou);
    return () => window.removeEventListener(EVENTO_SESSAO_EXPIRADA, expirou);
  }, []);

  const sairDaConta = useCallback(() => {
    void sair().finally(() => setEstado({tela: "login"}));
  }, []);

  // O uso do plano muda depois de exportar: relê a conta no servidor.
  const atualizarConta = useCallback(() => {
    api
      .conta()
      .then((conta) => {
        if (conta) {
          setEstado((atual) => (atual.tela === "editor" ? {...atual, conta} : atual));
        }
      })
      .catch(() => undefined);
  }, []);

  switch (estado.tela) {
    case "carregando":
      return <main className="login" aria-busy="true" />;
    case "erro":
      return (
        <main className="login">
          <div className="login-caixa">
            <h1>Não foi possível abrir o app</h1>
            <p className="login-erro" role="alert">
              {estado.mensagem}
            </p>
          </div>
        </main>
      );
    case "local":
      return <App />;
    case "apresentacao":
      // Sem os números dos planos (servidor antigo), o login de sempre.
      return config?.planos ? (
        <Apresentacao planos={config.planos} onCriarConta={() => irParaOLogin("criar")} onEntrar={() => irParaOLogin("entrar")} />
      ) : (
        <TelaDeLogin google={Boolean(config?.google)} />
      );
    case "login":
      // key: a aba pedida pela página reabre a tela nela.
      return <TelaDeLogin key={estado.vista ?? "entrar"} google={Boolean(config?.google)} aviso={estado.aviso} vistaInicial={estado.vista} />;
    case "senha-nova":
      return (
        <main className="login">
          <div className="login-caixa">
            <div className="marca login-marca">
              <img src="/icones/favicon-48.png" alt="" aria-hidden="true" />
              Ascent Legendas
            </div>
            <h1>Definir senha nova</h1>
            <p className="suave">{estado.sessao.user.email}</p>
            <p className="suave">Se você usa o app na Tela de Início, depois de salvar volte para ele e entre com a senha nova.</p>
            <FormularioDeSenhaNova
              email={estado.sessao.user.email}
              textoDoBotao="Salvar e entrar"
              onPronto={() => {
                setEstado({tela: "carregando"});
                void abrirConta(estado.sessao);
              }}
            />
          </div>
        </main>
      );
    case "importar":
      return (
        <TelaImportarLocal
          videos={estado.videos}
          projeto={estado.projeto}
          onImportar={async (onAndamento) => {
            await executarTarefa("/api/importacao-local", {}, onAndamento);
            setEstado({tela: "editor", conta: estado.conta, usuario: estado.usuario});
          }}
          onPular={() => {
            try {
              localStorage.setItem(chaveDaRecusa(estado.usuario), "1");
            } catch {
              // Sem localStorage: a oferta volta no próximo login, sem problema.
            }
            setEstado({tela: "editor", conta: estado.conta, usuario: estado.usuario});
          }}
        />
      );
    case "editor":
      // key: outra conta começa com o editor do zero.
      return (
        <ContaContexto.Provider value={{conta: estado.conta, sair: sairDaConta, atualizarConta}}>
          <App key={estado.usuario} />
          {mostrarRetorno ? <RetornoDaAssinatura onFechar={() => setMostrarRetorno(false)} /> : null}
          <AvisoDoPix />
        </ContaContexto.Provider>
      );
  }
};

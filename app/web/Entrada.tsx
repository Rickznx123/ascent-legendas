// Entrada do app: sem login no servidor, o editor de sempre. Com login: a tela de
// login, depois (no primeiro login, se houver) a oferta de importar os projetos
// deste computador, e o editor da conta. Sair, ou a sessão expirar, volta ao login.
import {useCallback, useEffect, useRef, useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {App} from "./App";
import {EVENTO_SESSAO_EXPIRADA, api, executarTarefa} from "./api";
import type {Andamento, Conta} from "./api";
import {ContaContexto} from "./conta";
import {TelaDeLogin} from "./Login";
import {FormularioDeSenhaNova} from "./Senha";
import {RetornoDaAssinatura, checkoutRecente} from "./Assinatura";
import {iniciarSessao, lerConfig, ouvirSessao, pedeSenhaNova, sair} from "./sessao";
import type {ConfigDoLogin} from "./sessao";

type Estado =
  | {tela: "carregando"}
  | {tela: "erro"; mensagem: string}
  | {tela: "local"}
  | {tela: "login"; aviso?: string}
  // Veio do link "Esqueci minha senha": a sessão está aberta, falta a senha nova.
  | {tela: "senha-nova"; sessao: Session}
  | {tela: "importar"; conta: Conta; usuario: string; videos: string[]; projeto: string | null}
  | {tela: "editor"; conta: Conta; usuario: string};

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
            setEstado({tela: "login"});
          } else if (telaAtual.current === "login") {
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
        setEstado({tela: "login"});
      }
    })().catch((error: unknown) => setEstado({tela: "erro", mensagem: error instanceof Error ? error.message : String(error)}));
    return () => {
      cancelado = true;
      deixarDeOuvir();
    };
  }, [abrirConta]);

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
    case "login":
      return <TelaDeLogin google={Boolean(config?.google)} aviso={estado.aviso} />;
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
        </ContaContexto.Provider>
      );
  }
};

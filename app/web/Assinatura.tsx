// Telas da assinatura (Etapa 2c): "Assinar", o retorno do checkout do Mercado Pago,
// "Gerenciar assinatura" e os avisos. Quem decide o plano é o servidor (consultando o
// Mercado Pago, veja app/servidor/assinaturas.ts); aqui só se mostra.

// Checkout aberto neste navegador há menos de 1 hora. No app instalado do iPhone, o
// Mercado Pago abre e volta numa janela do Safari (outro armazenamento, sem a sessão):
// a volta ao app instalado não traz ?assinatura=retorno, então a marca abaixo é que
// mostra a confirmação.
const CHAVE_DO_CHECKOUT = "assinatura-checkout-aberto";
export const checkoutRecente = (): boolean => {
  try {
    const quando = Number(localStorage.getItem(CHAVE_DO_CHECKOUT));
    return Number.isFinite(quando) && quando > 0 && Date.now() - quando < 60 * 60 * 1000;
  } catch {
    return false;
  }
};
const marcarCheckout = (aberto: boolean) => {
  try {
    if (aberto) localStorage.setItem(CHAVE_DO_CHECKOUT, String(Date.now()));
    else localStorage.removeItem(CHAVE_DO_CHECKOUT);
  } catch {
    // Sem localStorage: só o ?assinatura=retorno e a verificação do servidor.
  }
};
import {useEffect, useState} from "react";
import {api} from "./api";
import type {ResumoDaAssinatura} from "./api";
import {useConta} from "./conta";

// Datas no horário de Brasília ("07/11").
const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", {day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo"});
const reais = (valor: number) => valor.toLocaleString("pt-BR", {style: "currency", currency: "BRL"});

// Aviso curto para o quadro do plano e os menus (vazio: nada a avisar).
export const avisoDaAssinatura = (resumo: ResumoDaAssinatura | undefined): string | undefined => {
  if (!resumo) return undefined;
  if (resumo.situacao === "falhou") {
    return `Não conseguimos cobrar a assinatura. Atualize a forma de pagamento no Mercado Pago${resumo.ate ? ` até ${dataCurta(resumo.ate)}` : ""} para não voltar ao plano grátis.`;
  }
  if (resumo.situacao === "cancelada") return `Assinatura cancelada: você continua assinante${resumo.ate ? ` até ${dataCurta(resumo.ate)}` : ""}.`;
  if (resumo.situacao === "ativa" && resumo.renovaEm) return `Assinatura ativa · renova em ${dataCurta(resumo.renovaEm)}.`;
  if (resumo.situacao === "cortesia") return "Assinante (cortesia, sem cobrança).";
  return undefined;
};

// O que aparece no menu da conta: "Assinar", "Gerenciar assinatura" ou nada.
export const acaoDaAssinatura = (resumo: ResumoDaAssinatura | undefined): "assinar" | "gerenciar" | undefined => {
  if (!resumo?.disponivel) return undefined;
  if (resumo.situacao === "nenhuma") return "assinar";
  if (resumo.situacao === "cortesia") return undefined;
  return "gerenciar";
};

// "Assinar": o que inclui e o botão que leva ao checkout do Mercado Pago.
export const JanelaAssinar: React.FC<{onFechar: () => void}> = ({onFechar}) => {
  const {conta} = useConta();
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string>();
  const valor = conta?.assinatura?.valor ?? 30;
  const assinar = async () => {
    setIndo(true);
    setErro(undefined);
    try {
      const {endereco} = await api.assinar();
      // O checkout é do Mercado Pago; a volta é para /?assinatura=retorno.
      marcarCheckout(true);
      window.location.href = endereco;
    } catch (error) {
      // Sem resposta do servidor (rede, ou página de erro no lugar do JSON): a mesma mensagem simples.
      setErro(error instanceof TypeError || error instanceof SyntaxError ? "Não foi possível abrir o pagamento agora. Tente de novo em instantes." : error instanceof Error ? error.message : String(error));
      setIndo(false);
    }
  };
  return (
    <div className="login janela-fundo" role="dialog" aria-modal="true" aria-labelledby="assinar-titulo">
      <div className="login-caixa">
        <h1 id="assinar-titulo">Assinar</h1>
        <p className="assinatura-preco">
          <b>{reais(valor)}</b> por mês
        </p>
        <ul className="assinatura-lista">
          <li>30 minutos de vídeo exportado por mês</li>
          <li>Vídeos sem a marca d'água</li>
          <li>Até 10 transcrições por dia</li>
        </ul>
        <p className="suave">
          Pagamento pelo Mercado Pago. Renova todo mês, no mesmo dia; cancele quando quiser e continue assinante até
          o fim do mês pago.
        </p>
        <button type="button" className="bt primario cheio" disabled={indo} onClick={() => void assinar()}>
          {indo ? "Abrindo o Mercado Pago…" : "Assinar com o Mercado Pago"}
        </button>
        <button type="button" className="bt cheio" disabled={indo} onClick={onFechar}>
          Agora não
        </button>
        {erro ? (
          <p className="login-erro" role="alert">
            {erro}
          </p>
        ) : null}
        <p className="login-legal">
          Ao assinar, você aceita os{" "}
          <a href="/termos.html" target="_blank" rel="noopener">
            Termos de uso
          </a>
          .
        </p>
      </div>
    </div>
  );
};

// "Gerenciar assinatura": a situação, a próxima cobrança e o cancelamento.
export const JanelaGerenciarAssinatura: React.FC<{onFechar: () => void}> = ({onFechar}) => {
  const {conta, atualizarConta} = useConta();
  const [resumo, setResumo] = useState(conta?.assinatura);
  const [confirmando, setConfirmando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [erro, setErro] = useState<string>();
  const cancelar = async () => {
    setCancelando(true);
    setErro(undefined);
    try {
      const {assinatura} = await api.cancelarAssinatura();
      setResumo(assinatura);
      setConfirmando(false);
      atualizarConta();
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error));
    } finally {
      setCancelando(false);
    }
  };
  return (
    <div className="login janela-fundo" role="dialog" aria-modal="true" aria-labelledby="gerenciar-titulo">
      <div className="login-caixa">
        <h1 id="gerenciar-titulo">Gerenciar assinatura</h1>
        {resumo?.situacao === "ativa" ? (
          <p>
            Assinatura ativa: {reais(resumo.valor)} por mês.
            {resumo.renovaEm ? ` A próxima cobrança é em ${dataCurta(resumo.renovaEm)}.` : ""}
          </p>
        ) : null}
        {resumo?.situacao === "cancelada" ? (
          <p>Assinatura cancelada. Você continua assinante{resumo.ate ? ` até ${dataCurta(resumo.ate)}` : ""}, sem novas cobranças.</p>
        ) : null}
        {resumo?.situacao === "falhou" ? <p className="login-erro">{avisoDaAssinatura(resumo)}</p> : null}
        {resumo?.situacao === "nenhuma" ? <p>Você está no plano grátis.</p> : null}
        <a className="bt cheio assinatura-link" href="https://www.mercadopago.com.br/subscriptions" target="_blank" rel="noopener">
          Trocar a forma de pagamento no Mercado Pago
        </a>
        {resumo?.situacao === "ativa" || resumo?.situacao === "falhou" ? (
          confirmando ? (
            <>
              <p className="suave">
                Cancelar a assinatura? Não haverá novas cobranças, e você continua assinante até o fim do mês já pago.
              </p>
              <button type="button" className="bt perigo cheio" disabled={cancelando} onClick={() => void cancelar()}>
                {cancelando ? "Cancelando…" : "Sim, cancelar a assinatura"}
              </button>
              <button type="button" className="bt cheio" disabled={cancelando} onClick={() => setConfirmando(false)}>
                Manter a assinatura
              </button>
            </>
          ) : (
            <button type="button" className="bt cheio" onClick={() => setConfirmando(true)}>
              Cancelar a assinatura
            </button>
          )
        ) : null}
        <button type="button" className="bt primario cheio" disabled={cancelando} onClick={onFechar}>
          Fechar
        </button>
        {erro ? (
          <p className="login-erro" role="alert">
            {erro}
          </p>
        ) : null}
        <p className="login-legal">Arrependeu-se? Em até 7 dias da assinatura, peça o reembolso pelo e-mail dos Termos de uso.</p>
      </div>
    </div>
  );
};

// Volta do checkout (?assinatura=retorno, ou o app reaberto depois do checkout). O
// retorno não prova o pagamento: a tela pede ao servidor que consulte o Mercado Pago
// (POST /api/assinatura/confirmar) e mostra o plano que ele decidir, ou a recusa,
// quando o Mercado Pago confirma que a cobrança foi recusada.
// Depois da espera, a tela avisa que ainda não confirmou, mas continua conferindo
// (mais devagar): a recusa pode levar minutos para aparecer no Mercado Pago.
const ESPERA_MS = 90_000;
const CONFERE_ATE_MS = 10 * 60_000;
export const RetornoDaAssinatura: React.FC<{onFechar: () => void}> = ({onFechar}) => {
  const {atualizarConta} = useConta();
  const [situacao, setSituacao] = useState<"confirmando" | "ativa" | "recusado" | "demorando">("confirmando");
  const [assinando, setAssinando] = useState(false);
  useEffect(() => {
    let parar = false;
    const inicio = Date.now();
    const conferir = async () => {
      while (!parar) {
        const resposta = await api.confirmarAssinatura().catch(() => null);
        if (resposta?.plano === "assinante" && resposta.assinatura.situacao !== "nenhuma") {
          marcarCheckout(false);
          setSituacao("ativa");
          atualizarConta();
          return;
        }
        if (resposta?.recusado) {
          marcarCheckout(false);
          setSituacao("recusado");
          return;
        }
        const passou = Date.now() - inicio;
        if (passou > CONFERE_ATE_MS) return;
        if (passou > ESPERA_MS) {
          marcarCheckout(false);
          setSituacao("demorando");
        }
        await new Promise((resolve) => setTimeout(resolve, passou > ESPERA_MS ? 15_000 : 4000));
      }
    };
    void conferir();
    return () => {
      parar = true;
    };
  }, [atualizarConta]);
  if (assinando) {
    return <JanelaAssinar onFechar={onFechar} />;
  }
  return (
    <div className="login janela-fundo" role="dialog" aria-modal="true" aria-labelledby="retorno-titulo">
      <div className="login-caixa">
        {situacao === "confirmando" ? (
          <>
            <h1 id="retorno-titulo">Confirmando sua assinatura…</h1>
            <p className="suave">Estamos esperando o Mercado Pago confirmar o pagamento. Leva alguns segundos.</p>
          </>
        ) : situacao === "ativa" ? (
          <>
            <h1 id="retorno-titulo">Assinatura ativa</h1>
            <p>Pronto! Você já pode exportar sem a marca d'água, com 30 minutos por mês.</p>
          </>
        ) : situacao === "recusado" ? (
          <>
            <h1 id="retorno-titulo">Pagamento recusado</h1>
            <p className="login-erro" role="alert">
              Pagamento recusado. Tente outro cartão ou outro meio de pagamento.
            </p>
            <button type="button" className="bt primario cheio" onClick={() => setAssinando(true)}>
              Assinar de novo
            </button>
          </>
        ) : (
          <>
            <h1 id="retorno-titulo">Ainda não confirmamos o pagamento</h1>
            <p className="suave">
              Se o pagamento foi aprovado, a assinatura aparece em alguns minutos (o quadro do plano mostra quando). Se foi
              recusado, toque em Assinar de novo e tente outra forma de pagamento.
            </p>
          </>
        )}
        <button
          type="button"
          className={`bt cheio${situacao === "recusado" ? "" : " primario"}`}
          onClick={() => {
            marcarCheckout(false);
            onFechar();
          }}
        >
          {situacao === "confirmando" ? "Fechar e continuar" : situacao === "recusado" ? "Agora não" : "Continuar"}
        </button>
      </div>
    </div>
  );
};

// Telas da assinatura (Etapa 2c) e do Pix de 30 dias (Etapa 2d): "Assinar" (cartão
// ou Pix), o retorno do checkout do Mercado Pago, o Pix dentro do app, "Gerenciar
// assinatura" e os avisos. Quem decide o plano é o servidor (consultando o
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
import type {Nivel, ResumoDaAssinatura} from "./api";
import {useConta} from "./conta";
import {JanelaPix} from "./Pix";

// Datas no horário de Brasília ("07/11").
const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", {day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo"});
const reais = (valor: number) => valor.toLocaleString("pt-BR", {style: "currency", currency: "BRL"});

// Aviso curto para o quadro do plano e os menus (vazio: nada a avisar).
export const avisoDaAssinatura = (resumo: ResumoDaAssinatura | undefined): string | undefined => {
  if (!resumo) return undefined;
  if (resumo.situacao === "falhou") {
    return `Não conseguimos cobrar a assinatura. Atualize a forma de pagamento no Mercado Pago${resumo.ate ? ` até ${dataCurta(resumo.ate)}` : ""} para não voltar ao plano grátis.`;
  }
  if (resumo.situacao === "cancelada") return `Assinatura cancelada, vale até ${resumo.ate ? dataCurta(resumo.ate) : "o fim do período"}.`;
  if (resumo.situacao === "ativa" && resumo.renovaEm) return `Assinatura ativa · renova em ${dataCurta(resumo.renovaEm)}.`;
  if (resumo.situacao === "cortesia") return "Assinante (cortesia, sem cobrança).";
  if (resumo.situacao === "pix" && resumo.ate) return `Pix · ativo até ${dataCurta(resumo.ate)}`;
  return undefined;
};

// O que aparece no menu da conta: "Assinar", "Gerenciar assinatura", "Renovar com
// Pix" ou nada.
export type AcaoDaAssinatura = "assinar" | "gerenciar" | "pix";
export const acaoDaAssinatura = (resumo: ResumoDaAssinatura | undefined): AcaoDaAssinatura | undefined => {
  if (!resumo?.disponivel) return undefined;
  if (resumo.situacao === "nenhuma") return "assinar";
  if (resumo.situacao === "cortesia") return undefined;
  if (resumo.situacao === "pix") return "pix";
  return "gerenciar";
};
// Quem assina e ainda tem um plano maior para subir (o Editor é o maior).
export const podeSubirDePlano = (resumo: ResumoDaAssinatura | undefined): boolean =>
  Boolean(
    resumo?.disponivel &&
      (resumo.situacao === "ativa" || resumo.situacao === "cancelada" || resumo.situacao === "pix") &&
      resumo.planos.findIndex((plano) => plano.nivel === resumo.nivel) < resumo.planos.length - 1,
  );

// O menor preço dos planos ("a partir de R$ 30").
export const menorPreco = (resumo: ResumoDaAssinatura | undefined): number =>
  Math.min(...(resumo?.planos.map((plano) => plano.valor) ?? []), resumo?.valor ?? 30);

export const ROTULO_DA_ACAO: Record<AcaoDaAssinatura, string> = {assinar: "Assinar", gerenciar: "Gerenciar assinatura", pix: "Renovar com Pix"};

// A janela de cada ação (para os menus).
export const JanelaDaAcao: React.FC<{acao: AcaoDaAssinatura | undefined; onFechar: () => void}> = ({acao, onFechar}) =>
  acao === "assinar" ? (
    <JanelaAssinar onFechar={onFechar} />
  ) : acao === "gerenciar" ? (
    <JanelaGerenciarAssinatura onFechar={onFechar} />
  ) : acao === "pix" ? (
    // Renovar ou subir de plano no Pix: a escolha dos planos, já no Pix.
    <JanelaAssinar onFechar={onFechar} />
  ) : null;

// Aviso de subir de plano, antes de confirmar (o servidor faz assim, veja
// app/servidor/assinaturas.ts).
export const AVISO_DE_SUBIR = "Você paga o plano novo cheio hoje e o seu mês recomeça agora.";

// "Assinar" e "Trocar de plano": os três planos para escolher (o Pro em destaque) e,
// depois, cartão ou Pix com o valor do escolhido. Quem já assina vê o plano atual
// marcado: subir abre o pagamento do plano novo (com o aviso acima); descer vale a
// partir da próxima renovação. O valor cobrado é sempre o do servidor.
export const JanelaAssinar: React.FC<{onFechar: () => void}> = ({onFechar}) => {
  const {conta, atualizarConta} = useConta();
  const resumo = conta?.assinatura;
  const planos = resumo?.planos ?? [];
  const situacao = resumo?.situacao ?? "nenhuma";
  const atual = situacao === "nenhuma" ? undefined : resumo?.nivel;
  const ordem = (nivel: Nivel | undefined) => planos.findIndex((plano) => plano.nivel === nivel);
  // Já assina: o plano acima do atual; senão, o Pro.
  const [escolhido, setEscolhido] = useState<Nivel>(() =>
    atual ? (planos.find((plano) => ordem(plano.nivel) > ordem(atual))?.nivel ?? atual) : "pro",
  );
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string>();
  const [feito, setFeito] = useState<string>();
  const [pagandoPix, setPagandoPix] = useState(false);
  const plano = planos.find((item) => item.nivel === escolhido);
  const troca = atual ? Math.sign(ordem(escolhido) - ordem(atual)) : 0;
  const desfazDescida = situacao === "ativa" && troca === 0 && Boolean(resumo?.nivelNaRenovacao);
  const podeCartao = situacao === "nenhuma" || (situacao === "ativa" && (troca !== 0 || desfazDescida)) || (situacao === "cancelada" && troca > 0);
  const podePix = situacao === "nenhuma" || (situacao === "pix" && troca >= 0);
  const sobe = troca > 0 && (situacao === "ativa" || situacao === "cancelada" || situacao === "pix");
  const nomeAtual = planos.find((item) => item.nivel === atual)?.nome;
  // Cancelada e ainda valendo: igual ou menor só quando o período acabar (o servidor
  // decide igual, em decidirPedidoDePlano).
  const ateQuando = resumo?.ate ? dataCurta(resumo.ate) : "o fim do período";
  const bloqueado = (nivel: Nivel) => situacao === "cancelada" && ordem(nivel) <= ordem(atual);

  const assinar = async () => {
    setIndo(true);
    setErro(undefined);
    try {
      const resposta = await api.assinar(escolhido);
      if (resposta.endereco) {
        // O checkout é do Mercado Pago; a volta é para /?assinatura=retorno.
        marcarCheckout(true);
        window.location.href = resposta.endereco;
        return;
      }
      // Descer (ou desfazer a descida): vale na próxima renovação, sem pagamento agora.
      atualizarConta();
      setFeito(
        troca < 0
          ? `Pronto: a partir da próxima renovação, você passa para o ${plano?.nome}${resumo?.renovaEm ? ` (em ${dataCurta(resumo.renovaEm)})` : ""}. Até lá, continua no ${nomeAtual}.`
          : `Pronto: você continua no ${plano?.nome}.`,
      );
      setIndo(false);
    } catch (error) {
      // Sem resposta do servidor (rede, ou página de erro no lugar do JSON): a mesma mensagem simples.
      setErro(error instanceof TypeError || error instanceof SyntaxError ? "Não foi possível abrir o pagamento agora. Tente de novo em instantes." : error instanceof Error ? error.message : String(error));
      setIndo(false);
    }
  };
  if (pagandoPix) return <JanelaPix nivel={escolhido} onFechar={onFechar} />;
  const rotuloDoCartao =
    situacao === "nenhuma"
      ? "Cartão (renova todo mês)"
      : troca > 0
        ? `Subir para o ${plano?.nome} no cartão`
        : troca < 0
          ? `Mudar para o ${plano?.nome} na renovação`
          : `Continuar no ${plano?.nome}`;
  return (
    <div className="login janela-fundo" role="dialog" aria-modal="true" aria-labelledby="assinar-titulo">
      <div className="login-caixa">
        <h1 id="assinar-titulo">{atual ? "Trocar de plano" : "Assinar"}</h1>
        <div className="planos-escolha" role="radiogroup" aria-label="Plano">
          {planos.map((item) => (
            <button
              key={item.nivel}
              type="button"
              role="radio"
              aria-checked={item.nivel === escolhido}
              className={`plano-opcao${item.nivel === "pro" ? " destaque" : ""}`}
              disabled={indo || bloqueado(item.nivel)}
              onClick={() => {
                setEscolhido(item.nivel);
                setFeito(undefined);
                setErro(undefined);
              }}
            >
              <span className="plano-opcao-nome">
                {item.nome}
                {item.nivel === atual ? <em className="plano-opcao-selo">Seu plano</em> : item.nivel === "pro" ? <em className="plano-opcao-selo">Mais escolhido</em> : null}
              </span>
              <span className="plano-opcao-minutos">
                {bloqueado(item.nivel) ? `Você pode assinar de novo a partir de ${ateQuando}` : `${item.minutos} min por mês`}
              </span>
              <b className="plano-opcao-preco">{reais(item.valor)}</b>
            </button>
          ))}
        </div>
        <ul className="assinatura-lista">
          <li>{plano?.minutos ?? 30} minutos de vídeo exportado por mês</li>
          <li>Vídeos sem a marca d'água</li>
          <li>Até 10 transcrições por dia</li>
        </ul>
        {sobe ? <p className="aviso-de-troca">{AVISO_DE_SUBIR}</p> : null}
        {feito ? (
          <p className="suave" role="status">
            {feito}
          </p>
        ) : null}
        {podeCartao && !feito ? (
          <div className="assinatura-opcao">
            <button type="button" className="bt primario cheio" disabled={indo} onClick={() => void assinar()}>
              {indo ? (troca < 0 || desfazDescida ? "Trocando…" : "Abrindo o Mercado Pago…") : rotuloDoCartao}
            </button>
            <p className="suave pequeno">
              {situacao === "nenhuma"
                ? "Pelo Mercado Pago. Renova todo mês, no mesmo dia; cancele quando quiser e continue assinante até o fim do mês pago."
                : troca > 0
                  ? `Quando o pagamento for aprovado, o ${nomeAtual} é cancelado sem nova cobrança. Se não for aprovado, você continua no ${nomeAtual}.`
                  : troca < 0
                    ? `Sem cobrança agora: você continua no ${nomeAtual} até a próxima renovação, que já vem com o valor do ${plano?.nome}.`
                    : "Cancela a troca agendada: a próxima renovação continua com o valor de hoje."}
            </p>
          </div>
        ) : null}
        {podePix && !feito ? (
          <div className="assinatura-opcao">
            <button type="button" className={`bt cheio${podeCartao ? "" : " primario"}`} disabled={indo} onClick={() => setPagandoPix(true)}>
              {situacao === "pix" ? (troca > 0 ? `Pix do ${plano?.nome} (começa agora)` : "Renovar com Pix (+30 dias)") : "Pix (30 dias, sem renovação)"}
            </button>
            <p className="suave pequeno">
              {plano ? reais(plano.valor) : ""} dão 30 dias de {plano?.nome}. Não renova sozinho: para continuar, pague outro Pix.
            </p>
          </div>
        ) : null}
        {!podeCartao && !podePix && !feito ? (
          <p className="suave">
            {situacao === "pix"
              ? `Você está no ${nomeAtual} pelo Pix até ${resumo?.ate ? dataCurta(resumo.ate) : "o fim do período"}. Um plano menor pode ser pago depois dessa data.`
              : situacao === "cancelada"
                ? `Assinatura cancelada, vale até ${ateQuando}. Você pode assinar de novo a partir de ${ateQuando}.`
                : `Você já está no ${nomeAtual}.`}
          </p>
        ) : null}
        <button type="button" className="bt cheio" disabled={indo} onClick={onFechar}>
          {feito ? "Fechar" : "Agora não"}
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
  const [trocando, setTrocando] = useState(false);
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
  if (trocando) return <JanelaAssinar onFechar={onFechar} />;
  const nomeDo = (nivel: Nivel | undefined) => resumo?.planos.find((plano) => plano.nivel === nivel)?.nome;
  return (
    <div className="login janela-fundo" role="dialog" aria-modal="true" aria-labelledby="gerenciar-titulo">
      <div className="login-caixa">
        <h1 id="gerenciar-titulo">Gerenciar assinatura</h1>
        {resumo?.situacao === "ativa" ? (
          <p>
            Plano {nomeDo(resumo.nivel) ?? "Básico"}: {reais(resumo.valor)} por mês.
            {resumo.renovaEm ? ` A próxima cobrança é em ${dataCurta(resumo.renovaEm)}.` : ""}
            {resumo.nivelNaRenovacao ? ` Na renovação, passa para o ${nomeDo(resumo.nivelNaRenovacao)}.` : ""}
          </p>
        ) : null}
        {resumo?.disponivel && (resumo.situacao === "ativa" || (resumo.situacao === "cancelada" && podeSubirDePlano(resumo))) ? (
          <button type="button" className="bt cheio" onClick={() => setTrocando(true)}>
            {resumo.situacao === "cancelada" ? "Assinar um plano maior" : "Trocar de plano"}
          </button>
        ) : null}
        {resumo?.situacao === "cancelada" ? (
          <p>
            {avisoDaAssinatura(resumo)} Sem novas cobranças. Você pode assinar de novo a partir de {resumo.ate ? dataCurta(resumo.ate) : "o fim do período"}
            {podeSubirDePlano(resumo) ? ", ou já agora num plano maior." : "."}
          </p>
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
  const [minutos, setMinutos] = useState<number>();
  useEffect(() => {
    let parar = false;
    const inicio = Date.now();
    const conferir = async () => {
      while (!parar) {
        const resposta = await api.confirmarAssinatura().catch(() => null);
        if (resposta?.pago && resposta.assinatura.situacao !== "nenhuma") {
          setMinutos(resposta.assinatura.planos.find((plano) => plano.nivel === resposta.assinatura.nivel)?.minutos);
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
            <p>Pronto! Você já pode exportar sem a marca d'água, com {minutos ?? 30} minutos por mês.</p>
          </>
        ) : situacao === "recusado" ? (
          <>
            <h1 id="retorno-titulo">Pagamento recusado</h1>
            <p className="login-erro" role="alert">
              Pagamento recusado. Se você estava trocando de plano, continua no plano de antes, sem nada mudar. Tente outro cartão ou outro meio de pagamento.
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

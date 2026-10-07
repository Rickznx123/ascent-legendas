// Pix de 30 dias pelo Mercado Pago (Etapa 2d): a tela do Pix dentro do app e o aviso
// de vencimento. Quem decide o plano é o servidor (consultando o Mercado Pago, veja
// app/servidor/pix.ts); aqui só se mostra.
import {useCallback, useEffect, useState} from "react";
import {api} from "./api";
import type {VistaDoPix} from "./api";
import {useConta} from "./conta";

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", {day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo"});
const reais = (valor: number) => valor.toLocaleString("pt-BR", {style: "currency", currency: "BRL"});

// CPF: 11 dígitos com os verificadores certos (a mesma conta do servidor, em pix.ts).
const cpfValido = (texto: string): boolean => {
  const cpf = texto.replace(/\D/gu, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/u.test(cpf)) return false;
  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(cpf[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]);
};
const mascaraDoCpf = (texto: string) => {
  const d = texto.replace(/\D/gu, "").slice(0, 11);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean).join(".") + (d.length > 9 ? `-${d.slice(9)}` : "");
};

const SEM_PIX = "Não foi possível gerar o Pix agora. Tente de novo em instantes.";
// Sem resposta do servidor (rede, ou página de erro no lugar do JSON): a mensagem simples.
const mensagemDoErro = (erro: unknown) => (erro instanceof TypeError || erro instanceof SyntaxError ? SEM_PIX : erro instanceof Error ? erro.message : SEM_PIX);
const codigoDoErro = (erro: unknown) => (erro as {codigo?: string} | undefined)?.codigo;

// Quanto falta até o prazo, atualizado a cada segundo (0 quando venceu).
const useFaltam = (ate: string | undefined) => {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return ate ? Math.max(0, new Date(ate).getTime() - agora) : 0;
};
// "59:07", ou "1h05" acima de uma hora.
const relogioDoPrazo = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  return horas > 0 ? `${horas}h${String(minutos).padStart(2, "0")}` : `${minutos}:${String(total % 60).padStart(2, "0")}`;
};

// O Pix dentro do app: o código copia e cola (o caminho principal no celular), o QR
// code, o prazo correndo e a conferência automática até o pagamento cair. Abre já
// gerando (ou retomando o código da conta que ainda vale).
export const JanelaPix: React.FC<{onFechar: () => void}> = ({onFechar}) => {
  const {atualizarConta} = useConta();
  const [pix, setPix] = useState<VistaDoPix>();
  const [gerando, setGerando] = useState(true);
  const [erro, setErro] = useState<string>();
  const [pedeCpf, setPedeCpf] = useState(false);
  const [cpf, setCpf] = useState("");
  const [copiado, setCopiado] = useState(false);
  const faltam = useFaltam(pix?.expiraEm);
  const venceu = pix?.estado === "vencido" || (pix?.estado === "pendente" && pix.expiraEm !== undefined && faltam === 0);

  const gerar = useCallback(async (comCpf?: string) => {
    setGerando(true);
    setErro(undefined);
    try {
      const resposta = await api.gerarPix(comCpf);
      setPix(resposta.pix);
      setPedeCpf(false);
    } catch (falha) {
      const codigo = codigoDoErro(falha);
      if (codigo === "cpf-necessario" || codigo === "cpf-invalido") setPedeCpf(true);
      setErro(mensagemDoErro(falha));
    } finally {
      setGerando(false);
    }
  }, []);
  useEffect(() => {
    void gerar();
  }, [gerar]);

  // Confere sozinha (a cada 5 s) enquanto o Pix espera o pagamento.
  const esperandoId = pix?.estado === "pendente" && !venceu ? pix.id : undefined;
  useEffect(() => {
    if (!esperandoId) return;
    let parar = false;
    const conferir = async () => {
      while (!parar) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        if (parar) return;
        const resposta = await api.conferirPix().catch(() => null);
        if (parar || resposta?.pix?.id !== esperandoId || resposta.pix.estado === "pendente") continue;
        setPix(resposta.pix);
        if (resposta.pix.estado === "aprovado") atualizarConta();
        return;
      }
    };
    void conferir();
    return () => {
      parar = true;
    };
  }, [esperandoId, atualizarConta]);

  const copiar = async () => {
    if (!pix?.qrCode) return;
    try {
      await navigator.clipboard.writeText(pix.qrCode);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sem a área de transferência: seleciona o código para copiar à mão.
      (document.getElementById("pix-codigo") as HTMLTextAreaElement | null)?.select();
    }
  };

  const enviarCpf = (evento: React.FormEvent) => {
    evento.preventDefault();
    if (!cpfValido(cpf)) {
      setErro("CPF inválido. Confira os 11 números.");
      return;
    }
    void gerar(cpf.replace(/\D/gu, ""));
  };

  const rodape = (
    <p className="login-legal">
      Sem renovação automática. Ao pagar, você aceita os{" "}
      <a href="/termos.html" target="_blank" rel="noopener">
        Termos de uso
      </a>
      .
    </p>
  );

  if (pix?.estado === "aprovado") {
    return (
      <div className="login janela-fundo" role="dialog" aria-modal="true" aria-labelledby="pix-titulo">
        <div className="login-caixa">
          <h1 id="pix-titulo">Pagamento confirmado</h1>
          <p>
            Pronto! Você é assinante{pix.periodoFim ? ` até ${dataCurta(pix.periodoFim)}` : ""}: 30 minutos exportados, sem marca d'água e até 10
            transcrições por dia.
          </p>
          <button type="button" className="bt primario cheio" onClick={onFechar}>
            Continuar
          </button>
        </div>
      </div>
    );
  }

  if (pedeCpf) {
    return (
      <div className="login janela-fundo" role="dialog" aria-modal="true" aria-labelledby="pix-titulo">
        <form className="login-caixa" onSubmit={enviarCpf}>
          <h1 id="pix-titulo">Pagar com Pix</h1>
          <p className="suave">O Mercado Pago pede o CPF de quem vai pagar. Ele vai só para o Mercado Pago: não guardamos.</p>
          <label className="pix-campo">
            <span>CPF</span>
            <input
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(evento) => setCpf(mascaraDoCpf(evento.target.value))}
            />
          </label>
          {erro ? (
            <p className="login-erro" role="alert">
              {erro}
            </p>
          ) : null}
          <button type="submit" className="bt primario cheio" disabled={gerando}>
            {gerando ? "Gerando o Pix…" : "Gerar o Pix"}
          </button>
          <button type="button" className="bt cheio" disabled={gerando} onClick={onFechar}>
            Agora não
          </button>
          {rodape}
        </form>
      </div>
    );
  }

  const pagavel = pix?.estado === "pendente" && !venceu && pix.qrCode;
  return (
    <div className="login janela-fundo" role="dialog" aria-modal="true" aria-labelledby="pix-titulo">
      <div className="login-caixa">
        <h1 id="pix-titulo">Pagar com Pix</h1>
        <p className="assinatura-preco">
          <b>{reais(pix?.valor ?? 30)}</b> · 30 dias de assinante
        </p>
        {gerando && !pix ? <p className="suave">Gerando o Pix…</p> : null}
        {pagavel ? (
          <div className="pix">
            <div className="pix-copia">
              <button type="button" className="bt primario cheio" onClick={() => void copiar()}>
                {copiado ? "Código copiado" : "Copiar código"}
              </button>
              <p className="suave pequeno">No app do seu banco, escolha Pix copia e cola e cole o código.</p>
              <textarea id="pix-codigo" className="pix-codigo" readOnly rows={3} value={pix.qrCode} aria-label="Código Pix copia e cola" />
            </div>
            {pix.qrCodeBase64 ? (
              <figure className="pix-qr">
                <img src={`data:image/png;base64,${pix.qrCodeBase64}`} alt="QR code do Pix" width={200} height={200} />
                <figcaption className="suave pequeno">Ou escaneie o QR code com o app do banco.</figcaption>
              </figure>
            ) : null}
            <p className="pix-prazo">
              Vence em <b>{relogioDoPrazo(faltam)}</b>
            </p>
            <p className="suave pequeno" aria-live="polite">
              Conferindo o pagamento… A tela muda sozinha quando o Pix cair.
            </p>
          </div>
        ) : null}
        {pix && !pagavel ? (
          <>
            <p>{venceu ? "O prazo deste código acabou. Gere outro para pagar." : "Este código não vale mais. Gere outro para pagar."}</p>
            <button type="button" className="bt primario cheio" disabled={gerando} onClick={() => void gerar()}>
              {gerando ? "Gerando…" : "Gerar outro código"}
            </button>
          </>
        ) : null}
        {erro ? (
          <p className="login-erro" role="alert">
            {erro}
          </p>
        ) : null}
        {erro && !pix ? (
          <button type="button" className="bt primario cheio" disabled={gerando} onClick={() => void gerar()}>
            Tentar de novo
          </button>
        ) : null}
        <button type="button" className="bt cheio" onClick={onFechar}>
          {pagavel ? "Fechar (o código continua valendo)" : "Fechar"}
        </button>
        {rodape}
      </div>
    </div>
  );
};

// Aviso no app de quem está no Pix: faltando 5 dias ou menos (até o dia do fim), com
// "Renovar com Pix". Fechado, volta no dia seguinte.
const CHAVE_DO_AVISO = "aviso-do-pix-fechado";
const DIA_MS = 24 * 3600 * 1000;
const hojeEmBrasilia = () => dataCurta(new Date().toISOString());
export const AvisoDoPix: React.FC = () => {
  const {conta} = useConta();
  const [renovando, setRenovando] = useState(false);
  const [fechadoEm, setFechadoEm] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_DO_AVISO) ?? "";
    } catch {
      return "";
    }
  });
  const resumo = conta?.assinatura;
  if (!resumo?.disponivel || resumo.situacao !== "pix" || !resumo.ate) return null;
  const faltaMs = new Date(resumo.ate).getTime() - Date.now();
  if (faltaMs <= 0 || faltaMs > 5 * DIA_MS) return null;
  const fim = dataCurta(resumo.ate);
  const dias = Math.ceil(faltaMs / DIA_MS);
  const texto = fim === hojeEmBrasilia() ? "Seu Pix vence hoje." : dias <= 1 ? `Seu Pix vence amanhã (${fim}).` : `Seu Pix vence em ${dias} dias (${fim}).`;
  const fechar = () => {
    const hoje = hojeEmBrasilia();
    setFechadoEm(hoje);
    try {
      localStorage.setItem(CHAVE_DO_AVISO, hoje);
    } catch {
      // Sem localStorage: fecha só até recarregar.
    }
  };
  return (
    <>
      {fechadoEm === hojeEmBrasilia() ? null : (
        <div className="aviso-pix" role="status">
          <span>{texto} Depois, a conta volta ao plano grátis.</span>
          <button type="button" className="bt primario" onClick={() => setRenovando(true)}>
            Renovar com Pix
          </button>
          <button type="button" className="ic ic-p" aria-label="Fechar aviso" onClick={fechar}>
            ✕
          </button>
        </div>
      )}
      {renovando ? <JanelaPix onFechar={() => setRenovando(false)} /> : null}
    </>
  );
};

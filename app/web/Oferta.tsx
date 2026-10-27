// Oferta "Tire a marca d'água" para o plano grátis: quando o grátis não deixa (envio,
// transcrição ou exportação, com o motivo) e logo depois do vídeo grátis pronto. O
// cupom da oferta (conta.oferta, veja /api/conta) já vai aplicado na janela de assinar.
import {useEffect, useState} from "react";
import {JanelaAssinar, menorPreco} from "./Assinatura";
import {evento} from "./api";
import {useConta} from "./conta";
import {LIMITES} from "../servidor/cota";
import {valorComDesconto} from "../servidor/cupons";

const reais = (valor: number) => valor.toLocaleString("pt-BR", {style: "currency", currency: "BRL"});

export const Oferta: React.FC<{onde: string; titulo?: string; motivo?: string; classeDoBotao?: string}> = ({
  onde,
  titulo = "Tire a marca d'água",
  motivo,
  classeDoBotao = "",
}) => {
  const {conta} = useConta();
  const [assinando, setAssinando] = useState(false);
  const resumo = conta?.assinatura;
  const disponivel = Boolean(resumo?.disponivel && resumo.situacao === "nenhuma");
  useEffect(() => {
    if (disponivel) evento("viu_oferta", {onde, cupom: conta?.oferta?.codigo ?? null});
  }, [disponivel, onde, conta?.oferta?.codigo]);
  if (!disponivel) return motivo ? <p>{motivo}</p> : null;
  const menor = menorPreco(resumo);
  const minutos = resumo?.planos.map((plano) => plano.minutos) ?? [];
  const cupom = conta?.oferta;
  return (
    <div className="oferta">
      <h2>{titulo}</h2>
      {motivo ? <p>{motivo}</p> : null}
      <ul className="assinatura-lista">
        <li>Vídeos sem a marca d'água</li>
        {minutos.length ? <li>De {Math.min(...minutos)} a {Math.max(...minutos)} minutos de vídeo por mês</li> : null}
        <li>Vídeos de até {LIMITES.envio.assinante.segundos / 60} minutos cada</li>
      </ul>
      <p className="oferta-preco">
        {cupom ? (
          <>
            1º mês a partir de <b>{reais(valorComDesconto(menor, cupom.percentual))}</b> <s className="suave">{reais(menor)}</s>
            <small className="suave"> · cupom {cupom.codigo} já aplicado</small>
          </>
        ) : (
          <>
            A partir de <b>{reais(menor)}</b> por mês
          </>
        )}
      </p>
      <button type="button" className={`bt primario ${classeDoBotao}`} onClick={() => setAssinando(true)}>
        {cupom ? `Assinar com ${cupom.percentual}% off` : "Assinar"}
      </button>
      {assinando ? <JanelaAssinar cupomInicial={cupom} onFechar={() => setAssinando(false)} /> : null}
    </div>
  );
};

// Envio ou transcrição que passou do limite do grátis: o motivo e a oferta, por cima da tela.
export const JanelaDoLimite: React.FC<{limite?: {onde: string; motivo: string}; onFechar: () => void}> = ({limite, onFechar}) =>
  limite ? (
    <div className="login janela-fundo" role="dialog" aria-modal="true" aria-label="Limite do plano grátis">
      <div className="login-caixa">
        <Oferta onde={limite.onde} titulo="Isso passa do plano grátis" motivo={limite.motivo} classeDoBotao="cheio" />
        <button type="button" className="bt cheio" onClick={onFechar}>
          Agora não
        </button>
      </div>
    </div>
  ) : null;

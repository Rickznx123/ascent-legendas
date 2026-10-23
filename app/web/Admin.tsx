// Painel do dono em /admin: a lista de assinantes e a de leads. Quem não é dono vê "Página não encontrada"
// (o servidor responde 404; a regra fica lá, em app/servidor/admin.ts).
import {useEffect, useState} from "react";
import {api} from "./api";
import type {Assinante, Lead} from "./api";

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", {timeZone: "America/Sao_Paulo"}) : "—");
const reais = (valor: number) => valor.toLocaleString("pt-BR", {style: "currency", currency: "BRL"});
const Whatsapp: React.FC<{numero: string | null}> = ({numero}) =>
  numero ? (
    <a href={`https://wa.me/${numero}`} target="_blank" rel="noopener noreferrer">
      {numero}
    </a>
  ) : (
    <>—</>
  );

export const PainelAdmin: React.FC = () => {
  const [lista, setLista] = useState<Assinante[]>();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [erro, setErro] = useState<string>();
  useEffect(() => {
    api.painelDoDono().then(
      (painel) => {
        setLista(painel.assinantes);
        setLeads(painel.leads);
      },
      () => setErro("Página não encontrada."),
    );
  }, []);
  const ativos = lista?.filter((a) => a.ativo) ?? [];
  return (
    <main className="admin">
      <header className="admin-topo">
        <h1>Assinantes</h1>
        <a className="bt" href="/">
          Voltar ao app
        </a>
      </header>
      {erro ? <p className="suave">{erro}</p> : !lista ? <p className="suave">Carregando…</p> : (
        <>
          <p className="suave">
            {ativos.length} ativos · {lista.length - ativos.length} expirados · {reais(lista.reduce((soma, a) => soma + a.pago, 0))} recebidos no total
          </p>
          <div className="admin-tabela">
            <table>
              <thead>
                <tr>
                  <th>E-mail</th>
                  <th>WhatsApp</th>
                  <th>Plano</th>
                  <th>Forma</th>
                  <th>Situação</th>
                  <th>Expira</th>
                  <th>Assina desde</th>
                  <th>Pago</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((a) => (
                  <tr key={a.email}>
                    <td>{a.email}</td>
                    <td>
                      <Whatsapp numero={a.whatsapp} />
                    </td>
                    <td>{a.plano}</td>
                    <td>{a.forma}</td>
                    <td className={a.ativo ? "admin-ativo" : "suave"}>{a.ativo ? "Ativo" : "Expirado"}</td>
                    <td>{a.forma === "Cortesia" ? "—" : data(a.expira)}</td>
                    <td>{data(a.desde)}</td>
                    <td>{reais(a.pago)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h1>Leads</h1>
          <p className="suave">
            {leads.length} contas sem assinatura · {leads.filter((l) => l.whatsapp).length} com WhatsApp · {leads.filter((l) => l.checkout).length} abriram o checkout
          </p>
          <div className="admin-tabela">
            <table>
              <thead>
                <tr>
                  <th>E-mail</th>
                  <th>WhatsApp</th>
                  <th>Cadastro</th>
                  <th>Checkout</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.email}>
                    <td>{l.email}</td>
                    <td>
                      <Whatsapp numero={l.whatsapp} />
                    </td>
                    <td>{data(l.cadastro)}</td>
                    <td className={l.checkout ? "admin-ativo" : "suave"}>{l.checkout ? "Abriu, não pagou" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
};

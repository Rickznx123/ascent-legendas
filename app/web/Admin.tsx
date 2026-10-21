// Painel do dono em /admin: a lista de assinantes. Quem não é dono vê "Página não encontrada"
// (o servidor responde 404; a regra fica lá, em app/servidor/admin.ts).
import {useEffect, useState} from "react";
import {api} from "./api";
import type {Assinante} from "./api";

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", {timeZone: "America/Sao_Paulo"}) : "—");
const reais = (valor: number) => valor.toLocaleString("pt-BR", {style: "currency", currency: "BRL"});

export const PainelAdmin: React.FC = () => {
  const [lista, setLista] = useState<Assinante[]>();
  const [erro, setErro] = useState<string>();
  useEffect(() => {
    api.assinantes().then(setLista, () => setErro("Página não encontrada."));
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
                      {a.whatsapp ? (
                        <a href={`https://wa.me/${a.whatsapp}`} target="_blank" rel="noopener noreferrer">
                          {a.whatsapp}
                        </a>
                      ) : (
                        "—"
                      )}
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
        </>
      )}
    </main>
  );
};

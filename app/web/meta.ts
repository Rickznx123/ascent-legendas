// Eventos do Pixel da Meta (carregado por /pixel.js, com o ID do servidor). Sem o
// Pixel (sem META_PIXEL_ID, ou bloqueado no navegador), não faz nada.
type Fbq = (...args: unknown[]) => void;

const rastrear = (evento: string, dados: Record<string, unknown> = {}, eventId?: string) =>
  (window as {fbq?: Fbq}).fbq?.("track", evento, dados, eventId ? {eventID: eventId} : undefined);

export const inicioDoCheckout = (valor: number | undefined) => rastrear("InitiateCheckout", {value: valor, currency: "BRL"});

// Conta criada: o navegador e o servidor mandam o mesmo event_id (a Meta junta os dois).
export const contaCriada = (usuarioId: string | undefined) => {
  // randomUUID só existe em https/localhost (o app na rede local é http).
  const eventId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  rastrear("CompleteRegistration", {}, eventId);
  if (!usuarioId) return;
  void fetch("/api/meta/cadastro", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({usuario: usuarioId, eventId})}).catch(() => undefined);
};

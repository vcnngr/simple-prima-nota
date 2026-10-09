// Unico punto di accesso all'API. Ogni chiamata porta il token del tipo di
// sessione attivo: utente -> localStorage.token, studio ->
// localStorage.commercialista_token (mai l'uno al posto dell'altro).
// Indirizzo del server: lo stesso sito (predefinito) o VITE_API_BASE alla build
// (app iOS, fase APP). E' l'unico punto da cambiare.
const BASE = `${import.meta.env.VITE_API_BASE || ''}/api`;

export const CHIAVI = {
  user: { token: 'token', account: 'user' },
  commercialista: { token: 'commercialista_token', account: 'commercialista' }
};

export class ErroreApi extends Error {
  constructor(stato, corpo) {
    super((corpo && corpo.error) || `Errore ${stato}`);
    this.stato = stato;
    this.corpo = corpo;
  }
}

export function tipoSessione() {
  const t = localStorage.getItem('user_type');
  return t === 'commercialista' ? 'commercialista' : localStorage.getItem('token') ? 'user' : null;
}

function tokenDi(tipo) {
  return tipo ? localStorage.getItem(CHIAVI[tipo].token) : null;
}

// Chi ascolta (la sessione) riporta al login quando il server rifiuta il token.
export const eventi = new EventTarget();

export async function chiama(percorso, { metodo = 'GET', corpo, params, segnale, anonimo = false } = {}) {
  const url = new URL(BASE + percorso, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }
  const tipo = tipoSessione();
  const token = anonimo ? null : tokenDi(tipo);
  const headers = { Accept: 'application/json' };
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const r = await fetch(url, {
    method: metodo,
    headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: segnale
  });
  const testo = await r.text();
  let dati = null;
  try { dati = testo ? JSON.parse(testo) : null; } catch { dati = null; }
  if (!r.ok) {
    if (r.status === 401 && token) eventi.dispatchEvent(new CustomEvent('scaduta', { detail: tipo }));
    throw new ErroreApi(r.status, dati);
  }
  return dati;
}

// config/proxy.js
// Da chi accettare X-Forwarded-For (blocco K2).
//
// req.ip decide i tetti di richieste (generale, reset password, ...). Express lo
// ricava da X-Forwarded-For fidandosi dei proxy indicati da 'trust proxy':
//   * troppo pochi (il vecchio `1` dietro ingress + nginx) -> req.ip e' l'ingress
//     per tutti e il tetto diventa globale: un utente blocca l'intera app;
//   * troppo fiducia (un numero fisso con il backend raggiungibile da fuori) ->
//     il client scrive X-Forwarded-For e sceglie il proprio indirizzo.
//
// TRUST_PROXY:
//   * N (intero): si scorrono al piu' N proxy, e solo se l'indirizzo che si sta
//     scavalcando e' privato o loopback. Un client pubblico che parla
//     direttamente col backend non e' mai un proxy: la sua X-Forwarded-For si
//     ignora. Chart Helm: 2 con ingress (ingress + nginx), 1 senza; compose: 1.
//   * 0 / false: nessun proxy, req.ip e' chi apre la connessione.
//   * elenco di indirizzi o reti ("10.0.0.0/8, 172.16.0.5"): solo quelli.
// Non impostata: 1, come prima di K2.
const proxyaddr = require('proxy-addr');

const RETI_INTERNE = proxyaddr.compile(['loopback', 'linklocal', 'uniquelocal']);

function trustProxy(valore = process.env.TRUST_PROXY) {
  const v = String(valore ?? '').trim();
  if (v === '') return trustProxy('1');
  if (/^(0|false)$/i.test(v)) return false;
  if (/^\d+$/.test(v)) {
    const n = parseInt(v, 10);
    return (addr, i) => i < n && RETI_INTERNE(addr, i);
  }
  // Un elenco non valido deve fermare l'avvio, non degradare in silenzio.
  // Anche uno vuoto (",", " , "): sarebbe "nessun proxy" senza dirlo.
  const elenco = v.split(',').map(s => s.trim()).filter(Boolean);
  if (elenco.length === 0) throw new Error(`TRUST_PROXY non valido: elenco vuoto (${JSON.stringify(v)})`);
  return proxyaddr.compile(elenco);
}

// Tetto generale delle API. In produzione 300 richieste ogni 15 minuti per IP se
// non configurato; fuori produzione largo (sviluppo e smoke).
function limiteGenerale(env = process.env) {
  const intero = (x) => (/^\d+$/.test(String(x ?? '').trim()) ? parseInt(x, 10) : null);
  return {
    windowMs: intero(env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: intero(env.RATE_LIMIT_MAX_REQUESTS) || (env.NODE_ENV === 'production' ? 300 : 10000)
  };
}

module.exports = { trustProxy, limiteGenerale };

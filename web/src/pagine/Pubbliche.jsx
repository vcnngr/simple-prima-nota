import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useSessione } from '../sessione/Sessione';
import { VOCI } from '../shell/voci';
import { accountApi } from '../api/account';
import { Campo, Errore, Esito, Invio, Scheda, messaggio, problemaPassword } from '../componenti/Modulo';

// Pagine senza sessione (U6b): registrazione, password dimenticata, link delle
// mail (reimposta password, conferma email). Stesse pagine per utente e studio.
export const PERCORSI = {
  user: { accedi: '/accedi', registrati: '/registrati', dimenticata: '/password-dimenticata' },
  commercialista: { accedi: '/studio/accedi', registrati: '/studio/registrati', dimenticata: '/studio/password-dimenticata' }
};

// Il token arriva dopo il # (non finisce nei log del server); letto una volta,
// si toglie dall'indirizzo e dalla cronologia.
function useTokenDaLink() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  useEffect(() => {
    if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
  return token;
}

export function Registrati({ tipo }) {
  const s = useSessione();
  const [d, setD] = useState({ username: '', email: '', password: '', conferma: '', ragione_sociale: '', partita_iva: '' });
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const studio = tipo === 'commercialista';
  if (s.fase === 'attiva') return <Navigate to={VOCI[s.tipo].home} replace />;
  const campo = k => ({ name: k, value: d[k], onChange: e => setD(x => ({ ...x, [k]: e.target.value })) });

  async function invia(e) {
    e.preventDefault();
    const p = problemaPassword(d.password, d.conferma);
    if (p) return setErrore(p);
    if (studio && d.partita_iva.trim() && !/^\d{11}$/.test(d.partita_iva.trim())) return setErrore('La partita IVA ha 11 cifre');
    setErrore(''); setInvio(true);
    const corpo = { username: d.username.trim(), email: d.email.trim(), password: d.password };
    if (studio) { corpo.ragione_sociale = d.ragione_sociale.trim() || null; corpo.partita_iva = d.partita_iva.trim() || null; }
    try { await s.registra(tipo, corpo); }
    catch (err) { setErrore(messaggio(err, 'Registrazione non riuscita, riprova')); }
    finally { setInvio(false); }
  }

  return (
    <Scheda titolo={studio ? 'Registra lo studio' : 'Crea il tuo account'} onSubmit={invia} data-registrati={tipo}>
      {studio && <Campo etichetta="Nome dello studio" autoComplete="organization" maxLength={200} {...campo('ragione_sociale')} />}
      <Campo etichetta="Username" autoComplete="username" required minLength={3} maxLength={studio ? 50 : 30} {...campo('username')}
        nota={studio ? 'Lettere, numeri, punto, trattino e _' : 'Lettere, numeri e _'} />
      <Campo etichetta="Email" type="email" autoComplete="email" required maxLength={100} {...campo('email')} />
      {studio && <Campo etichetta="Partita IVA (facoltativa)" inputMode="numeric" maxLength={11} {...campo('partita_iva')} />}
      <Campo etichetta="Password" type="password" autoComplete="new-password" required {...campo('password')} nota="Almeno 8 caratteri" />
      <Campo etichetta="Ripeti la password" type="password" autoComplete="new-password" required {...campo('conferma')} />
      <Errore testo={errore} />
      <Invio occupato={invio} testo="Crea l'account" testoOccupato="Creazione…" />
      <p className="text-center text-sm">Hai già un account? <Link className="text-principale underline" to={PERCORSI[tipo].accedi}>Accedi</Link></p>
    </Scheda>
  );
}

export function PasswordDimenticata({ tipo }) {
  const [id, setId] = useState('');
  const [esito, setEsito] = useState('');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  async function invia(e) {
    e.preventDefault();
    setErrore(''); setInvio(true);
    try {
      await accountApi.dimenticata(tipo, id.trim());
      // Stessa risposta che l'account esista o no (W6).
      setEsito('Se l\'account esiste, ti abbiamo scritto una mail con il link per scegliere una nuova password.');
    } catch (err) { setErrore(err.stato === 429 ? 'Troppe richieste: riprova più tardi' : messaggio(err, 'Richiesta non riuscita, riprova')); }
    finally { setInvio(false); }
  }

  return (
    <Scheda titolo="Password dimenticata" onSubmit={invia} data-dimenticata={tipo}>
      {esito ? <Esito testo={esito} /> : (
        <>
          <Campo etichetta="Username o email" name="identificativo" autoComplete="username" required maxLength={100} value={id} onChange={e => setId(e.target.value)} />
          <Errore testo={errore} />
          <Invio occupato={invio} testo="Mandami il link" testoOccupato="Invio…" />
        </>
      )}
      <p className="text-center text-sm"><Link className="text-principale underline" to={PERCORSI[tipo].accedi}>Torna all'accesso</Link></p>
    </Scheda>
  );
}

export function Reimposta({ tipo }) {
  const token = useTokenDaLink();
  const [p, setP] = useState('');
  const [c, setC] = useState('');
  const [esito, setEsito] = useState('');
  const [errore, setErrore] = useState(token ? '' : 'Link non valido o scaduto');
  const [invio, setInvio] = useState(false);

  async function invia(e) {
    e.preventDefault();
    const pb = problemaPassword(p, c);
    if (pb) return setErrore(pb);
    setErrore(''); setInvio(true);
    try { await accountApi.reimposta(tipo, token, p); setEsito('Password cambiata: accedi con quella nuova.'); }
    catch (err) { setErrore(messaggio(err, 'Cambio non riuscito, riprova')); }
    finally { setInvio(false); }
  }

  return (
    <Scheda titolo="Nuova password" onSubmit={invia} data-reimposta={tipo}>
      {esito ? <Esito testo={esito} /> : token && (
        <>
          <Campo etichetta="Nuova password" name="password" type="password" autoComplete="new-password" required value={p} onChange={e => setP(e.target.value)} nota="Almeno 8 caratteri" />
          <Campo etichetta="Ripetila" name="conferma" type="password" autoComplete="new-password" required value={c} onChange={e => setC(e.target.value)} />
        </>
      )}
      <Errore testo={errore} />
      {!esito && token && <Invio occupato={invio} testo="Cambia la password" testoOccupato="Salvataggio…" />}
      <p className="text-center text-sm">
        {!token && <><Link className="text-principale underline" to={PERCORSI[tipo].dimenticata}>Chiedi un nuovo link</Link> · </>}
        <Link className="text-principale underline" to={PERCORSI[tipo].accedi}>Accedi</Link>
      </p>
    </Scheda>
  );
}

export function ConfermaEmail({ tipo }) {
  const token = useTokenDaLink();
  const s = useSessione();
  const [stato, setStato] = useState(token ? { fase: 'invio' } : { fase: 'errore', testo: 'Link non valido o scaduto' });
  const { aggiornaAccount } = s;
  const loggato = s.fase === 'attiva' && s.tipo === tipo;

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    accountApi.confermaEmail(tipo, token)
      .then(r => { if (!vivo) return; setStato({ fase: 'ok', testo: `Indirizzo aggiornato: ${r.email}` }); if (loggato) aggiornaAccount({ email: r.email }); })
      .catch(e => vivo && setStato({ fase: 'errore', testo: messaggio(e, 'Conferma non riuscita, riprova') }));
    return () => { vivo = false; };
    // Una sola conferma per link: il token non cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tipo]);

  return (
    <Scheda titolo="Conferma dell'email" onSubmit={e => e.preventDefault()} data-conferma={stato.fase}>
      {stato.fase === 'invio' && <p role="status" className="text-tenue">Conferma in corso…</p>}
      {stato.fase === 'ok' && <Esito testo={stato.testo} />}
      {stato.fase === 'errore' && <Errore testo={stato.testo} />}
      <p className="text-center text-sm">
        <Link className="text-principale underline" to={loggato ? VOCI[tipo].impostazioni : PERCORSI[tipo].accedi}>{loggato ? 'Impostazioni' : 'Accedi'}</Link>
      </p>
    </Scheda>
  );
}

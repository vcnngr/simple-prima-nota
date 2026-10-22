import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Copy } from 'lucide-react';
import { useSessione } from '../sessione/Sessione';
import { VOCI } from '../shell/voci';
import { accountApi } from '../api/account';
import BottomSheet from '../componenti/BottomSheet';
import { Campo, Errore, Esito, Invio, messaggio, problemaPassword } from '../componenti/Modulo';
import { breve } from '../util/date';

function Sezione({ titolo, children, ...resto }) {
  return (
    <section className="space-y-3 rounded-2xl border border-bordo bg-superficie p-4" {...resto}>
      <h2 className="font-importi text-lg text-secondario">{titolo}</h2>
      {children}
    </section>
  );
}

// Un modulo con il suo stato: errore del server o esito, poi si svuota.
function useModulo(fn, { esito, svuota } = {}) {
  const [testo, setTesto] = useState('');
  const m = useMutation({ mutationFn: fn, onMutate: () => setTesto(''), onSuccess: r => { setTesto(typeof esito === 'function' ? esito(r) : esito || 'Salvato'); svuota?.(); } });
  return { ...m, esito: testo };
}

// Dati dello studio dal profilo: la risposta del login non porta P.IVA e telefono.
function Studio() {
  const prof = useQuery({ queryKey: ['account', 'profilo'], queryFn: () => accountApi.profilo('commercialista') });
  if (prof.isLoading) return <p role="status" className="text-tenue">Caricamento…</p>;
  if (prof.isError) return <Errore testo={prof.error.message} />;
  return <DatiStudio account={prof.data.commercialista} />;
}

function DatiStudio({ account }) {
  const qc = useQueryClient();
  const { aggiornaAccount } = useSessione();
  const [d, setD] = useState({ ragione_sociale: account?.ragione_sociale ?? '', partita_iva: account?.partita_iva ?? '', telefono: account?.telefono ?? '' });
  const [errore, setErrore] = useState('');
  const m = useModulo(() => accountApi.profiloStudio({
    ragione_sociale: d.ragione_sociale.trim(), partita_iva: d.partita_iva.trim(), telefono: d.telefono.trim()
  }).then(r => { aggiornaAccount(r.commercialista); qc.invalidateQueries({ queryKey: ['account'] }); return r; }), { esito: 'Dati dello studio salvati' });
  const campo = k => ({ name: k, value: d[k], onChange: e => setD(x => ({ ...x, [k]: e.target.value })) });
  return (
    <Sezione titolo="Lo studio" data-sezione="studio">
      <form className="space-y-3" onSubmit={e => {
        e.preventDefault();
        if (d.partita_iva.trim() && !/^\d{11}$/.test(d.partita_iva.trim())) return setErrore('La partita IVA ha 11 cifre');
        setErrore(''); m.mutate();
      }}>
        <Campo etichetta="Nome dello studio" maxLength={200} {...campo('ragione_sociale')} />
        <Campo etichetta="Partita IVA" inputMode="numeric" maxLength={11} {...campo('partita_iva')} />
        <Campo etichetta="Telefono" type="tel" maxLength={20} {...campo('telefono')} />
        <Errore testo={errore || (m.isError && messaggio(m.error, 'Salvataggio non riuscito'))} />
        <Esito testo={m.esito} />
        <Invio occupato={m.isPending} testo="Salva" testoOccupato="Salvataggio…" />
      </form>
    </Sezione>
  );
}

function Email() {
  const { tipo, account } = useSessione();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const m = useModulo(() => accountApi.cambiaEmail(tipo, pw, email.trim()), {
    esito: 'Ti abbiamo scritto al nuovo indirizzo: il cambio vale dopo che apri il link.', svuota: () => { setEmail(''); setPw(''); }
  });
  return (
    <Sezione titolo="Email" data-sezione="email">
      <p className="text-sm">Attuale: <b data-email-attuale>{account?.email}</b></p>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); m.mutate(); }}>
        <Campo etichetta="Nuovo indirizzo" name="nuova-email" type="email" required maxLength={100} value={email} onChange={e => setEmail(e.target.value)} />
        <Campo etichetta="Password" name="password-email" type="password" autoComplete="current-password" required value={pw} onChange={e => setPw(e.target.value)} />
        <Errore testo={m.isError && messaggio(m.error, 'Cambio non riuscito')} />
        <Esito testo={m.esito} />
        <Invio occupato={m.isPending} testo="Cambia l'email" testoOccupato="Invio…" />
      </form>
    </Sezione>
  );
}

function Password() {
  const { tipo, nuovoToken } = useSessione();
  const [d, setD] = useState({ attuale: '', nuova: '', conferma: '' });
  const [errore, setErrore] = useState('');
  const m = useModulo(() => accountApi.cambiaPassword(tipo, d.attuale, d.nuova).then(r => { nuovoToken(r.token); return r; }), {
    esito: 'Password cambiata. Gli altri dispositivi dovranno accedere di nuovo.', svuota: () => setD({ attuale: '', nuova: '', conferma: '' })
  });
  const campo = k => ({ name: `password-${k}`, type: 'password', required: true, value: d[k], onChange: e => setD(x => ({ ...x, [k]: e.target.value })) });
  return (
    <Sezione titolo="Password" data-sezione="password">
      <form className="space-y-3" onSubmit={e => {
        e.preventDefault();
        const p = problemaPassword(d.nuova, d.conferma);
        if (p) return setErrore(p);
        setErrore(''); m.mutate();
      }}>
        <Campo etichetta="Password attuale" autoComplete="current-password" {...campo('attuale')} />
        <Campo etichetta="Nuova password" autoComplete="new-password" nota="Almeno 8 caratteri" {...campo('nuova')} />
        <Campo etichetta="Ripetila" autoComplete="new-password" {...campo('conferma')} />
        <Errore testo={errore || (m.isError && messaggio(m.error, 'Cambio non riuscito'))} />
        <Esito testo={m.esito} />
        <Invio occupato={m.isPending} testo="Cambia la password" testoOccupato="Salvataggio…" />
      </form>
    </Sezione>
  );
}

const STATO_INVITO = { attivo: 'attivo', usato: 'usato', revocato: 'revocato', scaduto: 'scaduto' };

// Invito per lo studio (W2): un token alla volta, mostrato una sola volta.
function Invito() {
  const qc = useQueryClient();
  const [giorni, setGiorni] = useState(7);
  const [nuovo, setNuovo] = useState(null);
  const [copiato, setCopiato] = useState(false);
  const inviti = useQuery({ queryKey: ['inviti'], queryFn: accountApi.inviti });
  const genera = useMutation({ mutationFn: () => accountApi.generaInvito(giorni), onSuccess: r => { setNuovo(r.token); setCopiato(false); qc.invalidateQueries({ queryKey: ['inviti'] }); } });
  const revoca = useMutation({ mutationFn: accountApi.revocaInvito, onSuccess: () => { setNuovo(null); qc.invalidateQueries({ queryKey: ['inviti'] }); } });
  const elenco = inviti.data?.tokens ?? [];
  const attivo = elenco.find(t => t.stato === 'attivo');
  return (
    <Sezione titolo="Invita il tuo studio" data-sezione="invito">
      <p className="text-sm text-tenue">Dai il codice al commercialista: con questo ti manda una richiesta di collegamento, che accetti tu scegliendo cosa può vedere.</p>
      {nuovo && (
        <div className="space-y-2 rounded-xl border border-accento bg-accento/10 p-3" data-codice-nuovo>
          <p className="text-xs font-bold uppercase tracking-wide">Copialo adesso: non si vedrà più</p>
          <p className="break-all font-mono text-sm" data-codice>{nuovo}</p>
          <button type="button" data-copia onClick={() => navigator.clipboard?.writeText(nuovo).then(() => setCopiato(true)).catch(() => {})}
            className="flex items-center gap-1 rounded-lg border border-bordo bg-superficie px-3 py-1.5 text-sm">
            <Copy size={14} aria-hidden="true" /> {copiato ? 'Copiato' : 'Copia'}
          </button>
        </div>
      )}
      {!attivo && (
        <div className="flex items-end gap-2">
          <label className="text-sm">
            <span className="text-tenue">Valido per</span>
            <select name="giorni" value={giorni} onChange={e => setGiorni(Number(e.target.value))} className="mt-1 block rounded-lg border border-bordo bg-fondo px-3 py-2">
              {[1, 3, 7, 14, 30].map(g => <option key={g} value={g}>{g} {g === 1 ? 'giorno' : 'giorni'}</option>)}
            </select>
          </label>
          <button type="button" data-genera disabled={genera.isPending} onClick={() => genera.mutate()}
            className="flex-1 rounded-lg bg-principale px-4 py-2.5 font-semibold text-su-principale disabled:opacity-60">Crea il codice</button>
        </div>
      )}
      <Errore testo={(genera.isError && messaggio(genera.error, 'Codice non creato')) || (revoca.isError && messaggio(revoca.error, 'Revoca non riuscita'))} />
      {elenco.length > 0 && (
        <ul className="divide-y divide-bordo text-sm">
          {elenco.slice(0, 5).map(t => (
            <li key={t.id} className="flex items-center gap-2 py-2" data-invito={t.id} data-stato={t.stato}>
              <span className="font-mono">{t.prefisso}…</span>
              <span className="min-w-0 flex-1 truncate text-tenue">
                {STATO_INVITO[t.stato] || t.stato}{t.commercialista_nome ? ` · ${t.commercialista_nome}` : ''}{t.stato === 'attivo' && t.scadenza ? ` · fino al ${breve(String(t.scadenza).slice(0, 10))}` : ''}
              </span>
              {t.stato === 'attivo' && (
                <button type="button" data-revoca-invito={t.id} disabled={revoca.isPending} onClick={() => revoca.mutate(t.id)}
                  className="rounded-full border border-bordo px-2 py-0.5 text-xs font-bold text-uscita">Revoca</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sezione>
  );
}

function Elimina() {
  const { tipo, esci } = useSessione();
  const [aperto, setAperto] = useState(false);
  const [pw, setPw] = useState('');
  const m = useMutation({ mutationFn: () => accountApi.elimina(tipo, pw), onSuccess: esci });
  const studio = tipo === 'commercialista';
  return (
    <Sezione titolo="Elimina l'account" data-sezione="elimina">
      <p className="text-sm text-tenue">{studio
        ? 'Lo studio viene anonimizzato e i collegamenti con i clienti si chiudono. Chat e registro degli accessi restano ai clienti.'
        : 'Si cancellano conti, movimenti, controparti e categorie. I collegamenti con lo studio si chiudono. Non si torna indietro.'}</p>
      <button type="button" data-apri-elimina onClick={() => setAperto(true)} className="w-full rounded-lg border border-uscita px-4 py-2.5 font-semibold text-uscita">Elimina l'account</button>
      <BottomSheet aperto={aperto} onChiudi={() => { setAperto(false); setPw(''); m.reset(); }} titolo="Eliminare l'account?">
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (pw) m.mutate(); }}>
          <p className="text-sm">Scrivi la password per confermare. L'operazione non si annulla.</p>
          <Campo etichetta="Password" name="password-elimina" type="password" autoComplete="current-password" required value={pw} onChange={e => setPw(e.target.value)} />
          <Errore testo={m.isError && messaggio(m.error, 'Eliminazione non riuscita')} />
          <Invio pericolo occupato={m.isPending} testo="Elimina per sempre" testoOccupato="Eliminazione…" data-conferma-elimina />
        </form>
      </BottomSheet>
    </Sezione>
  );
}

// Account (U6b): dati, email, password, invito allo studio, eliminazione.
export default function Account() {
  const { tipo, account } = useSessione();
  return (
    <div className="space-y-4" data-account={tipo}>
      <div className="flex items-center gap-2">
        <Link to={VOCI[tipo].impostazioni} aria-label="Impostazioni" className="text-principale"><ChevronLeft size={22} aria-hidden="true" /></Link>
        <h1 className="font-importi text-2xl text-secondario">Account</h1>
      </div>
      <p className="text-sm text-tenue">Accedi come <b className="text-testo">{account?.username}</b></p>
      {tipo === 'commercialista' && <Studio />}
      <Email />
      <Password />
      {tipo === 'user' && <Invito />}
      <Elimina />
    </div>
  );
}

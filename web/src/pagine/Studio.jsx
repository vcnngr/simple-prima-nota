import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Paperclip, Send } from 'lucide-react';
import { studioApi } from '../api/studio';
import { useConti } from './Estratto';
import Iniziale from '../componenti/Iniziale';
import DettaglioMovimento from '../componenti/DettaglioMovimento';
import { centesimiDa, conSegno } from '../util/importi';
import { breve } from '../util/date';

const nomeStudio = c => c.ragione_sociale || c.username;

// Cosa vede lo studio: l'ambito accettato dal cliente (W1).
function ambito(c, conti) {
  const quali = c.conti_ammessi?.length
    ? c.conti_ammessi.map(id => conti.find(x => x.id === id)?.nome_banca || 'un conto disattivato').join(', ')
    : 'tutti i conti';
  const dal = c.ambito_dal ? ` dal ${breve(c.ambito_dal)}` : '';
  const al = c.ambito_al ? ` al ${breve(c.ambito_al)}` : '';
  return `vede: ${quali}${dal}${al}${!dal && !al ? ', tutto lo storico' : ''}`;
}

const STATI = { in_attesa: 'in attesa di risposta', sospesa: 'sospeso', revocata: 'chiuso', rifiutata: 'rifiutato' };

function useStudio() {
  const coll = useQuery({ queryKey: ['studio', 'collegamenti'], queryFn: studioApi.collegamenti });
  const attivo = coll.data?.collegamenti?.find(c => c.stato === 'attiva') || null;
  return { coll, attivo };
}

// Studio, lato utente (U5, variante C): cosa vede lo studio, cosa c'e' da fare,
// ultimo messaggio. La chat e' a /chat.
export function Studio() {
  const { coll, attivo } = useStudio();
  const { conti } = useConti();
  const msg = useQuery({ queryKey: ['studio', 'messaggi'], queryFn: studioApi.messaggi, enabled: !!attivo });
  const ultimo = msg.data?.messaggi?.at(-1);

  if (coll.isLoading) return <p className="text-tenue" role="status">Caricamento…</p>;
  if (coll.isError) return <p role="alert" className="text-uscita">{coll.error.message}</p>;
  if (!attivo) {
    const altri = (coll.data?.collegamenti ?? []).filter(c => STATI[c.stato] && c.stato !== 'revocata' && c.stato !== 'rifiutata');
    return (
      <div className="space-y-3 py-6 text-center" data-studio="nessuno">
        <h1 className="font-importi text-2xl text-secondario">Nessuno studio collegato</h1>
        <p className="text-tenue">Quando colleghi il tuo commercialista, qui trovi i suoi messaggi e i movimenti da chiarire.</p>
        {altri.map(c => <p key={c.id} className="text-sm">{nomeStudio(c)}: collegamento {STATI[c.stato]}.</p>)}
        <p className="text-sm text-tenue">Le richieste di collegamento si gestiscono ancora dalla versione precedente dell'app.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3" data-studio={attivo.id}>
      <section className="rounded-2xl border border-bordo bg-superficie p-4">
        <div className="flex items-center gap-3">
          <Iniziale nome={nomeStudio(attivo)} />
          <div className="min-w-0">
            <h1 className="truncate font-importi text-lg font-semibold">{nomeStudio(attivo)}</h1>
            <p className="text-xs text-tenue" data-ambito>{ambito(attivo, conti)}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link to="/chat" className="rounded-xl bg-chiarire/10 p-2.5" data-tessera="chiarire">
            <p className="importo text-2xl font-semibold text-chiarire">{msg.data?.chiarimenti_aperti ?? '–'}</p>
            <p className="text-xs">da chiarire</p>
          </Link>
          <Link to="/chat" className="rounded-xl bg-info/10 p-2.5" data-tessera="non-letti">
            <p className="importo text-2xl font-semibold text-info">{msg.data?.unread_count ?? '–'}</p>
            <p className="text-xs">messaggi nuovi</p>
          </Link>
        </div>
      </section>
      {ultimo && (
        <section className="rounded-2xl border border-bordo bg-superficie p-4" data-ultimo={ultimo.id}>
          <p className="text-xs font-bold uppercase tracking-wide text-tenue">Ultimo messaggio · {ultimo.mittente_tipo === 'user' ? 'tu' : 'lo studio'}</p>
          <p className="mt-1 line-clamp-3 text-sm">{ultimo.messaggio}</p>
        </section>
      )}
      <Link to="/chat" data-apri-chat className="block rounded-xl bg-principale py-3 text-center font-bold text-su-principale">Apri la chat</Link>
    </div>
  );
}

function Bolla({ m }) {
  const mio = m.mittente_tipo === 'user';
  const c = m.movimento ? centesimiDa(m.movimento.importo) ?? 0 : 0;
  return (
    <li data-messaggio={m.id} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mio ? 'ml-auto bg-principale text-su-principale' : 'border border-bordo bg-superficie'}`}>
      {m.movimento && (
        <p className="mb-1 border-l-[3px] border-chiarire pl-1.5 text-xs opacity-90">
          {m.movimento.descrizione} · {conSegno(m.movimento.tipo === 'Uscita' ? -c : c)} €
        </p>
      )}
      {m.movimento_nascosto && <p className="mb-1 text-xs italic opacity-80">movimento non più visibile</p>}
      <p className="whitespace-pre-wrap break-words">{m.messaggio}</p>
      {m.allegati?.map(a => <p key={a.id} className="mt-1 flex items-center gap-1 text-xs opacity-90"><Paperclip size={12} aria-hidden="true" />{a.nome}</p>)}
      <p className="mt-0.5 text-right text-[10px] opacity-70">
        {new Date(m.created_at).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        {m.chiarimento_stato === 'aperta' ? ' · da chiarire' : m.chiarimento_stato === 'risolta' ? ' · chiarito' : ''}
      </p>
    </li>
  );
}

// Chat con lo studio (U5, variante A): in cima la fascia dei movimenti da chiarire.
export function Chat() {
  const qc = useQueryClient();
  const { coll, attivo } = useStudio();
  const [testo, setTesto] = useState('');
  const [aperto, setAperto] = useState(null);
  const fondo = useRef(null);
  const msg = useQuery({ queryKey: ['studio', 'messaggi'], queryFn: studioApi.messaggi, enabled: !!attivo, refetchInterval: 15000 });
  const chi = useQuery({ queryKey: ['studio', 'chiarimenti'], queryFn: studioApi.chiarimenti, enabled: !!attivo });
  const aggiorna = () => { qc.invalidateQueries({ queryKey: ['studio'] }); qc.invalidateQueries({ queryKey: ['movimenti'] }); qc.invalidateQueries({ queryKey: ['estratto'] }); };
  const invia = useMutation({ mutationFn: () => studioApi.invia({ messaggio: testo.trim() }), onSuccess: () => { setTesto(''); aggiorna(); } });
  const risolvi = useMutation({ mutationFn: studioApi.risolvi, onSuccess: aggiorna });
  const nonLetti = msg.data?.unread_count;
  // Aprendo la chat i messaggi dello studio sono letti.
  useEffect(() => {
    if (nonLetti > 0) studioApi.letti().then(() => qc.invalidateQueries({ queryKey: ['studio', 'messaggi'] })).catch(() => {});
  }, [nonLetti, qc]);
  const n = msg.data?.messaggi?.length;
  useEffect(() => { fondo.current?.scrollIntoView({ block: 'end' }); }, [n]);

  if (coll.isLoading) return <p className="text-tenue" role="status">Caricamento…</p>;
  if (!attivo) return <p className="py-10 text-center text-tenue" data-chat="nessuno">Nessuno studio collegato. <Link to="/studio" className="text-principale">Studio</Link></p>;
  const aperti = (chi.data?.chiarimenti ?? []).filter(x => x.chiarimento_stato === 'aperta');

  return (
    <div className="-mx-4 flex min-h-full flex-col md:mx-0" data-chat={attivo.id}>
      <div className="flex items-center gap-2 border-b border-bordo bg-superficie px-4 py-2">
        <Link to="/studio" aria-label="Studio" className="text-principale"><ChevronLeft size={20} aria-hidden="true" /></Link>
        <Iniziale nome={nomeStudio(attivo)} />
        <p className="min-w-0 truncate font-bold">{nomeStudio(attivo)}</p>
      </div>
      {aperti.length > 0 && (
        <section className="mx-4 mt-3 rounded-2xl border border-chiarire bg-chiarire/10 px-3 py-2" data-fascia-chiarire={aperti.length}>
          <p className="text-xs font-bold uppercase tracking-wide text-chiarire">{aperti.length} da chiarire</p>
          <ul>
            {aperti.map(x => {
              const c = x.movimento ? centesimiDa(x.movimento.importo) ?? 0 : 0;
              return (
                <li key={x.id} className="flex items-center gap-2 py-1.5 text-sm" data-chiarimento={x.id}>
                  <button type="button" disabled={!x.movimento} onClick={() => setAperto(x.movimento.id)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate">{x.movimento ? `${x.movimento.controparte || x.movimento.descrizione} · ${breve(x.movimento.giorno)}` : x.messaggio}</span>
                  </button>
                  {x.movimento && <span className={`importo shrink-0 ${x.movimento.tipo === 'Uscita' ? 'text-uscita' : 'text-entrata'}`}>{conSegno(x.movimento.tipo === 'Uscita' ? -c : c)}</span>}
                  <button type="button" data-risolvi={x.id} disabled={risolvi.isPending} onClick={() => risolvi.mutate(x.id)}
                    className="shrink-0 rounded-full border border-bordo bg-superficie px-2 py-0.5 text-xs font-bold">Chiarito</button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <ul className="flex-1 space-y-2 px-4 py-3" aria-live="polite">
        {msg.isError && <p role="alert" className="text-uscita">{msg.error.message}</p>}
        {msg.data?.messaggi?.length === 0 && <p className="py-6 text-center text-tenue">Scrivi il primo messaggio allo studio.</p>}
        {msg.data?.messaggi?.map(m => <Bolla key={m.id} m={m} />)}
        <li ref={fondo} aria-hidden="true" />
      </ul>
      <form className="sticky bottom-0 flex items-end gap-2 border-t border-bordo bg-superficie px-3 py-2"
        onSubmit={e => { e.preventDefault(); if (testo.trim() && !invia.isPending) invia.mutate(); }}>
        <textarea name="messaggio" value={testo} onChange={e => setTesto(e.target.value)} rows={1} maxLength={5000}
          placeholder="Scrivi allo studio" aria-label="Messaggio" className="max-h-32 min-w-0 flex-1 resize-none rounded-xl border border-bordo bg-fondo px-3 py-2" />
        <button type="submit" aria-label="Invia" data-invia disabled={!testo.trim() || invia.isPending}
          className="rounded-full bg-principale p-2.5 text-su-principale disabled:opacity-40"><Send size={18} aria-hidden="true" /></button>
      </form>
      {invia.isError && <p role="alert" className="px-4 text-sm text-uscita">{invia.error.message}</p>}
      {aperto && <DettaglioMovimento id={aperto} onChiudi={() => setAperto(null)} />}
    </div>
  );
}

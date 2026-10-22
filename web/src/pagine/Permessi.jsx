import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { studioApi } from '../api/studio';
import Iniziale from '../componenti/Iniziale';
import Ambito, { ambitoValido, daCollegamento, frase, perApiAmbito, uguale, useTuttiConti } from '../componenti/Ambito';
import { nomeStudio } from '../componenti/Richiesta';

const ACCESSI = {
  lista_clienti: 'elenco dei clienti', dettaglio_cliente: 'movimenti e saldi', export: 'export',
  chat: 'chat', disconnessione: 'fine del collegamento', allegato: 'documento scaricato'
};
const quando = t => new Date(t).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function Gestione({ c }) {
  const qc = useQueryClient();
  const vai = useNavigate();
  const conti = useTuttiConti();
  const salvato = daCollegamento(c);
  const [a, setA] = useState(salvato);
  const [revoca, setRevoca] = useState(false);
  const acc = useQuery({ queryKey: ['studio', 'accessi', c.id], queryFn: () => studioApi.accessi(c.id) });
  const aggiorna = () => { qc.invalidateQueries({ queryKey: ['studio'] }); qc.invalidateQueries({ queryKey: ['movimenti'] }); };
  const ambito = useMutation({ mutationFn: () => studioApi.ambito(c.id, perApiAmbito(a)), onSuccess: aggiorna });
  const stato = useMutation({ mutationFn: () => (c.stato === 'attiva' ? studioApi.sospendi(c.id) : studioApi.riattiva(c.id)), onSuccess: aggiorna });
  const chiudi = useMutation({ mutationFn: () => studioApi.revoca(c.id), onSuccess: () => { aggiorna(); vai('/studio', { replace: true }); } });
  const occupato = ambito.isPending || stato.isPending || chiudi.isPending;
  const err = ambito.error || stato.error || chiudi.error;
  const cambiato = !uguale(a, salvato);

  return (
    <div className="space-y-3" data-permessi={c.id} data-stato={c.stato}>
      <Link to="/studio" className="inline-flex items-center gap-1 text-sm text-principale"><ChevronLeft size={16} aria-hidden="true" />Studio</Link>
      <section className="flex items-center gap-3 rounded-2xl border border-bordo bg-superficie p-4">
        <Iniziale nome={nomeStudio(c)} grande />
        <div className="min-w-0">
          <h1 className="truncate font-importi text-xl font-semibold">{nomeStudio(c)}</h1>
          <p className="truncate text-xs text-tenue">{[c.email, c.partita_iva && `P.IVA ${c.partita_iva}`].filter(Boolean).join(' · ')}</p>
          <p className={`text-xs font-bold ${c.stato === 'attiva' ? 'text-entrata' : 'text-chiarire'}`}>{c.stato === 'attiva' ? 'collegato' : 'sospeso: non vede i tuoi dati'}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-bordo bg-superficie p-4">
        <h2 className="mb-1 font-semibold">Cosa vede</h2>
        <p className="mb-3 text-sm text-tenue" data-ambito-attuale>{frase(salvato, conti)}</p>
        <Ambito valore={a} onCambia={setA} conti={conti} />
        {cambiato && (
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setA(salvato)} className="flex-1 rounded-xl border border-bordo py-2.5 font-semibold">Annulla</button>
            <button type="button" data-salva-ambito disabled={!ambitoValido(a) || occupato} onClick={() => ambito.mutate()}
              className="flex-1 rounded-xl bg-principale py-2.5 font-bold text-su-principale disabled:opacity-40">Salva</button>
          </div>
        )}
        {ambito.isSuccess && !cambiato && <p className="mt-2 text-sm text-entrata" role="status" data-ambito-salvato>Salvato.</p>}
      </section>

      <section className="rounded-2xl border border-bordo bg-superficie p-4" data-accessi={acc.data?.totale ?? ''}>
        <h2 className="mb-2 font-semibold">Ultimi accessi</h2>
        {acc.isError && <p role="alert" className="text-sm text-uscita">Registro non caricato.</p>}
        {acc.data?.accessi?.length === 0 && <p className="text-sm text-tenue">Lo studio non ha ancora guardato i tuoi dati.</p>}
        <ul className="divide-y divide-bordo text-sm">
          {acc.data?.accessi?.slice(0, 8).map(x => (
            <li key={x.id} className="flex justify-between gap-3 py-1.5"><span>{ACCESSI[x.tipo_accesso] || x.tipo_accesso}</span><span className="shrink-0 text-tenue">{quando(x.created_at)}</span></li>
          ))}
        </ul>
      </section>

      {err && <p role="alert" className="text-sm text-uscita">{err.message}</p>}
      <div className="space-y-2">
        <button type="button" data-sospendi={c.stato} disabled={occupato} onClick={() => stato.mutate()}
          className="w-full rounded-xl border border-bordo bg-superficie py-3 font-semibold">{c.stato === 'attiva' ? 'Sospendi il collegamento' : 'Riattiva il collegamento'}</button>
        {revoca ? (
          <div className="space-y-2 rounded-2xl border border-uscita p-3">
            <p className="text-sm">Lo studio non vedrà più i tuoi dati e la chat si chiude. Per ricollegarvi servirà una nuova richiesta. Il registro degli accessi resta tuo.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setRevoca(false)} className="flex-1 rounded-xl border border-bordo py-2.5 font-semibold">Annulla</button>
              <button type="button" data-revoca="conferma" disabled={occupato} onClick={() => chiudi.mutate()} className="flex-1 rounded-xl bg-uscita py-2.5 font-bold text-white">Chiudi il collegamento</button>
            </div>
          </div>
        ) : (
          <button type="button" data-revoca onClick={() => setRevoca(true)} className="w-full py-2 text-sm font-semibold text-uscita">Chiudi il collegamento…</button>
        )}
      </div>
    </div>
  );
}

// Permessi dello studio (U6a, tavola 1 A): cosa vede, accessi, sospendi, chiudi.
export default function Permessi() {
  const id = Number(useParams().id);
  const coll = useQuery({ queryKey: ['studio', 'collegamenti'], queryFn: studioApi.collegamenti });
  if (coll.isLoading) return <p className="text-tenue" role="status">Caricamento…</p>;
  const c = coll.data?.collegamenti?.find(x => x.id === id && (x.stato === 'attiva' || x.stato === 'sospesa'));
  if (!c) return <p role="alert" className="py-10 text-center text-tenue" data-permessi-assente>Collegamento non trovato o chiuso. <Link to="/studio" className="text-principale">Studio</Link></p>;
  return <Gestione key={`${c.id}-${c.stato}-${c.ambito_dal}-${c.ambito_al}-${c.conti_ammessi}`} c={c} />;
}

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Download, Paperclip, Send } from 'lucide-react';
import { studioApi } from '../api/studio';
import { salvaFile } from '../api/client';
import Iniziale from '../componenti/Iniziale';
import DettaglioMovimento from '../componenti/DettaglioMovimento';
import Richiesta, { nomeStudio } from '../componenti/Richiesta';
import { daCollegamento, frase, useTuttiConti } from '../componenti/Ambito';
import { centesimiDa, conSegno } from '../util/importi';
import { breve } from '../util/date';

const STATI = { in_attesa: 'in attesa di risposta', sospesa: 'sospeso', revocata: 'chiuso', rifiutata: 'rifiutato' };
// Tipi ammessi dal server (AllegatiService); dimensione e quota le controlla lui.
const ACCETTA = '.pdf,.png,.jpg,.jpeg,.xlsx,.csv,application/pdf,image/png,image/jpeg,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function useStudio() {
  const coll = useQuery({ queryKey: ['studio', 'collegamenti'], queryFn: studioApi.collegamenti });
  const tutti = coll.data?.collegamenti ?? [];
  const attivo = tutti.find(c => c.stato === 'attiva') || null;
  return { coll, tutti, attivo };
}

// Peso in decimi di MB come interi (regola U4: niente virgola mobile formattata).
const peso = b => {
  if (b < 1048576) return `${Math.max(1, Math.round(b / 1024))} kB`;
  const d = Math.round(b / 104857.6);
  return `${Math.floor(d / 10)},${d % 10} MB`;
};

// Download con il token: il file arriva come blob e si salva col suo nome.
function useScarica() {
  return useMutation({ mutationFn: id => studioApi.scarica(id).then(salvaFile) });
}

// Studio, lato utente (U5 variante C; U6a): richieste da accettare in 3 passi,
// cosa vede lo studio, cosa c'e' da fare, ultimo messaggio. La chat e' a /chat,
// periodo, conti, sospensione e chiusura a /studio/permessi/:id.
export function Studio() {
  const { coll, tutti, attivo } = useStudio();
  const conti = useTuttiConti();
  const [richiesta, setRichiesta] = useState(null);
  const principale = attivo || tutti.find(c => c.stato === 'sospesa') || null;
  const msg = useQuery({ queryKey: ['studio', 'messaggi'], queryFn: studioApi.messaggi, enabled: !!attivo });
  const qc = useQueryClient();
  const riattiva = useMutation({ mutationFn: studioApi.riattiva, onSuccess: () => qc.invalidateQueries({ queryKey: ['studio'] }) });
  const ultimo = msg.data?.messaggi?.at(-1);

  if (coll.isLoading) return <p className="text-tenue" role="status">Caricamento…</p>;
  if (coll.isError) return <p role="alert" className="text-uscita">{coll.error.message}</p>;
  const richieste = tutti.filter(c => c.stato === 'in_attesa');
  const altri = tutti.filter(c => c !== principale && c.stato === 'sospesa');

  return (
    <div className="space-y-3" data-studio={principale ? principale.id : 'nessuno'}>
      {richieste.map(c => (
        <section key={c.id} className="flex items-center gap-3 rounded-2xl border border-info bg-info/10 p-3" data-richiesta={c.id}>
          <Iniziale nome={nomeStudio(c)} />
          <p className="min-w-0 flex-1 text-sm"><b className="block truncate">{nomeStudio(c)}</b>chiede di collegarsi</p>
          <button type="button" data-rispondi={c.id} onClick={() => setRichiesta(c)} className="shrink-0 rounded-xl bg-principale px-3 py-2 text-sm font-bold text-su-principale">Rispondi</button>
        </section>
      ))}
      {richiesta && <Richiesta key={richiesta.id} c={richiesta} onChiudi={() => setRichiesta(null)} />}

      {!principale && (
        <div className="space-y-3 py-6 text-center">
          <h1 className="font-importi text-2xl text-secondario">Nessuno studio collegato</h1>
          <p className="text-tenue">Quando il tuo commercialista ti manda una richiesta di collegamento, la trovi qui: scegli tu cosa può vedere.</p>
          {tutti.filter(c => c.stato === 'revocata' || c.stato === 'rifiutata').slice(0, 3).map(c => <p key={c.id} className="text-sm text-tenue">{nomeStudio(c)}: collegamento {STATI[c.stato]}.</p>)}
        </div>
      )}

      {principale && (
        <section className="rounded-2xl border border-bordo bg-superficie p-4">
          <div className="flex items-center gap-3">
            <Iniziale nome={nomeStudio(principale)} />
            <div className="min-w-0">
              <h1 className="truncate font-importi text-lg font-semibold">{nomeStudio(principale)}</h1>
              <p className="text-xs text-tenue" data-ambito>vede: {frase(daCollegamento(principale), conti)}</p>
            </div>
          </div>
          {principale.stato === 'sospesa' ? (
            <div className="mt-3 space-y-2 rounded-xl bg-chiarire/10 p-3 text-sm" data-sospeso>
              <p>Collegamento sospeso: lo studio non vede i tuoi dati e la chat è ferma.</p>
              <button type="button" data-riattiva disabled={riattiva.isPending} onClick={() => riattiva.mutate(principale.id)}
                className="rounded-lg bg-principale px-3 py-1.5 font-bold text-su-principale">Riattiva</button>
              {riattiva.isError && <p role="alert" className="text-uscita">{riattiva.error.message}</p>}
            </div>
          ) : (
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
          )}
        </section>
      )}
      {attivo && ultimo && (
        <section className="rounded-2xl border border-bordo bg-superficie p-4" data-ultimo={ultimo.id}>
          <p className="text-xs font-bold uppercase tracking-wide text-tenue">Ultimo messaggio · {ultimo.mittente_tipo === 'user' ? 'tu' : 'lo studio'}</p>
          <p className="mt-1 line-clamp-3 text-sm">{ultimo.messaggio || ultimo.allegati?.[0]?.nome}</p>
        </section>
      )}
      {principale && (
        <div className="flex gap-2">
          {attivo && <Link to="/chat" data-apri-chat className="flex-1 rounded-xl bg-principale py-3 text-center font-bold text-su-principale">Apri la chat</Link>}
          <Link to={`/studio/permessi/${principale.id}`} data-apri-permessi className="flex-1 rounded-xl border border-bordo bg-superficie py-3 text-center font-bold">Permessi</Link>
        </div>
      )}
      {altri.map(c => (
        <Link key={c.id} to={`/studio/permessi/${c.id}`} data-altro-studio={c.id} className="block rounded-xl border border-bordo p-3 text-sm">
          {nomeStudio(c)}: collegamento sospeso · permessi
        </Link>
      ))}
    </div>
  );
}

function Bolla({ m, onScarica }) {
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
      {m.messaggio && <p className="whitespace-pre-wrap break-words">{m.messaggio}</p>}
      {m.allegati?.map(a => (
        <button key={a.id} type="button" data-allegato={a.id} onClick={() => onScarica(a.id)}
          className={`mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${mio ? 'bg-white/15' : 'bg-fondo'}`}>
          <Paperclip size={14} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{a.nome}</span><span className="shrink-0 opacity-75">{peso(a.dimensione)}</span>
        </button>
      ))}
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
  const [scheda, setScheda] = useState('messaggi');
  const fondo = useRef(null);
  const file = useRef(null);
  const scarica = useScarica();
  const doc = useQuery({ queryKey: ['studio', 'documenti'], queryFn: studioApi.documenti, enabled: !!attivo && scheda === 'documenti' });
  const msg = useQuery({ queryKey: ['studio', 'messaggi'], queryFn: studioApi.messaggi, enabled: !!attivo, refetchInterval: 15000 });
  const chi = useQuery({ queryKey: ['studio', 'chiarimenti'], queryFn: studioApi.chiarimenti, enabled: !!attivo });
  const aggiorna = () => { qc.invalidateQueries({ queryKey: ['studio'] }); qc.invalidateQueries({ queryKey: ['movimenti'] }); qc.invalidateQueries({ queryKey: ['estratto'] }); };
  const invia = useMutation({ mutationFn: () => studioApi.invia({ messaggio: testo.trim() }), onSuccess: () => { setTesto(''); aggiorna(); } });
  const risolvi = useMutation({ mutationFn: studioApi.risolvi, onSuccess: aggiorna });
  // 📎: il file parte subito, con il testo gia' scritto come messaggio.
  const allega = useMutation({
    mutationFn: f => studioApi.allega({ file: f, messaggio: testo.trim() }),
    onSuccess: () => { setTesto(''); aggiorna(); },
    onSettled: () => { if (file.current) file.current.value = ''; }
  });
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
      <div className="flex border-b border-bordo bg-superficie" role="tablist">
        {[['messaggi', 'Messaggi'], ['documenti', 'Documenti']].map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={scheda === k} data-scheda={k} onClick={() => setScheda(k)}
            className={`flex-1 py-2.5 text-sm ${scheda === k ? 'border-b-[3px] border-principale font-bold text-principale' : 'text-tenue'}`}>{t}</button>
        ))}
      </div>
      {scheda === 'documenti' && (
        <div className="flex-1 px-4 py-3" data-documenti={doc.data?.documenti?.length ?? ''}>
          {doc.isLoading && <p className="text-tenue" role="status">Caricamento…</p>}
          {doc.isError && <p role="alert" className="text-uscita">{doc.error.message}</p>}
          {doc.data?.documenti?.length === 0 && <p className="py-6 text-center text-tenue">Nessun documento. Si mandano dalla 📎 della chat.</p>}
          <ul className="divide-y divide-bordo">
            {doc.data?.documenti?.map(d => (
              <li key={d.id}>
                <button type="button" data-documento={d.id} onClick={() => scarica.mutate(d.id)} className="flex w-full items-center gap-3 py-3 text-left">
                  <Download size={18} aria-hidden="true" className="shrink-0 text-principale" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{d.nome}</span>
                    <span className="block truncate text-xs text-tenue">
                      {d.mittente_tipo === 'user' ? 'tu' : 'lo studio'} · {new Date(d.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} · {peso(d.dimensione)}
                      {d.movimento ? ` · ${d.movimento.descrizione}, ${breve(d.movimento.giorno)}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {scarica.isError && <p role="alert" className="text-sm text-uscita">{scarica.error.message}</p>}
        </div>
      )}
      {scheda === 'messaggi' && <>
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
        {msg.data?.messaggi?.map(m => <Bolla key={m.id} m={m} onScarica={id => scarica.mutate(id)} />)}
        <li ref={fondo} aria-hidden="true" />
      </ul>
      <form className="sticky bottom-0 flex items-end gap-2 border-t border-bordo bg-superficie px-3 py-2"
        onSubmit={e => { e.preventDefault(); if (testo.trim() && !invia.isPending) invia.mutate(); }}>
        <input ref={file} type="file" name="file" accept={ACCETTA} hidden data-file
          onChange={e => { const f = e.target.files?.[0]; if (f && !allega.isPending) allega.mutate(f); }} />
        <button type="button" aria-label="Allega un file" data-allega disabled={allega.isPending} onClick={() => file.current?.click()}
          className="rounded-full p-2.5 text-principale disabled:opacity-40"><Paperclip size={20} aria-hidden="true" /></button>
        <textarea name="messaggio" value={testo} onChange={e => setTesto(e.target.value)} rows={1} maxLength={5000}
          placeholder="Scrivi allo studio" aria-label="Messaggio" className="max-h-32 min-w-0 flex-1 resize-none rounded-xl border border-bordo bg-fondo px-3 py-2" />
        <button type="submit" aria-label="Invia" data-invia disabled={!testo.trim() || invia.isPending}
          className="rounded-full bg-principale p-2.5 text-su-principale disabled:opacity-40"><Send size={18} aria-hidden="true" /></button>
      </form>
      {(invia.isError || allega.isError || scarica.isError) && <p role="alert" className="px-4 text-sm text-uscita">{(invia.error || allega.error || scarica.error).message}</p>}
      {allega.isPending && <p role="status" className="px-4 text-sm text-tenue">Invio del file…</p>}
      </>}
      {aperto && <DettaglioMovimento id={aperto} onChiudi={() => setAperto(null)} />}
    </div>
  );
}

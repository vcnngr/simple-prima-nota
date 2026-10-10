import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, SlidersHorizontal, Users, X } from 'lucide-react';
import { registroApi } from '../api/registro';
import BottomSheet from '../componenti/BottomSheet';
import ListaInfinita from '../componenti/ListaInfinita';
import RigaMovimento from '../componenti/RigaMovimento';
import DettaglioMovimento from '../componenti/DettaglioMovimento';
import { aggiornaRegistro } from '../componenti/ModuloMovimento';
import { datiRiga, perGiorno } from '../componenti/righe/comune';
import { nomeConto, useConti } from './Estratto';
import { centesimiDa, formatta } from '../util/importi';
import { etichettaGiorno, etichettaPeriodo, periodo } from '../util/date';

// Filtri nell'indirizzo (si condividono e sopravvivono al ritorno indietro).
const CHIAVI = ['q', 'tipo', 'conto', 'dal', 'al', 'controparte', 'chiarire'];
const GIORNO = /^\d{4}-\d{2}-\d{2}$/;

function leggiFiltri(p) {
  const f = {};
  for (const k of CHIAVI) { const v = p.get(k); if (v) f[k] = v; }
  if (f.tipo && !['Entrata', 'Uscita'].includes(f.tipo)) delete f.tipo;
  for (const k of ['conto', 'controparte']) if (f[k] && !/^[1-9]\d{0,9}$/.test(f[k])) delete f[k];
  for (const k of ['dal', 'al']) if (f[k] && !GIORNO.test(f[k])) delete f[k];
  if (f.chiarire !== '1') delete f.chiarire;
  return f;
}

// Per l'API: nomi del server.
function perApi(f) {
  return {
    search: f.q, tipo: f.tipo, conto_id: f.conto, data_inizio: f.dal, data_fine: f.al,
    anagrafica_id: f.controparte, da_chiarire: f.chiarire ? 'true' : undefined
  };
}

function Chip({ attiva, onClick, children, ...resto }) {
  return (
    <button type="button" onClick={onClick} {...resto}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${
        attiva ? 'border-principale bg-principale font-bold text-su-principale' : 'border-bordo bg-superficie'}`}>
      {children}
    </button>
  );
}

const PERIODI = [['mese', 'Questo mese'], ['mese_scorso', 'Mese scorso'], ['anno', "Quest'anno"], ['tutto', 'Sempre']];

// Pannello dei filtri: si lavora su una bozza, «Mostra» la applica.
function PannelloFiltri({ filtri, conti, onApplica, onChiudi }) {
  const [b, setB] = useState(filtri);
  const metti = (k, v) => setB(x => { const y = { ...x }; if (v) y[k] = v; else delete y[k]; return y; });
  const sceltaPeriodo = PERIODI.find(([k]) => { const p = periodo(k); return (p.dal ?? undefined) === b.dal && (p.al ?? undefined) === b.al; })?.[0];
  return (
    <BottomSheet aperto onChiudi={onChiudi} titolo="Filtri"
      piede={<button type="button" data-applica onClick={() => onApplica(b)} className="h-12 w-full rounded-xl bg-principale font-bold text-su-principale">Mostra i movimenti</button>}>
      <div className="space-y-4" data-pannello-filtri>
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-tenue">Periodo</h3>
          <div className="flex flex-wrap gap-2">
            {PERIODI.map(([k, e]) => (
              <Chip key={k} attiva={sceltaPeriodo === k} data-periodo={k}
                onClick={() => { const p = periodo(k); metti('dal', p.dal); metti('al', p.al); }}>{e}</Chip>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input type="date" aria-label="Dal" value={b.dal ?? ''} onChange={e => metti('dal', e.target.value)} name="dal"
              className="min-w-0 flex-1 rounded-xl border border-bordo bg-fondo px-3 py-2" />
            <input type="date" aria-label="Al" value={b.al ?? ''} onChange={e => metti('al', e.target.value)} name="al"
              className="min-w-0 flex-1 rounded-xl border border-bordo bg-fondo px-3 py-2" />
          </div>
        </section>
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-tenue">Tipo</h3>
          <div className="flex gap-2">
            <Chip attiva={!b.tipo} onClick={() => metti('tipo')}>Tutti</Chip>
            <Chip attiva={b.tipo === 'Entrata'} data-filtro-tipo="Entrata" onClick={() => metti('tipo', 'Entrata')}>Entrate</Chip>
            <Chip attiva={b.tipo === 'Uscita'} data-filtro-tipo="Uscita" onClick={() => metti('tipo', 'Uscita')}>Uscite</Chip>
          </div>
        </section>
        {conti.length > 1 && (
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-tenue">Conto</h3>
            <div className="flex flex-wrap gap-2">
              <Chip attiva={!b.conto} onClick={() => metti('conto')}>Tutti</Chip>
              {conti.map(c => <Chip key={c.id} attiva={b.conto === String(c.id)} data-filtro-conto={c.id} onClick={() => metti('conto', String(c.id))}>{nomeConto(c)}</Chip>)}
            </div>
          </section>
        )}
        <label className="flex items-center justify-between gap-3 rounded-xl border border-bordo px-3 py-2.5">
          <span>Solo quelli da chiarire con lo studio</span>
          <input type="checkbox" checked={!!b.chiarire} onChange={e => metti('chiarire', e.target.checked ? '1' : null)} className="h-5 w-5" data-filtro-chiarire />
        </label>
      </div>
    </BottomSheet>
  );
}

// Eliminazione con 5 secondi per annullare (scorrimento, variante C).
function useEliminaDopo() {
  const qc = useQueryClient();
  const [inAttesa, setInAttesa] = useState(null); // { id, timer }
  const [errore, setErrore] = useState(null);
  const ref = useRef(null);
  ref.current = inAttesa;

  const esegui = async id => {
    setInAttesa(x => (x?.id === id ? null : x));
    try { await registroApi.elimina(id); } catch (e) { setErrore(e.message); }
    aggiornaRegistro(qc);
  };
  const elimina = id => {
    if (ref.current) { clearTimeout(ref.current.timer); esegui(ref.current.id); }
    setErrore(null);
    setInAttesa({ id, timer: setTimeout(() => esegui(id), 5000) });
  };
  const annulla = () => { if (ref.current) clearTimeout(ref.current.timer); setInAttesa(null); };
  // Lasciando la pagina l'eliminazione chiesta si compie subito.
  useEffect(() => () => { if (ref.current) { clearTimeout(ref.current.timer); registroApi.elimina(ref.current.id).finally(() => aggiornaRegistro(qc)); } }, [qc]);
  return { nascosto: inAttesa?.id, elimina, annulla, errore, chiudiErrore: () => setErrore(null) };
}

export default function Movimenti() {
  const [params, setParams] = useSearchParams();
  const filtri = useMemo(() => leggiFiltri(params), [params]);
  const { conti } = useConti();
  const [testo, setTesto] = useState(filtri.q ?? '');
  const [pannello, setPannello] = useState(false);
  const [aperto, setAperto] = useState(null); // { id, modo }
  const el = useEliminaDopo();

  const imposta = f => setParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v)), { replace: true });
  const togli = (...k) => { const f = { ...filtri }; for (const x of k) delete f[x]; imposta(f); };

  // Ricerca mentre si scrive, con un attimo di respiro.
  useEffect(() => {
    const t = setTimeout(() => { if ((filtri.q ?? '') !== testo.trim()) imposta({ ...filtri, q: testo.trim() }); }, 300);
    return () => clearTimeout(t);
  }, [testo]); // eslint-disable-line react-hooks/exhaustive-deps

  const nomeControparte = useQuery({
    queryKey: ['controparte', Number(filtri.controparte)], enabled: !!filtri.controparte,
    queryFn: () => registroApi.controparte(filtri.controparte)
  }).data?.nome;

  const lista = useInfiniteQuery({
    queryKey: ['movimenti', filtri],
    initialPageParam: undefined,
    queryFn: ({ pageParam }) => registroApi.movimenti({ dopo: pageParam, filtri: perApi(filtri) }),
    getNextPageParam: p => p.pagination?.cursore ?? undefined
  });
  const righe = useMemo(() => (lista.data?.pages ?? []).flatMap(p => p.movimenti).filter(m => m.id !== el.nascosto).map(datiRiga),
    [lista.data, el.nascosto]);
  const tot = lista.data?.pages?.[0]?.totali;
  const conto = conti.find(c => String(c.id) === filtri.conto);
  const etichette = [
    (filtri.dal || filtri.al) && { k: ['dal', 'al'], e: etichettaPeriodo(filtri.dal, filtri.al) },
    filtri.tipo && { k: ['tipo'], e: filtri.tipo === 'Entrata' ? 'Entrate' : 'Uscite' },
    filtri.conto && { k: ['conto'], e: conto ? conto.nome_banca : 'Conto' },
    filtri.controparte && { k: ['controparte'], e: nomeControparte || 'Controparte' },
    filtri.chiarire && { k: ['chiarire'], e: 'Da chiarire' }
  ].filter(Boolean);

  return (
    <div className="-mx-4 md:mx-0" data-pagina="movimenti">
      <div className="flex items-center gap-2 px-4">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-bordo bg-superficie px-3 py-2">
          <Search size={18} aria-hidden="true" className="text-tenue" />
          <input name="cerca" value={testo} onChange={e => setTesto(e.target.value)} maxLength={100} autoComplete="off"
            placeholder="Cerca descrizione, controparte…" aria-label="Cerca nei movimenti" className="min-w-0 flex-1 bg-transparent outline-none" />
          {testo && <button type="button" aria-label="Svuota la ricerca" onClick={() => setTesto('')}><X size={16} aria-hidden="true" /></button>}
        </label>
        <Link to="/controparti" aria-label="Controparti" data-link-controparti className="rounded-xl border border-bordo bg-superficie p-2.5">
          <Users size={20} aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-2 flex gap-2 overflow-x-auto px-4 pb-2" data-etichette>
        <Chip attiva={etichette.length > 0} onClick={() => setPannello(true)} data-apri-filtri>
          <SlidersHorizontal size={14} aria-hidden="true" />Filtri{etichette.length ? ` · ${etichette.length}` : ''}
        </Chip>
        {etichette.map(x => (
          <Chip key={x.k[0]} attiva onClick={() => togli(...x.k)} aria-label={`Togli il filtro ${x.e}`} data-togli={x.k[0]}>
            {x.e}<X size={14} aria-hidden="true" />
          </Chip>
        ))}
        {!etichette.length && (
          <>
            <Chip onClick={() => imposta({ ...filtri, ...periodo('mese') })} data-rapido="mese">Questo mese</Chip>
            <Chip onClick={() => imposta({ ...filtri, tipo: 'Uscita' })} data-rapido="uscite">Uscite</Chip>
            <Chip onClick={() => imposta({ ...filtri, tipo: 'Entrata' })} data-rapido="entrate">Entrate</Chip>
          </>
        )}
      </div>

      {tot && (
        <div className="flex justify-between gap-2 border-y border-bordo bg-superficie px-4 py-2 text-[13px]" data-totali={tot.numero_movimenti}>
          <span className="text-tenue">{tot.numero_movimenti} moviment{tot.numero_movimenti === '1' ? 'o' : 'i'}</span>
          <span className="importo text-entrata">entrate {formatta(centesimiDa(tot.totale_entrate) ?? 0)}</span>
          <span className="importo text-uscita">uscite {formatta(centesimiDa(tot.totale_uscite) ?? 0)}</span>
        </div>
      )}

      <ListaInfinita altre={!!lista.hasNextPage} caricando={lista.isFetchingNextPage} onAltre={() => lista.fetchNextPage()}
        vuota={lista.isSuccess && righe.length === 0 && (
          <p className="px-4 py-10 text-center text-tenue" data-vuota>Nessun movimento{etichette.length || filtri.q ? ' con questi filtri' : ''}.</p>
        )}>
        {lista.isError && <p role="alert" className="px-4 text-uscita">{lista.error.message}</p>}
        {perGiorno(righe).map(g => (
          <section key={g.giorno} data-giorno={g.giorno}>
            <h3 className="px-4 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-tenue">{etichettaGiorno(g.giorno)}</h3>
            <ul className="divide-y divide-bordo border-y border-bordo">
              {g.righe.map(r => (
                <RigaMovimento key={r.id} r={r} onApri={id => setAperto({ id, modo: 'vedi' })}
                  onStudio={id => setAperto({ id, modo: 'studio' })} onElimina={el.elimina} />
              ))}
            </ul>
          </section>
        ))}
      </ListaInfinita>

      {(el.nascosto || el.errore) && (
        <div role="status" data-avviso-elimina className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl bg-secondario px-4 py-3 text-sm text-fondo shadow-lg md:bottom-6">
          {el.errore
            ? <><span>Non eliminato: {el.errore}</span><button type="button" onClick={el.chiudiErrore} className="font-bold">OK</button></>
            : <><span>Movimento eliminato</span><button type="button" data-annulla onClick={el.annulla} className="font-bold text-accento">Annulla</button></>}
        </div>
      )}

      {pannello && <PannelloFiltri filtri={filtri} conti={conti} onChiudi={() => setPannello(false)}
        onApplica={f => { imposta({ ...f, q: filtri.q }); setPannello(false); }} />}
      {aperto && <DettaglioMovimento key={`${aperto.id}-${aperto.modo}`} id={aperto.id} modo={aperto.modo} onChiudi={() => setAperto(null)} />}
    </div>
  );
}

import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { registroApi } from '../api/registro';
import { useSessione } from '../sessione/Sessione';
import ListaInfinita from '../componenti/ListaInfinita';
import RigheEstratto from '../componenti/righe/Righe';
import DettaglioMovimento from '../componenti/DettaglioMovimento';
import { centesimiDa, formatta } from '../util/importi';

// Conti come carte da sfogliare (U6a, tavola 4 C): si scorre di lato, sotto i
// movimenti della carta in vista. ✎ e ＋ aprono la pagina del conto (tavola 4 B).
export default function Conti() {
  const { preferenze } = useSessione();
  const q = useQuery({ queryKey: ['conti', 'tutti'], queryFn: registroApi.tuttiConti });
  const conti = useMemo(() => (q.data ?? []).slice().sort((a, b) => (b.attivo === a.attivo ? 0 : a.attivo ? -1 : 1)), [q.data]);
  const [indice, setIndice] = useState(0);
  const [aperto, setAperto] = useState(null);
  const nastro = useRef(null);
  const conto = conti[Math.min(indice, conti.length - 1)] || null;
  const totale = conti.filter(c => c.attivo).reduce((s, c) => s + (centesimiDa(c.saldo_corrente) ?? 0), 0);

  const lista = useInfiniteQuery({
    queryKey: ['estratto', conto?.id], enabled: !!conto, initialPageParam: undefined,
    queryFn: ({ pageParam }) => registroApi.movimenti({ conto: conto.id, dopo: pageParam }),
    getNextPageParam: p => p.pagination?.cursore ?? undefined
  });
  const movimenti = useMemo(() => (lista.data?.pages ?? []).flatMap(p => p.movimenti), [lista.data]);

  // La carta in vista e' quella piu' vicina al bordo sinistro del nastro.
  const scorri = () => {
    const n = nastro.current;
    const prima = n?.firstElementChild;
    if (!prima) return;
    const passo = prima.getBoundingClientRect().width + 12;
    setIndice(Math.max(0, Math.round(n.scrollLeft / passo)));
  };

  if (q.isLoading) return <p className="text-tenue" role="status">Caricamento…</p>;
  if (q.isError) return <p role="alert" className="text-uscita">Conti non caricati, riprova.</p>;

  return (
    <div className="-mx-4 md:mx-0" data-conti={conti.length}>
      <div className="flex items-baseline justify-between px-4">
        <h1 className="font-importi text-2xl text-secondario">Conti</h1>
        <p className="text-sm text-tenue">totale <span className="importo font-semibold text-testo" data-totale-conti={totale}>{formatta(totale)} €</span></p>
      </div>
      <div ref={nastro} onScroll={scorri} data-nastro
        className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
        {conti.map((c, i) => {
          const saldo = centesimiDa(c.saldo_corrente) ?? 0;
          return (
            <section key={c.id} data-carta-conto={c.id} aria-current={i === indice}
              className={`relative w-[82%] shrink-0 snap-start rounded-2xl p-4 text-su-principale shadow ${c.attivo ? 'bg-principale' : 'bg-neutro'}`}>
              <p className="truncate pr-9 text-sm opacity-90">{c.nome_banca}{c.attivo ? '' : ' · disattivato'}</p>
              <p className="importo mt-3 text-[28px] font-semibold" data-saldo-carta={saldo}>{formatta(saldo)} €</p>
              <p className="mt-2 truncate text-xs opacity-80">{c.intestatario}{c.iban ? ` · ${c.iban.replace(/\s/g, '').replace(/(.{4})(?=.)/g, '$1 ')}` : ''}</p>
              <Link to={`/conti/${c.id}`} aria-label={`Modifica ${c.nome_banca}`} data-modifica-conto={c.id}
                className="absolute right-3 top-3 rounded-full bg-white/20 p-1.5"><Pencil size={16} aria-hidden="true" /></Link>
            </section>
          );
        })}
        <Link to="/conti/nuovo" data-nuovo-conto
          className="flex w-[60%] shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-bordo p-4 text-principale">
          <Plus size={28} aria-hidden="true" /><span className="font-semibold">Nuovo conto</span>
        </Link>
      </div>
      {conti.length > 1 && (
        <div className="flex justify-center gap-1.5 py-1" aria-hidden="true">
          {conti.map((c, i) => <span key={c.id} className={`h-1.5 rounded-full ${i === indice ? 'w-4 bg-principale' : 'w-1.5 bg-bordo'}`} />)}
        </div>
      )}

      {conto ? (
        <>
          <h2 className="px-4 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-tenue" data-movimenti-di={conto.id}>Movimenti · {conto.nome_banca}</h2>
          <ListaInfinita altre={!!lista.hasNextPage} caricando={lista.isFetchingNextPage} onAltre={() => lista.fetchNextPage()}
            vuota={lista.isSuccess && movimenti.length === 0 && <p className="px-4 py-6 text-center text-tenue">Nessun movimento su questo conto.</p>}>
            {lista.isError && <p role="alert" className="px-4 text-uscita">Movimenti non caricati, riprova.</p>}
            <RigheEstratto movimenti={movimenti} vista={preferenze?.vista_estratto} onApri={setAperto} />
          </ListaInfinita>
        </>
      ) : (
        <p className="px-4 py-10 text-center text-tenue" data-conti-vuoto>Nessun conto. Tocca «Nuovo conto» per crearne uno.</p>
      )}
      {aperto && <DettaglioMovimento id={aperto} onChiudi={() => setAperto(null)} />}
    </div>
  );
}

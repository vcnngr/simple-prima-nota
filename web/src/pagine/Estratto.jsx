import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { registroApi } from '../api/registro';
import { useSessione } from '../sessione/Sessione';
import BottomSheet from '../componenti/BottomSheet';
import ListaInfinita from '../componenti/ListaInfinita';
import RigheEstratto from '../componenti/righe/Righe';
import DettaglioMovimento from '../componenti/DettaglioMovimento';
import { centesimiDa, formatta } from '../util/importi';

// Ultimo conto guardato: lo propone anche il nuovo movimento.
export const CHIAVE_CONTO = 'pn_conto';

export function useConti() {
  const q = useQuery({ queryKey: ['conti'], queryFn: registroApi.conti });
  const [scelto, setScelto] = useState(() => Number(localStorage.getItem(CHIAVE_CONTO)) || null);
  const conti = q.data ?? [];
  const conto = conti.find(c => c.id === scelto) || conti[0] || null;
  const scegli = id => { localStorage.setItem(CHIAVE_CONTO, String(id)); setScelto(id); };
  return { ...q, conti, conto, scegli };
}

export const nomeConto = c => (c ? c.nome_banca + (c.intestatario ? ` · ${c.intestatario}` : '') : '');

// Estratto di un conto: saldo, righe nella vista scelta dall'account, cursore.
export default function Estratto() {
  const { preferenze } = useSessione();
  const { conti, conto, scegli, isLoading, isError } = useConti();
  const [sceltaConto, setSceltaConto] = useState(false);
  const [aperto, setAperto] = useState(null);

  const lista = useInfiniteQuery({
    queryKey: ['estratto', conto?.id],
    enabled: !!conto,
    initialPageParam: undefined,
    queryFn: ({ pageParam }) => registroApi.movimenti({ conto: conto.id, dopo: pageParam }),
    getNextPageParam: p => p.pagination?.cursore ?? undefined
  });
  const movimenti = useMemo(() => (lista.data?.pages ?? []).flatMap(p => p.movimenti), [lista.data]);

  if (isLoading) return <p className="text-tenue" role="status">Caricamento…</p>;
  if (isError) return <p role="alert" className="text-uscita">Conti non caricati, riprova.</p>;
  if (!conto) {
    return (
      <div className="space-y-2 py-10 text-center" data-estratto="senza-conti">
        <h1 className="font-importi text-2xl text-secondario">Nessun conto</h1>
        <p className="text-tenue">Aggiungi un conto per iniziare a registrare i movimenti.</p>
        <Link to="/conti/nuovo" data-primo-conto className="inline-block rounded-xl bg-principale px-4 py-2.5 font-bold text-su-principale">+ Nuovo conto</Link>
      </div>
    );
  }
  const saldo = centesimiDa(conto.saldo_corrente) ?? 0;

  return (
    <div className="-mx-4 md:mx-0" data-estratto={conto.id}>
      <section className="px-4 pb-2">
        <p className="text-xs uppercase tracking-wider text-tenue">Saldo · {conto.nome_banca}</p>
        <p className={`importo text-[32px] font-semibold ${saldo < 0 ? 'text-uscita' : ''}`} data-saldo={saldo}>{formatta(saldo)} €</p>
        <button type="button" onClick={() => setSceltaConto(true)} data-scegli-conto
          className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full border border-bordo bg-superficie px-3 py-0.5 text-xs">
          <span className="truncate">Conto: {nomeConto(conto)}</span><ChevronDown size={14} aria-hidden="true" />
        </button>
      </section>

      <ListaInfinita
        altre={!!lista.hasNextPage}
        caricando={lista.isFetchingNextPage}
        onAltre={() => lista.fetchNextPage()}
        vuota={lista.isSuccess && movimenti.length === 0 && (
          <p className="px-4 py-10 text-center text-tenue">Nessun movimento su questo conto. Tocca + per registrarne uno.</p>
        )}
      >
        {lista.isError && <p role="alert" className="px-4 text-uscita">Movimenti non caricati, riprova.</p>}
        <RigheEstratto movimenti={movimenti} vista={preferenze?.vista_estratto} onApri={setAperto} />
      </ListaInfinita>

      {aperto && <DettaglioMovimento id={aperto} onChiudi={() => setAperto(null)} />}

      <BottomSheet aperto={sceltaConto} onChiudi={() => setSceltaConto(false)} titolo="Scegli il conto">
        <ul className="divide-y divide-bordo">
          {conti.map(c => (
            <li key={c.id}>
              <button type="button" data-conto={c.id} onClick={() => { scegli(c.id); setSceltaConto(false); }}
                className={`flex w-full items-center justify-between gap-3 py-3 text-left ${c.id === conto.id ? 'font-bold text-principale' : ''}`}>
                <span className="min-w-0 truncate">{nomeConto(c)}</span>
                <span className="importo shrink-0">{formatta(centesimiDa(c.saldo_corrente) ?? 0)} €</span>
              </button>
            </li>
          ))}
        </ul>
        <Link to="/conti" data-gestisci-conti className="mt-2 block py-2 text-center text-sm font-semibold text-principale">Gestisci i conti</Link>
      </BottomSheet>
    </div>
  );
}

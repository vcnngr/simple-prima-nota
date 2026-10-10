import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { registroApi } from '../api/registro';
import ListaInfinita from '../componenti/ListaInfinita';
import Iniziale from '../componenti/Iniziale';
import { centesimiDa, conSegno } from '../util/importi';

const ORDINI = [['uso', 'Più movimenti'], ['recente', 'Recenti'], ['nome', 'A–Z']];

// Controparti (U5, variante B): schede con il totale, le piu' movimentate in
// cima; A–Z come ordinamento. Tocco su una scheda: la scheda della controparte.
export default function Controparti() {
  const [testo, setTesto] = useState('');
  const [q, setQ] = useState('');
  const [ordina, setOrdina] = useState('uso');
  useEffect(() => { const t = setTimeout(() => setQ(testo.trim()), 250); return () => clearTimeout(t); }, [testo]);

  const lista = useInfiniteQuery({
    queryKey: ['controparti', q, ordina],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => registroApi.elenco({ q, ordina, offset: pageParam }),
    getNextPageParam: p => (p.altri ? p.offset + p.limit : undefined)
  });
  const voci = useMemo(() => (lista.data?.pages ?? []).flatMap(p => p.anagrafiche), [lista.data]);
  const totale = lista.data?.pages?.[0]?.totale;

  return (
    <div className="space-y-3" data-pagina="controparti">
      <h1 className="font-importi text-2xl text-secondario">Controparti</h1>
      <label className="flex items-center gap-2 rounded-xl border border-bordo bg-superficie px-3 py-2">
        <Search size={18} aria-hidden="true" className="text-tenue" />
        <input name="cerca" value={testo} onChange={e => setTesto(e.target.value)} maxLength={100} autoComplete="off"
          placeholder={totale != null && !q ? `Cerca fra ${totale} controparti` : 'Cerca controparte'} aria-label="Cerca controparte"
          className="min-w-0 flex-1 bg-transparent outline-none" />
        {testo && <button type="button" aria-label="Svuota la ricerca" onClick={() => setTesto('')}><X size={16} aria-hidden="true" /></button>}
      </label>
      <div className="flex gap-2" role="radiogroup" aria-label="Ordine">
        {ORDINI.map(([k, e]) => (
          <button key={k} type="button" role="radio" aria-checked={ordina === k} data-ordina={k} onClick={() => setOrdina(k)}
            className={`rounded-full border px-3 py-1.5 text-sm ${ordina === k ? 'border-principale bg-principale font-bold text-su-principale' : 'border-bordo bg-superficie'}`}>{e}</button>
        ))}
      </div>
      <ListaInfinita altre={!!lista.hasNextPage} caricando={lista.isFetchingNextPage} onAltre={() => lista.fetchNextPage()}
        vuota={lista.isSuccess && voci.length === 0 && <p className="py-10 text-center text-tenue">Nessuna controparte{q ? ' trovata' : ''}.</p>}>
        {lista.isError && <p role="alert" className="text-uscita">{lista.error.message}</p>}
        <ul className="space-y-2">
          {voci.map(a => {
            const netto = (centesimiDa(a.totale_entrate) ?? 0) - (centesimiDa(a.totale_uscite) ?? 0);
            return (
              <li key={a.id}>
                <Link to={`/controparti/${a.id}`} data-controparte={a.id}
                  className="flex items-center gap-3 rounded-2xl border border-bordo bg-superficie p-3">
                  <Iniziale nome={a.nome} tono={a.tipo_movimento_preferito === 'Entrata' ? 'entrata' : a.tipo_movimento_preferito === 'Uscita' ? 'uscita' : 'info'} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{a.nome}</span>
                    <span className="block truncate text-xs text-tenue">
                      {a.numero_movimenti ? `${a.numero_movimenti} moviment${a.numero_movimenti === 1 ? 'o' : 'i'}` : 'Nessun movimento'}
                      {a.tipologia_nome ? ` · ${a.tipologia_nome}` : ''}{a.attivo ? '' : ' · disattivata'}
                    </span>
                  </span>
                  {a.numero_movimenti > 0 && (
                    <span className="shrink-0 text-right">
                      <span className={`importo block font-semibold ${netto < 0 ? 'text-uscita' : 'text-entrata'}`} data-netto={netto}>{conSegno(netto)} €</span>
                      <span className="block text-[11px] text-tenue">in totale</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </ListaInfinita>
    </div>
  );
}

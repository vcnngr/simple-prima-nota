import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { registroApi } from '../api/registro';
import Iniziale from '../componenti/Iniziale';
import ListaInfinita from '../componenti/ListaInfinita';
import RigaMovimento from '../componenti/RigaMovimento';
import DettaglioMovimento from '../componenti/DettaglioMovimento';
import { datiRiga } from '../componenti/righe/comune';
import { centesimiDa, conSegno, formatta } from '../util/importi';
import { meseDi, oggi } from '../util/date';

const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

// Scheda della controparte (U5, variante C): ultimi 12 mesi, media, andamento
// mensile, i suoi movimenti; «+ Movimento» parte gia' con lei.
export default function Controparte() {
  const id = Number(useParams().id);
  const valido = Number.isInteger(id) && id > 0 && id <= 2147483647;
  const [aperto, setAperto] = useState(null);
  const a = useQuery({ queryKey: ['controparte', id], queryFn: () => registroApi.controparte(id), enabled: valido });
  const mesi = useQuery({
    queryKey: ['report', 'mesi', 'controparte', id],
    queryFn: () => registroApi.mesi({ fino: meseDi(oggi()), mesi: 12, controparte: id }), enabled: valido
  });
  const lista = useInfiniteQuery({
    queryKey: ['movimenti', { controparte: String(id) }], enabled: valido,
    initialPageParam: undefined,
    queryFn: ({ pageParam }) => registroApi.movimenti({ dopo: pageParam, filtri: { anagrafica_id: id } }),
    getNextPageParam: p => p.pagination?.cursore ?? undefined
  });
  const righe = useMemo(() => (lista.data?.pages ?? []).flatMap(p => p.movimenti).map(datiRiga), [lista.data]);

  if (!valido || a.isError) return <p role="alert" className="py-10 text-center text-tenue" data-controparte-assente>Controparte non trovata. <Link to="/controparti" className="text-principale">Torna alle controparti</Link></p>;
  if (a.isLoading) return <p className="text-tenue" role="status">Caricamento…</p>;
  const c = a.data;

  // Netto per mese, dal piu' vecchio; le barre misurano il valore assoluto.
  const serie = (mesi.data?.mesi ?? []).slice().reverse().map(m => ({
    mese: m.mese, netto: (centesimiDa(m.entrate) ?? 0) - (centesimiDa(m.uscite) ?? 0)
  }));
  const anno = serie.reduce((s, m) => s + m.netto, 0);
  const massimo = Math.max(1, ...serie.map(m => Math.abs(m.netto)));
  const tipo = c.tipo_movimento_preferito || c.tipo_movimento_default;
  const tono = anno < 0 || (!anno && tipo === 'Uscita') ? 'uscita' : 'entrata';

  return (
    <div className="-mx-4 md:mx-0" data-scheda-controparte={c.id}>
      <Link to="/controparti" className="mb-2 inline-flex items-center gap-1 px-4 text-sm text-principale"><ChevronLeft size={16} aria-hidden="true" />Controparti</Link>
      <section className="border-y border-bordo bg-superficie px-4 py-4">
        <div className="flex items-center gap-3">
          <Iniziale nome={c.nome} tono={tono} grande />
          <div className="min-w-0">
            <h1 className="truncate font-importi text-[22px] font-semibold">{c.nome}</h1>
            <p className="truncate text-sm text-tenue">{[c.tipologia_nome, tipo && tipo !== 'Entrambi' ? `di solito ${tipo}` : null, c.categoria].filter(Boolean).join(' · ') || '—'}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-fondo p-2.5">
            <p className="text-xs text-tenue">Ultimi 12 mesi</p>
            <p className={`importo text-xl font-semibold ${anno < 0 ? 'text-uscita' : 'text-entrata'}`} data-anno={anno}>{conSegno(anno)} €</p>
          </div>
          <div className="rounded-xl bg-fondo p-2.5">
            <p className="text-xs text-tenue">Media al mese</p>
            <p className="importo text-xl font-semibold" data-media>{formatta(Math.round(Math.abs(anno) / 12))} €</p>
          </div>
        </div>
        {serie.length > 0 && (
          <>
            <div className="mt-3 flex h-14 items-end gap-1" role="img" aria-label="Andamento degli ultimi 12 mesi" data-barre={serie.length}>
              {serie.map((m, i) => (
                <span key={m.mese} title={`${m.mese}: ${conSegno(m.netto)} €`}
                  className={`flex-1 rounded-sm ${m.netto < 0 ? 'bg-uscita' : 'bg-entrata'} ${i === serie.length - 1 ? '' : 'opacity-35'}`}
                  style={{ height: `${m.netto ? Math.max(6, Math.round(Math.abs(m.netto) / massimo * 100)) : 2}%` }} />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-tenue">
              <span>{MESI_BREVI[Number(serie[0].mese.slice(5)) - 1]}</span><span>{MESI_BREVI[Number(serie[serie.length - 1].mese.slice(5)) - 1]}</span>
            </div>
          </>
        )}
        <div className="mt-3 flex gap-2">
          <Link to={`/nuovo?controparte=${c.id}`} data-nuovo-con className="flex-1 rounded-xl bg-principale py-2.5 text-center font-bold text-su-principale">+ Movimento</Link>
          <Link to={`/movimenti?controparte=${c.id}`} className="flex-1 rounded-xl border border-bordo py-2.5 text-center font-bold">Filtra i movimenti</Link>
        </div>
      </section>

      <h2 className="px-4 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-tenue">Movimenti</h2>
      <ListaInfinita altre={!!lista.hasNextPage} caricando={lista.isFetchingNextPage} onAltre={() => lista.fetchNextPage()}
        vuota={lista.isSuccess && righe.length === 0 && <p className="px-4 py-6 text-center text-tenue">Ancora nessun movimento.</p>}>
        <ul className="divide-y divide-bordo border-y border-bordo">
          {righe.map(r => (
            <RigaMovimento key={r.id} r={{ ...r, chi: r.cosa || r.chi, cosa: '' }}
              onApri={x => setAperto({ id: x, modo: 'vedi' })} onStudio={x => setAperto({ id: x, modo: 'studio' })}
              onElimina={x => setAperto({ id: x, modo: 'vedi' })} />
          ))}
        </ul>
      </ListaInfinita>
      {aperto && <DettaglioMovimento key={`${aperto.id}-${aperto.modo}`} id={aperto.id} modo={aperto.modo} onChiudi={() => setAperto(null)} />}
    </div>
  );
}

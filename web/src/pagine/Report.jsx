import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import { registroApi } from '../api/registro';
import BottomSheet from '../componenti/BottomSheet';
import { nomeConto, useConti } from './Estratto';
import { centesimiDa, conSegno, formatta } from '../util/importi';
import { estremiMese, etichettaMese, meseDi, mesePrima, oggi } from '../util/date';

const CHIAVE = 'pn_report_conto';
const c = v => centesimiDa(v) ?? 0;

// Conto del report: tutti (predefinito) o uno, ricordato sul dispositivo.
function useContoReport() {
  const { conti } = useConti();
  const [id, setId] = useState(() => Number(localStorage.getItem(CHIAVE)) || null);
  const conto = conti.find(x => x.id === id) || null;
  const scegli = v => { if (v) localStorage.setItem(CHIAVE, String(v)); else localStorage.removeItem(CHIAVE); setId(v); };
  return { conti, conto, scegli };
}

function SceltaConto({ conti, conto, scegli }) {
  const [aperto, setAperto] = useState(false);
  if (conti.length < 2) return null;
  return (
    <>
      <button type="button" onClick={() => setAperto(true)} data-report-conto
        className="inline-flex max-w-[55%] items-center gap-1 rounded-full border border-bordo bg-superficie px-3 py-1 text-sm">
        <span className="truncate">{conto ? conto.nome_banca : 'Tutti i conti'}</span><ChevronDown size={14} aria-hidden="true" />
      </button>
      <BottomSheet aperto={aperto} onChiudi={() => setAperto(false)} titolo="Conto del report">
        <ul className="divide-y divide-bordo">
          {[null, ...conti].map(x => (
            <li key={x?.id ?? 0}>
              <button type="button" data-report-conto-scelta={x?.id ?? 'tutti'} onClick={() => { scegli(x?.id ?? null); setAperto(false); }}
                className={`w-full py-3 text-left ${(x?.id ?? null) === (conto?.id ?? null) ? 'font-bold text-principale' : ''}`}>
                {x ? nomeConto(x) : 'Tutti i conti'}
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </>
  );
}

function Barra({ valore, massimo, classe }) {
  return (
    <div className="h-2 flex-1 rounded-full bg-fondo">
      <div className={`h-2 rounded-full ${classe}`} style={{ width: `${valore ? Math.max(2, Math.round(valore / massimo * 100)) : 0}%` }} />
    </div>
  );
}

// Report (U5, variante C): una scheda per mese, dal piu' recente. Tocco: il mese.
export function Report() {
  const sc = useContoReport();
  const corrente = meseDi(oggi());
  const q = useQuery({
    queryKey: ['report', 'mesi', corrente, sc.conto?.id ?? null],
    queryFn: () => registroApi.mesi({ fino: corrente, mesi: 12, conto: sc.conto?.id })
  });
  const mesi = q.data?.mesi ?? [];
  const massimo = Math.max(1, ...mesi.flatMap(m => [c(m.entrate), c(m.uscite)]));

  return (
    <div className="space-y-3" data-pagina="report">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-importi text-2xl text-secondario">Mese per mese</h1>
        <SceltaConto {...sc} />
      </div>
      {q.isLoading && <p className="text-tenue" role="status">Caricamento…</p>}
      {q.isError && <p role="alert" className="text-uscita">{q.error.message}</p>}
      <ul className="space-y-2">
        {mesi.map(m => {
          const e = c(m.entrate), u = c(m.uscite);
          return (
            <li key={m.mese}>
              <Link to={`/report/${m.mese}`} data-mese={m.mese} data-netto={e - u}
                className="block rounded-2xl border border-bordo bg-superficie p-3">
                <div className="flex justify-between gap-3">
                  <span className="font-bold">{etichettaMese(m.mese, m.mese.slice(0, 4) !== corrente.slice(0, 4))}{m.mese === corrente ? ' (in corso)' : ''}</span>
                  <span className={`importo font-semibold ${e - u < 0 ? 'text-uscita' : 'text-entrata'}`}>{m.numero ? `${conSegno(e - u)} €` : '—'}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-xs">
                  <span className="w-3 text-entrata" aria-hidden="true">▲</span>
                  <Barra valore={e} massimo={massimo} classe="bg-entrata" />
                  <span className="importo w-24 text-right">{formatta(e)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="w-3 text-uscita" aria-hidden="true">▼</span>
                  <Barra valore={u} massimo={massimo} classe="bg-uscita" />
                  <span className="importo w-24 text-right">{formatta(u)}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Le voci oltre le prime 6 diventano «Altro».
function prime(voci) {
  if (voci.length <= 7) return voci;
  const resto = voci.slice(6);
  return [...voci.slice(0, 6), { nome: `Altro (${resto.length})`, totale: resto.reduce((s, v) => s + c(v.totale), 0) / 100, numero: 0 }];
}

function Voci({ titolo, voci, massimo, classe, mese }) {
  if (!voci.length) return null;
  const { dal, al } = estremiMese(mese);
  return (
    <section>
      <h2 className="mb-1 mt-4 text-xs font-bold uppercase tracking-wide text-tenue">{titolo}</h2>
      <ul className="space-y-2">
        {prime(voci).map(v => {
          const t = c(v.totale);
          const testo = (
            <>
              <span className="flex justify-between gap-3 text-sm"><span className="min-w-0 truncate">{v.nome}</span><span className="importo shrink-0">{formatta(t)}</span></span>
              <span className="mt-0.5 block h-2.5 rounded-full bg-fondo"><span className={`block h-2.5 rounded-full ${classe}`} style={{ width: `${Math.max(2, Math.round(t / massimo * 100))}%` }} /></span>
            </>
          );
          return (
            <li key={v.nome} data-voce={v.nome}>
              {v.anagrafica_id
                ? <Link to={`/movimenti?controparte=${v.anagrafica_id}&dal=${dal}&al=${al}`} className="block">{testo}</Link>
                : testo}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Un mese (U5, variante A): saldo del mese, chi ha pagato, dove sono andati i soldi.
export function ReportMese() {
  const { mese } = useParams();
  const sc = useContoReport();
  const valido = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(mese || '');
  const q = useQuery({
    queryKey: ['report', 'mese', mese, sc.conto?.id ?? null], enabled: valido,
    queryFn: () => registroApi.mese({ mese, conto: sc.conto?.id })
  });
  if (!valido) return <Navigate to="/report" replace />;
  const corrente = meseDi(oggi());
  // Sei mesi fino al corrente; un mese piu' vecchio o futuro sta in fondo ai suoi.
  const fine = mese > corrente || mese < mesePrima(corrente, 5) ? mese : corrente;
  const scelte = [5, 4, 3, 2, 1, 0].map(n => mesePrima(fine, n));
  const t = q.data?.totali;
  const e = c(t?.entrate), u = c(t?.uscite);
  const massimo = Math.max(1, ...(q.data?.entrate ?? []).map(v => c(v.totale)), ...(q.data?.uscite ?? []).map(v => c(v.totale)));

  return (
    <div data-pagina="report-mese" data-mese={mese}>
      <div className="flex items-center justify-between gap-3">
        <Link to="/report" className="inline-flex items-center gap-1 text-sm text-principale"><ChevronLeft size={16} aria-hidden="true" />Mese per mese</Link>
        <SceltaConto {...sc} />
      </div>
      <nav className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Mesi">
        {scelte.map(m => (
          <Link key={m} to={`/report/${m}`} replace aria-current={m === mese ? 'page' : undefined}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${m === mese ? 'border-principale bg-principale font-bold text-su-principale' : 'border-bordo bg-superficie'}`}>
            {etichettaMese(m, false).slice(0, 3).toLowerCase()}
          </Link>
        ))}
      </nav>
      <p className="mt-3 text-sm text-tenue">{etichettaMese(mese)}</p>
      {q.isError && <p role="alert" className="text-uscita">{q.error.message}</p>}
      {t && (
        <>
          <p className={`importo text-[30px] font-semibold ${e - u < 0 ? 'text-uscita' : 'text-entrata'}`} data-netto-mese={e - u}>{conSegno(e - u)} €</p>
          <p className="text-sm text-tenue">entrate <span className="importo">{formatta(e)}</span> − uscite <span className="importo">{formatta(u)}</span></p>
          {t.numero === 0 && <p className="py-8 text-center text-tenue">Nessun movimento in questo mese.</p>}
          <Voci titolo="Entrano" voci={q.data.entrate} massimo={massimo} classe="bg-entrata" mese={mese} />
          <Voci titolo="Escono" voci={q.data.uscite} massimo={massimo} classe="bg-uscita" mese={mese} />
        </>
      )}
    </div>
  );
}

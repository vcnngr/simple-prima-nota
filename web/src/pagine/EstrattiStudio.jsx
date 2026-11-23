import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { portaleApi } from '../api/portale';
import BottomSheet from '../componenti/BottomSheet';
import { centesimiDa, conSegno, formatta } from '../util/importi';
import { breve, etichettaMese, meseDi, mesePrima, oggi } from '../util/date';

// Estratti conto dei clienti (U9b, tavole 3 B + C): griglia clienti x mesi con
// lo stato delle righe della banca; un clic su una cella apre le righe di quel
// mese del cliente, con «Chiedi» su quelle non ancora descritte.

const valido = id => { const n = Number(id); return Number.isInteger(n) && n > 0 && n <= 2147483647 ? n : null; };
const MESE = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/;
const segnato = r => { const c = centesimiDa(r.importo) ?? 0; return r.tipo === 'Uscita' ? -c : c; };

// Una cella: ✓ tutto descritto, N da descrivere, «≠ saldo», «—» niente caricato.
function Cella({ x }) {
  if (!x || (!x.righe && !x.estratti)) return <span className="text-tenue" data-stato="vuota">—</span>;
  return (
    <span className="inline-flex flex-col items-center leading-tight">
      {x.da_descrivere > 0
        ? <b className="importo rounded-full bg-accento px-2 text-su-accento" data-stato="descrivere">{x.da_descrivere}</b>
        : <b className="text-entrata" data-stato="completo" aria-label="tutto descritto">✓</b>}
      {x.saldo === 'diverso' && <span className="text-xs font-bold text-uscita" data-saldo="diverso">≠ saldo</span>}
      {x.righe > 0 && <span className="text-[0.7rem] text-tenue">{x.righe} righe</span>}
    </span>
  );
}

// Da telefono la tabella scorre: il mese piu' recente va per primo, in vista.
function useLargo() {
  const [v, setV] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)'); const f = () => setV(mq.matches);
    mq.addEventListener('change', f); return () => mq.removeEventListener('change', f);
  }, []);
  return v;
}

export function GrigliaEstratti() {
  const largo = useLargo();
  const q = useQuery({ queryKey: ['portale', 'griglia'], queryFn: () => portaleApi.griglia(6) });
  const d = q.data;
  const mesi = d ? (largo ? d.mesi : [...d.mesi].reverse()) : [];
  return (
    <div className="space-y-3" data-griglia-estratti>
      <h1 className="font-importi text-2xl text-secondario">Estratti dei clienti</h1>
      <p className="text-sm text-tenue">Per ogni mese: righe della banca ancora da descrivere dal cliente, ✓ se sono tutte descritte, «≠ saldo» se il saldo dell'estratto non torna col Registro, — se l'estratto non è stato caricato.</p>
      {q.isLoading && <p className="text-tenue" role="status">Caricamento…</p>}
      {q.isError && <p role="alert" className="text-uscita">{q.error.message}</p>}
      {d && (d.clienti.length === 0
        ? <p className="py-8 text-center text-tenue">Nessun cliente collegato.</p>
        : (
          <div className="overflow-x-auto rounded-2xl border border-bordo bg-superficie">
            <table className="w-full min-w-[36rem] text-center text-sm">
              <thead>
                <tr className="border-b border-bordo bg-fondo text-tenue">
                  <th scope="col" className="sticky left-0 bg-fondo px-3 py-2 text-left font-semibold">Cliente</th>
                  {mesi.map(m => <th key={m} scope="col" className="px-2 py-2 font-semibold">{etichettaMese(m, false)}</th>)}
                </tr>
              </thead>
              <tbody>
                {d.clienti.map(c => (
                  <tr key={c.user_id} className="border-b border-bordo last:border-b-0" data-riga-cliente={c.user_id}>
                    <th scope="row" className="sticky left-0 max-w-[10rem] truncate bg-superficie px-3 py-2 text-left font-bold">
                      <Link to={`/studio/clienti/${c.user_id}`} className="hover:underline">{c.cliente}</Link>
                    </th>
                    {mesi.map(m => (
                      <td key={m} className="p-0">
                        <Link to={`/studio/clienti/${c.user_id}/estratti?mese=${m}`} data-cella={`${c.user_id}|${m}`}
                          className="flex min-h-12 items-center justify-center px-2 py-1.5 hover:bg-principale/[0.06]">
                          <Cella x={c.celle[m]} />
                        </Link>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}

export function EstrattiCliente() {
  const { id } = useParams();
  const n = valido(id);
  const [params, setParams] = useSearchParams();
  const mese = MESE.test(params.get('mese') || '') ? params.get('mese') : meseDi(oggi());
  const [solo, setSolo] = useState(false);
  const [scelta, setScelta] = useState(null);
  const [testo, setTesto] = useState('');
  const qc = useQueryClient();
  const cl = useQuery({ queryKey: ['portale', 'clienti'], queryFn: portaleApi.clienti });
  const nome = (cl.data?.clienti ?? []).find(x => x.user_id === n)?.username ?? 'Cliente';
  const q = useQuery({ queryKey: ['portale', 'estratti', n, mese], queryFn: () => portaleApi.estratti(n, mese), enabled: !!n, placeholderData: keepPreviousData });
  const chiedi = useMutation({
    mutationFn: () => portaleApi.invia(n, { messaggio: testo.trim(), movimento: scelta.movimento.id, chiarimento: true }),
    onSuccess: () => { setScelta(null); setTesto(''); qc.invalidateQueries({ queryKey: ['portale'] }); }
  });
  if (!n) return <p role="alert" className="py-10 text-center text-tenue">Cliente non trovato.</p>;
  const d = q.data;
  const righe = (d?.righe ?? []).filter(r => !solo || r.da_descrivere);
  const vai = m => setParams({ mese: m }, { replace: true });

  return (
    <div className="space-y-3" data-estratti-cliente={n}>
      <Link to={`/studio/clienti/${n}`} className="inline-flex items-center gap-1 text-sm text-principale"><ChevronLeft size={16} aria-hidden="true" />{nome}</Link>
      <h1 className="font-importi text-2xl text-secondario">Estratti</h1>
      <div className="flex items-center justify-between rounded-2xl border border-bordo bg-superficie px-2 py-1.5">
        <button type="button" aria-label="Mese prima" data-mese-prima onClick={() => vai(mesePrima(mese))} className="p-1 text-principale"><ChevronLeft size={20} aria-hidden="true" /></button>
        <h2 className="font-semibold" data-mese={mese}>{etichettaMese(mese)}</h2>
        <button type="button" aria-label="Mese dopo" data-mese-dopo disabled={mese >= meseDi(oggi())} onClick={() => vai(mesePrima(mese, -1))} className="p-1 text-principale disabled:opacity-30"><ChevronRight size={20} aria-hidden="true" /></button>
      </div>
      {q.isError && <p role="alert" className="text-uscita">{q.error.message}</p>}
      {d && <>
        {d.estratti.length === 0
          ? <p className="rounded-xl bg-fondo p-3 text-sm text-tenue" data-nessun-estratto>Il cliente non ha caricato l'estratto di questo mese.</p>
          : (
            <ul className="space-y-1 text-sm" data-elenco-estratti={d.estratti.length}>
              {d.estratti.map(e => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-3 rounded-xl bg-fondo px-3 py-2">
                  <span className="min-w-0 truncate"><b>{e.conto}</b> · {breve(e.dal)} – {breve(e.al)}</span>
                  {e.saldo === 'ok' && <span className="text-entrata" data-saldo-estratto="ok">saldo torna</span>}
                  {e.saldo === 'diverso' && <span className="font-bold text-uscita" data-saldo-estratto="diverso">≠ saldo: {formatta(centesimiDa(e.saldo_file) ?? 0)} € in banca</span>}
                </li>
              ))}
            </ul>
          )}
        <div className="flex items-center justify-between gap-2 text-sm">
          <span data-totali-estratto={`${d.totali.righe}|${d.totali.da_descrivere}`}>
            {d.totali.righe} {d.totali.righe === 1 ? 'riga' : 'righe'}, {d.totali.righe - d.totali.da_descrivere} {d.totali.righe - d.totali.da_descrivere === 1 ? 'descritta' : 'descritte'}, <b className={d.totali.da_descrivere ? 'text-uscita' : ''}>{d.totali.da_descrivere} da descrivere</b>
          </span>
          <label className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap"><input type="checkbox" checked={solo} onChange={e => setSolo(e.target.checked)} data-solo-descrivere />Solo da descrivere</label>
        </div>
        <ul className="overflow-hidden rounded-2xl border border-bordo bg-superficie">
          {righe.length === 0 && <li className="px-4 py-6 text-center text-tenue">Nessuna riga.</li>}
          {righe.map(r => (
            <li key={r.id} data-riga-estratto={r.id} data-da-descrivere={r.da_descrivere ? 'si' : 'no'}
              className={`flex items-start gap-3 border-t border-bordo px-4 py-2.5 first:border-t-0 ${r.da_descrivere ? 'shadow-[inset_4px_0_0_var(--pn-accento)]' : ''}`}>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-tenue">{breve(r.giorno)} · {r.conto}</span>
                <b className="block truncate">{r.movimento?.controparte || r.testo_banca}</b>
                {r.movimento?.controparte && <span className="block truncate text-sm text-tenue">{r.testo_banca}</span>}
                {!r.da_descrivere && (r.movimento?.categoria || r.movimento?.note) && (
                  <span className="block truncate text-sm">{[r.movimento.categoria, r.movimento.note].filter(Boolean).join(' · ')}</span>
                )}
                {r.da_descrivere && <span className="block text-sm font-semibold text-uscita">da descrivere</span>}
                {r.da_chiarire && <span className="block text-sm font-semibold text-chiarire" data-chiesto>chiarimento chiesto</span>}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className={`importo font-semibold ${r.tipo === 'Uscita' ? 'text-uscita' : 'text-entrata'}`}>{conSegno(segnato(r))} €</span>
                {r.movimento && !r.da_chiarire && (
                  <button type="button" data-chiedi-riga={r.id} onClick={() => setScelta(r)}
                    className="rounded-full border border-chiarire px-2.5 py-0.5 text-sm font-bold text-chiarire">Chiedi</button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </>}
      <BottomSheet aperto={!!scelta} onChiudi={() => { setScelta(null); chiedi.reset(); }} titolo="Chiedi un chiarimento">
        {scelta && (
          <form className="space-y-3" data-chiedi-estratto={scelta.id} onSubmit={e => { e.preventDefault(); if (testo.trim() && !chiedi.isPending) chiedi.mutate(); }}>
            <p className="flex justify-between gap-2 rounded-xl bg-fondo p-3 text-sm">
              <span className="truncate">{scelta.testo_banca} · {breve(scelta.giorno)}</span>
              <span className="importo shrink-0">{conSegno(segnato(scelta))} €</span>
            </p>
            <textarea name="messaggio" value={testo} onChange={e => setTesto(e.target.value)} rows={3} maxLength={5000} autoFocus
              placeholder="Cosa ti serve sapere?" aria-label="Domanda al cliente" className="w-full rounded-xl border border-bordo bg-fondo px-3 py-2" />
            {chiedi.error && <p role="alert" className="text-sm text-uscita">{chiedi.error.message}</p>}
            <button type="submit" disabled={!testo.trim() || chiedi.isPending} className="h-11 w-full rounded-xl bg-chiarire font-bold text-fondo disabled:opacity-40">Chiedi al cliente</button>
          </form>
        )}
      </BottomSheet>
    </div>
  );
}

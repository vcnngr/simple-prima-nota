import { AlertCircle } from 'lucide-react';
import { centesimiDa, conSegno, formatta } from '../util/importi';
import { nomeMese } from '../util/date';
import { alternaConto, contiScelti } from './conti';

const c = v => centesimiDa(v) ?? 0;
const nome = m => (m ? nomeMese(Number(m.mese.slice(5, 7)) - 1) : '');
const Maiuscola = s => s.replace(/^./, x => x.toUpperCase());

// Fascia in testa al Registro (U7, tavola A): saldo di tutti i conti (o dei
// conti scelti), saldo di ogni conto, entrate e uscite del mese con il mese
// prima, richieste aperte dello studio. Le carte dei conti filtrano il Registro:
// ognuna si aggiunge o si toglie dalla scelta (U7b), «Tutti i conti» la svuota.
// conto: la scelta come nell'indirizzo ("3,5"); il mese di r e' gia' quello dei
// conti scelti (GET /reports/riepilogo?conti=).
export default function Fascia({ r, conto, onConto, chiarire, onChiarire }) {
  if (!r) return <div className="h-28" aria-hidden="true" />;
  const attivi = r.conti.filter(x => x.attivo);
  const disattivati = r.conti.filter(x => !x.attivo).reduce((s, x) => s + c(x.saldo), 0);
  const ids = contiScelti(conto);
  const scelti = r.conti.filter(x => ids.includes(String(x.id)));
  const scelto = scelti.length === 1 ? scelti[0] : null;
  const saldo = ids.length ? scelti.reduce((s, x) => s + c(x.saldo), 0) : c(r.saldo_totale);
  const etichetta = !ids.length ? 'Saldo di tutti i conti' : scelto ? `Saldo · ${scelto.nome_banca}` : `Saldo di ${scelti.length} conti`;
  const m = r.mese, p = r.mese_precedente;
  // L'intestatario solo se serve a distinguere due conti della stessa banca.
  const omonimi = x => x.intestatario && attivi.some(y => y.id !== x.id && y.nome_banca === x.nome_banca);

  const carta = (chiave, etichetta, valore, attiva, onClick, classe = '') => (
    <button key={chiave} type="button" onClick={onClick} aria-pressed={attiva} data-carta-conto={chiave}
      className={`${classe} shrink-0 rounded-xl border px-3 py-2 text-left lg:rounded-lg lg:px-3 lg:py-1.5 ${attiva
        ? 'border-principale bg-principale/10' : 'border-bordo bg-superficie hover:border-principale'}`}>
      <span className="block max-w-[11rem] truncate text-sm text-tenue" title={etichetta}>{etichetta}</span>
      <span className={`importo block text-xl font-semibold lg:text-2xl ${valore < 0 ? 'text-uscita' : ''}`}>{formatta(valore)}</span>
    </button>
  );

  return (
    <section data-fascia className="border-b-2 border-secondario px-4 pb-4 md:px-0">
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[1fr_auto] lg:items-end lg:gap-x-8 lg:gap-y-3">
        <div className="shrink-0">
          <p className="text-[15px] text-tenue" data-fascia-etichetta>{etichetta}</p>
          <p className={`importo text-[2.5rem] font-semibold leading-tight lg:text-[3.25rem] ${saldo < 0 ? 'text-uscita' : 'text-secondario'}`}
            data-saldo={saldo}>{formatta(saldo)} €</p>
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0 lg:col-span-2 lg:row-start-2 lg:flex-wrap lg:gap-2 lg:pb-0" data-carte-conti>
          {attivi.length > 1 && carta('tutti', 'Tutti i conti', c(r.saldo_totale), !ids.length, () => onConto(null), ids.length ? '' : 'lg:hidden')}
          {attivi.map(x => carta(x.id, omonimi(x) ? `${x.nome_banca} · ${x.intestatario}` : x.nome_banca, c(x.saldo),
            ids.includes(String(x.id)), () => onConto(alternaConto(ids, x.id))))}
          {disattivati !== 0 && (
            <div className="shrink-0 px-3 py-2 lg:py-1.5" data-carta-conto="disattivati">
              <span className="block text-sm text-tenue">Conti disattivati</span>
              <span className="importo block text-xl font-semibold text-tenue lg:text-2xl">{formatta(disattivati)}</span>
            </div>
          )}
        </div>
        {m && (
          <div className="shrink-0 lg:col-start-2 lg:row-start-1 lg:text-right" data-fascia-mese={m.mese}>
            <p className="text-[15px] text-tenue">{Maiuscola(nome(m))}{scelto ? ` · ${scelto.nome_banca}` : scelti.length > 1 ? ` · ${scelti.length} conti` : ''}</p>
            <p className="importo text-xl font-semibold lg:text-2xl">
              <span className="text-entrata" data-mese-entrate>{conSegno(c(m.entrate))}</span>
              <span className="ml-3 text-uscita" data-mese-uscite>{conSegno(-c(m.uscite))}</span>
            </p>
            {p && (
              <p className="text-sm text-tenue" data-fascia-mese-prima={p.mese}>
                {nome(p)}: <span className="importo">+{formatta(c(p.entrate))}</span> · <span className="importo">−{formatta(c(p.uscite))}</span>
              </p>
            )}
          </div>
        )}
      </div>
      {attivi.length > 1 && ids.length > 0 && (
        <p className="mt-2 text-sm text-tenue" data-fascia-aiuto>Tocca le carte per aggiungere o togliere conti.</p>
      )}
      {r.da_chiarire > 0 && (
        <button type="button" onClick={onChiarire} aria-pressed={chiarire} data-fascia-chiarire={r.da_chiarire}
          className={`mt-3 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[15px] font-semibold ${chiarire
            ? 'border-chiarire bg-chiarire text-fondo' : 'border-chiarire text-chiarire'}`}>
          <AlertCircle size={18} aria-hidden="true" />
          {r.da_chiarire === 1 ? '1 movimento da chiarire con lo studio' : `${r.da_chiarire} movimenti da chiarire con lo studio`}
        </button>
      )}
    </section>
  );
}

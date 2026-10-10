import { conSegno, formatta } from '../../util/importi';
import { etichettaGiorno, partiGiorno } from '../../util/date';
import { apribile, datiRiga, perGiorno } from './comune';

// Richiesta di chiarimento aperta dello studio (W5) sul movimento.
export function Chiarire() {
  return <span data-da-chiarire className="ml-1.5 inline-block rounded-full border border-chiarire px-1.5 align-middle text-[11px] font-bold leading-4 text-chiarire">da chiarire</span>;
}

// Le quattro righe dell'Estratto (decisione del 09/10/2026), scelte per account
// (preferenze.vista_estratto, migrazione 014). Stessi dati, disegno diverso.
// Niente <table>: righe flex, nessuno scroll orizzontale a 390 px.

const colore = r => (r.entrata ? 'text-entrata' : 'text-uscita');
const Euro = ({ c, className = '' }) => <span className={`importo whitespace-nowrap ${className}`}>{c} €</span>;

function Giorno({ giorno, children, className = '' }) {
  return <h3 className={`px-4 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-tenue ${className}`}>{etichettaGiorno(giorno)}</h3>;
}

// A · Due righe: controparte e descrizione, importo e saldo dopo il movimento.
function DueRighe({ gruppi, ap }) {
  return gruppi.map(g => (
    <section key={g.giorno} data-giorno={g.giorno}>
      <Giorno giorno={g.giorno} />
      <ul className="divide-y divide-bordo border-y border-bordo bg-superficie">
        {g.righe.map(r => (
          <li key={r.id} data-movimento={r.id} {...ap(r)} className={`flex gap-3 px-4 py-2.5${ap(r).className || ''}`}>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{r.chi}{r.daChiarire && <Chiarire />}</p>
              <p className="truncate text-sm text-tenue">{[r.cosa, r.categoria].filter(Boolean).join(' · ') || '—'}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className={`text-[17px] font-semibold ${colore(r)}`}><Euro c={conSegno(r.importo)} /></p>
              {r.saldo != null && <p className="text-xs text-tenue">saldo <Euro c={formatta(r.saldo)} /></p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  ));
}

// B · Colonne: importo e saldo allineati, filetto colorato a sinistra.
function Colonne({ gruppi, ap }) {
  return (
    <>
      <div className="flex border-b border-bordo px-4 py-1.5 text-[11px] uppercase tracking-wide text-tenue" aria-hidden="true">
        <span className="flex-1">Movimento</span><span className="w-28 text-right">Importo</span><span className="w-24 text-right">Saldo</span>
      </div>
      {gruppi.map(g => (
        <section key={g.giorno} data-giorno={g.giorno}>
          <Giorno giorno={g.giorno} className="normal-case tracking-normal" />
          <ul className="space-y-px">
            {g.righe.map(r => (
              <li key={r.id} data-movimento={r.id} {...ap(r)}
                className={`flex items-center border-l-[3px] bg-superficie py-2 pl-[13px] pr-4 ${r.entrata ? 'border-entrata' : 'border-uscita'}${ap(r).className || ''}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{r.chi}{r.daChiarire && <Chiarire />}</p>
                  <p className="truncate text-xs text-tenue">{r.cosa || '—'}</p>
                </div>
                <Euro c={conSegno(r.importo)} className={`w-28 text-right text-[15px] ${colore(r)}`} />
                <span className="importo w-24 text-right text-[13px] text-tenue">{r.saldo != null ? formatta(r.saldo) : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

// C · Iniziale e categoria: saldo solo a fine giornata, uscite in nero.
function Iniziali({ gruppi, ap }) {
  return gruppi.map(g => (
    <section key={g.giorno} data-giorno={g.giorno} className="mb-2">
      <Giorno giorno={g.giorno} className="normal-case tracking-normal text-sm" />
      <ul className="mx-3 overflow-hidden rounded-2xl border border-bordo bg-superficie">
        {g.righe.map(r => (
          <li key={r.id} data-movimento={r.id} {...ap(r)} className={`flex items-center gap-3 border-b border-bordo px-3 py-2.5 last:border-b-0${ap(r).className || ''}`}>
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-principale/12 font-bold text-principale">
              {(r.chi || '?').trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{r.chi}{r.daChiarire && <Chiarire />}</p>
              {r.categoria
                ? <span className="inline-block max-w-full truncate rounded-full bg-fondo px-2 text-xs text-tenue">{r.categoria}</span>
                : <p className="truncate text-xs text-tenue">{r.cosa}</p>}
            </div>
            <Euro c={conSegno(r.importo)} className={`text-base font-semibold ${r.entrata ? 'text-entrata' : 'text-testo'}`} />
          </li>
        ))}
      </ul>
      {g.saldoFine != null && (
        <p className="px-4 pt-1 text-right text-xs text-tenue" data-saldo-giorno={g.giorno}>fine giornata <Euro c={formatta(g.saldoFine)} /></p>
      )}
    </section>
  ));
}

// D · Libro mastro: carta rigata, giorno nel margine, colonna del saldo.
const RIGHE_CARTA = { backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 43px, var(--pn-bordo) 43px 44px)' };
function Mastro({ gruppi, ap }) {
  return (
    <div className="mx-3 overflow-hidden rounded-lg border border-bordo bg-superficie">
      {gruppi.map(g => {
        const p = partiGiorno(g.giorno);
        return (
          <section key={g.giorno} data-giorno={g.giorno} className="flex border-b-2 border-bordo last:border-b-0">
            <div className="w-12 shrink-0 border-r-2 border-uscita/50 py-2 text-center" aria-label={etichettaGiorno(g.giorno)}>
              <p className="importo text-xl font-semibold leading-none">{p.giorno}</p>
              <p className="text-[11px] uppercase text-tenue">{p.mese}</p>
            </div>
            <ul className="min-w-0 flex-1" style={RIGHE_CARTA}>
              {g.righe.map(r => (
                <li key={r.id} data-movimento={r.id} {...ap(r)} className={`flex h-11 items-center gap-2 px-2${ap(r).className || ''}`}>
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-sm">{r.chi}{r.daChiarire && <Chiarire />}</p>
                    {r.cosa && <p className="truncate text-[11px] italic text-tenue">{r.cosa}</p>}
                  </div>
                  <Euro c={formatta(Math.abs(r.importo))} className={`w-24 text-right text-sm ${colore(r)}`} />
                  <span className="importo w-[5.5rem] text-right text-xs text-tenue">{r.saldo != null ? formatta(r.saldo) : ''}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const VISTE = { due_righe: DueRighe, colonne: Colonne, iniziali: Iniziali, mastro: Mastro };

export default function RigheEstratto({ movimenti, vista, onApri }) {
  const Vista = VISTE[vista] || DueRighe;
  const ap = r => apribile(r.id, onApri);
  return (
    <div data-vista={VISTE[vista] ? vista : 'due_righe'}>
      <Vista gruppi={perGiorno(movimenti.map(datiRiga))} ap={ap} />
    </div>
  );
}

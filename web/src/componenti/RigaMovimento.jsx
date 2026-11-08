import { useRef, useState } from 'react';
import { conSegno, formatta } from '../util/importi';
import { Chiarire } from './righe/Righe';

const APERTA = 152; // larghezza delle due azioni

// Riga della pagina Movimenti (U5). Tocco: scheda del movimento. Scorrendo a
// sinistra (variante C, scorciatoia): «Studio» ed «Elimina» (con 5 s per annullare).
export default function RigaMovimento({ r, onApri, onStudio, onElimina }) {
  const [dx, setDx] = useState(0);
  const inizio = useRef(null);
  const mosso = useRef(false);

  const giu = e => { inizio.current = { x: e.clientX - dx, y: e.clientY }; mosso.current = false; };
  const muovi = e => {
    if (!inizio.current) return;
    const x = e.clientX - inizio.current.x;
    if (!mosso.current && Math.abs(x) < 8) return;
    if (!mosso.current && Math.abs(e.clientY - inizio.current.y) > Math.abs(x)) { inizio.current = null; return; }
    mosso.current = true;
    setDx(Math.max(-APERTA, Math.min(0, x)));
  };
  const su = () => {
    if (!inizio.current) return;
    inizio.current = null;
    if (mosso.current) setDx(d => (d < -APERTA / 2 ? -APERTA : 0));
  };
  const tocco = () => {
    if (mosso.current) { mosso.current = false; return; }
    if (dx) setDx(0); else onApri(r.id);
  };

  return (
    <li className="relative overflow-hidden" data-movimento={r.id} data-aperta={dx ? 'si' : 'no'}>
      <div className="absolute inset-y-0 right-0 flex" style={{ width: APERTA }} aria-hidden={!dx}>
        <button type="button" tabIndex={dx ? 0 : -1} data-scorri-studio onClick={() => { setDx(0); onStudio(r.id); }}
          className="flex-1 bg-info text-sm font-bold text-fondo">Studio</button>
        <button type="button" tabIndex={dx ? 0 : -1} data-scorri-elimina onClick={() => { setDx(0); onElimina(r.id); }}
          className="flex-1 bg-uscita text-sm font-bold text-fondo">Elimina</button>
      </div>
      <div role="button" tabIndex={0} onClick={tocco}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onApri(r.id); } }}
        onPointerDown={giu} onPointerMove={muovi} onPointerUp={su} onPointerCancel={su}
        style={{ transform: `translateX(${dx}px)`, touchAction: 'pan-y' }}
        className={`relative flex cursor-pointer select-none items-center gap-3 bg-superficie px-4 py-3 md:px-3 ${inizio.current ? '' : 'transition-transform'}`}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[1.0625rem] font-bold">{r.chi}{r.daChiarire && <Chiarire />}</p>
          <p className="truncate text-[15px] text-tenue">{[r.cosa, r.categoria, r.conto].filter(Boolean).join(' · ') || '—'}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`importo whitespace-nowrap text-[1.1875rem] font-semibold ${r.entrata ? 'text-entrata' : 'text-uscita'}`}>
            {conSegno(r.importo)} €
          </p>
          {r.saldo != null && <p className="importo whitespace-nowrap text-[15px] text-tenue" data-saldo-riga={r.saldo}>{formatta(r.saldo)}</p>}
        </div>
      </div>
    </li>
  );
}

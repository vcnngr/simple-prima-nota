import { Delete } from 'lucide-react';

// Tastiera dell'importo (U4): cifre, virgola, cancella e + − = per sommare gli
// scontrini. La logica sta in util/tastierino.js.
const TASTI = [
  ['7', '7'], ['8', '8'], ['9', '9'], ['-', '−'],
  ['4', '4'], ['5', '5'], ['6', '6'], ['+', '+'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['=', '='],
  [',', ','], ['0', '0'], ['canc', null]
];

export default function Tastierino({ onTasto }) {
  return (
    <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Tastierino">
      {TASTI.map(([t, e]) => {
        const op = ['-', '+', '='].includes(t);
        return (
          <button key={t} type="button" data-tasto={t} onClick={() => onTasto(t)}
            aria-label={t === 'canc' ? 'Cancella' : t === '-' ? 'Meno' : t === '+' ? 'Più' : t === '=' ? 'Uguale' : e}
            className={`importo flex h-12 items-center justify-center rounded-xl text-xl font-semibold active:scale-95 ${
              op ? 'bg-principale/10 text-principale' : 'bg-fondo text-testo'} ${t === 'canc' ? 'col-span-2' : ''}`}>
            {t === 'canc' ? <Delete size={22} aria-hidden="true" /> : e}
          </button>
        );
      })}
    </div>
  );
}

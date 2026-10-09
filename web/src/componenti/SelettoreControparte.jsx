import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { registroApi } from '../api/registro';

// Scelta della controparte: nessuna tendina con l'elenco intero. Senza testo il
// server propone le piu' usate; scrivendo cerca (U1, tetto di 20 risultati).
function useRitardato(v, ms = 200) {
  const [r, setR] = useState(v);
  useEffect(() => { const t = setTimeout(() => setR(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return r;
}

export default function SelettoreControparte({ onScegli, tipo }) {
  const [testo, setTesto] = useState('');
  const q = useRitardato(testo.trim());
  const r = useQuery({
    queryKey: ['cerca-controparti', q, tipo ?? null],
    queryFn: ({ signal }) => registroApi.cerca(q, { tipo, segnale: signal }),
    placeholderData: prev => prev
  });
  const risultati = r.data?.risultati ?? [];

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 rounded-xl border border-bordo bg-fondo px-3 py-2">
        <Search size={18} aria-hidden="true" className="text-tenue" />
        <input name="cerca-controparte" value={testo} onChange={e => setTesto(e.target.value)} autoComplete="off"
          placeholder="Cerca per nome o partita IVA" aria-label="Cerca controparte" maxLength={100}
          className="min-w-0 flex-1 bg-transparent outline-none" />
      </label>
      {!q && risultati.length > 0 && <p className="text-xs font-semibold uppercase tracking-wide text-tenue">Più usate</p>}
      <ul className="divide-y divide-bordo" data-risultati={r.isFetching ? 'carica' : 'pronti'}>
        {risultati.map(a => (
          <li key={a.id}>
            <button type="button" data-controparte={a.id} onClick={() => onScegli(a)}
              className="flex w-full items-center justify-between gap-3 py-3 text-left">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{a.nome}</span>
                {(a.categoria || a.piva) && <span className="block truncate text-sm text-tenue">{[a.categoria, a.piva].filter(Boolean).join(' · ')}</span>}
              </span>
              {a.movimenti_recenti > 0 && <span className="shrink-0 text-xs text-tenue">{a.movimenti_recenti}×</span>}
            </button>
          </li>
        ))}
      </ul>
      {r.isError && <p role="alert" className="text-sm text-uscita">Ricerca non riuscita, riprova</p>}
      {!r.isFetching && !r.isError && q && risultati.length === 0 && <p className="text-sm text-tenue">Nessuna controparte trovata.</p>}
      {r.data?.altri && <p className="text-xs text-tenue">Altri risultati: scrivi qualche lettera in più.</p>}
      <button type="button" data-controparte="nessuna" onClick={() => onScegli(null)} className="text-sm text-principale">
        Senza controparte
      </button>
    </div>
  );
}

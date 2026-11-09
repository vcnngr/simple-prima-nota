import { useState } from 'react';
import { Plus } from 'lucide-react';

// Bottoni di scelta (U8a, tavole 1 A e 2 A): categorie e tipologie come pillole
// col loro colore. Un tocco sceglie, un altro tocco sul bottone scelto toglie.
export function Bottone({ attivo, colore, onClick, children, ...resto }) {
  return (
    <button type="button" aria-pressed={!!attivo} onClick={onClick} {...resto}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.9375rem] ${attivo
        ? 'border-principale bg-principale font-bold text-su-principale' : 'border-bordo bg-superficie'}`}>
      {colore !== undefined && (
        <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${attivo ? 'ring-2 ring-su-principale/70' : ''}`}
          style={{ backgroundColor: colore || 'var(--pn-neutro)' }} />
      )}
      <span className="truncate">{children}</span>
    </button>
  );
}

// «+ Nuova»: un campo nel posto del bottone; Invio o «Aggiungi» conferma.
// suggerimenti: nomi gia' esistenti (datalist), per non scriverli due volte.
export function NuovaVoce({ etichetta = 'Nuova', segnaposto, suggerimenti = [], onAggiungi, occupato, nome }) {
  const [aperta, setAperta] = useState(false);
  const [testo, setTesto] = useState('');
  const pulito = testo.trim().replace(/\s+/g, ' ');
  const conferma = () => { if (pulito && pulito.length <= 100) { onAggiungi(pulito); setTesto(''); setAperta(false); } };
  if (!aperta) {
    return (
      <button type="button" onClick={() => setAperta(true)} data-nuova-voce={nome}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-principale/60 px-3 py-1.5 text-[0.9375rem] text-principale">
        <Plus size={15} aria-hidden="true" />{etichetta}
      </button>
    );
  }
  const lista = `sugg-${nome}`;
  return (
    <span className="inline-flex w-full items-center gap-2">
      <input autoFocus name={`nuova-${nome}`} value={testo} onChange={e => setTesto(e.target.value)} maxLength={100}
        list={suggerimenti.length ? lista : undefined} placeholder={segnaposto} aria-label={segnaposto}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); conferma(); } if (e.key === 'Escape') { e.stopPropagation(); setAperta(false); } }}
        className="min-w-0 flex-1 rounded-full border border-principale bg-fondo px-3 py-1.5" />
      {suggerimenti.length > 0 && <datalist id={lista}>{suggerimenti.map(s => <option key={s} value={s} />)}</datalist>}
      <button type="button" disabled={!pulito || occupato} onClick={conferma} data-aggiungi-voce={nome}
        className="shrink-0 rounded-full bg-principale px-3 py-1.5 text-sm font-bold text-su-principale disabled:opacity-40">Aggiungi</button>
    </span>
  );
}

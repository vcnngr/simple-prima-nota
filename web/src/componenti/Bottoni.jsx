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

// Scelta con ricerca (U8d): le piu' usate come bottoni, «Tutte» per l'elenco
// intero, un campo che cerca fra tutte (anche se sono decine) e propone «Crea»
// solo se il nome scritto non c'e' gia'. voci: [{ chiave, nome, colore?, n? }].
const norma = s => s.toLocaleLowerCase('it').normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
export function SceltaVoce({ voci, scelta, onScegli, onCrea, occupato, nome, cosa, max = 8, attr = 'data-voce' }) {
  const [testo, setTesto] = useState('');
  const [tutte, setTutte] = useState(false);
  const t = norma(testo);
  const ordinate = [...voci].sort((a, b) => (b.n ?? 0) - (a.n ?? 0) || a.nome.localeCompare(b.nome, 'it'));
  const esatta = t ? voci.find(v => norma(v.nome) === t) : null;
  let mostrate;
  if (t) mostrate = ordinate.filter(v => norma(v.nome).includes(t));
  else if (tutte) mostrate = [...voci].sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  else {
    mostrate = ordinate.slice(0, max);
    const s = voci.find(v => v.chiave === scelta);
    if (s && !mostrate.includes(s)) mostrate = [s, ...mostrate];
  }
  const pulito = testo.trim().replace(/\s+/g, ' ');
  const scegli = v => { onScegli(v.chiave === scelta ? null : v.chiave); setTesto(''); };
  const invio = () => {
    if (esatta) scegli(esatta);
    else if (mostrate.length === 1 && t) scegli(mostrate[0]);
    else if (pulito && pulito.length <= 100 && onCrea) { onCrea(pulito); setTesto(''); }
  };
  return (
    <div className="mt-1 space-y-2" data-scelta-voce={nome}>
      <input type="search" name={`cerca-${nome}`} value={testo} onChange={e => setTesto(e.target.value)} maxLength={100} autoComplete="off"
        placeholder={`Cerca ${voci.length > 0 ? `fra ${voci.length} ` : ''}o crea ${cosa}`} aria-label={`Cerca ${cosa}`}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); invio(); } if (e.key === 'Escape' && testo) { e.stopPropagation(); setTesto(''); } }}
        className="w-full rounded-full border border-bordo bg-fondo px-3 py-1.5" />
      <div className="flex flex-wrap gap-2">
        {mostrate.map(v => (
          <Bottone key={v.chiave} attivo={v.chiave === scelta} colore={v.colore} {...{ [attr]: v.chiave }} onClick={() => scegli(v)}>
            {v.nome}{v.n ? <span className="ml-1 opacity-60">{v.n}</span> : null}
          </Bottone>
        ))}
        {t && !esatta && pulito.length <= 100 && onCrea && (
          <button type="button" disabled={occupato} onClick={() => { onCrea(pulito); setTesto(''); }} data-crea-voce={nome}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-dashed border-principale/60 px-3 py-1.5 text-[0.9375rem] text-principale disabled:opacity-40">
            <Plus size={15} aria-hidden="true" /><span className="truncate">Crea «{pulito}»</span>
          </button>
        )}
        {t && mostrate.length === 0 && !onCrea && <span className="text-sm text-tenue">Nessuna corrispondenza.</span>}
        {!t && voci.length > max && (
          <button type="button" onClick={() => setTutte(x => !x)} data-tutte-voci={nome} className="px-2 py-1.5 text-[0.9375rem] font-semibold text-principale">
            {tutte ? 'Solo le più usate' : `Tutte (${voci.length})`}
          </button>
        )}
      </div>
    </div>
  );
}

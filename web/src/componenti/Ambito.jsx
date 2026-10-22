import { useQuery } from '@tanstack/react-query';
import { registroApi } from '../api/registro';

// '2026-01-01' -> '1 gen 2026': nell'ambito l'anno conta, il giorno della settimana no.
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const breve = g => `${Number(g.slice(8, 10))} ${MESI[Number(g.slice(5, 7)) - 1]} ${g.slice(0, 4)}`;

// Cosa vede lo studio (W1): periodo e conti. Valore { dal, al, conti } con
// dal/al 'YYYY-MM-DD' o '' e conti = null (tutti) o un elenco di id.
export const daCollegamento = c => ({ dal: c.ambito_dal || '', al: c.ambito_al || '', conti: c.conti_ammessi?.length ? c.conti_ammessi : null });
export const perApiAmbito = a => ({ ambito_dal: a.dal || null, ambito_al: a.al || null, conti_ammessi: a.conti });
export const ambitoValido = a => (a.conti === null || a.conti.length > 0) && !(a.dal && a.al && a.al < a.dal);
export const uguale = (a, b) => a.dal === b.dal && a.al === b.al
  && JSON.stringify(a.conti && [...a.conti].sort()) === JSON.stringify(b.conti && [...b.conti].sort());

export function frase(a, conti) {
  const quali = a.conti
    ? a.conti.map(id => conti.find(x => x.id === id)?.nome_banca || 'un conto eliminato').join(', ')
    : 'tutti i conti';
  const quando = a.dal && a.al ? `dal ${breve(a.dal)} al ${breve(a.al)}` : a.dal ? `dal ${breve(a.dal)}` : a.al ? `fino al ${breve(a.al)}` : 'tutto lo storico';
  return `${quali}, ${quando}`;
}

export function useTuttiConti() {
  const q = useQuery({ queryKey: ['conti', 'tutti'], queryFn: registroApi.tuttiConti });
  return q.data ?? [];
}

export default function Ambito({ valore: a, onCambia, conti }) {
  const imposta = m => onCambia({ ...a, ...m });
  const tocca = id => {
    const ora = a.conti ?? [];
    imposta({ conti: ora.includes(id) ? ora.filter(x => x !== id) : [...ora, id] });
  };
  return (
    <div className="space-y-4" data-ambito-editor>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Periodo</legend>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label><span className="text-tenue">Dal</span>
            <input type="date" name="ambito_dal" value={a.dal} max={a.al || undefined} onChange={e => imposta({ dal: e.target.value })}
              className="mt-1 w-full rounded-xl border border-bordo bg-fondo px-2 py-2" /></label>
          <label><span className="text-tenue">Al</span>
            <input type="date" name="ambito_al" value={a.al} min={a.dal || undefined} onChange={e => imposta({ al: e.target.value })}
              className="mt-1 w-full rounded-xl border border-bordo bg-fondo px-2 py-2" /></label>
        </div>
        <p className="text-xs text-tenue">Vuoti: tutto lo storico, anche i movimenti futuri.</p>
        {a.dal && a.al && a.al < a.dal && <p role="alert" className="text-sm text-uscita">La fine non può venire prima dell'inizio.</p>}
      </fieldset>
      <fieldset className="space-y-1">
        <legend className="text-sm font-semibold">Conti</legend>
        <label className="flex items-center justify-between py-1.5 text-sm">
          <span>Tutti i conti<span className="block text-xs text-tenue">anche quelli che aprirai dopo</span></span>
          <input type="checkbox" role="switch" name="tutti_i_conti" checked={a.conti === null}
            onChange={e => imposta({ conti: e.target.checked ? null : [] })} className="h-5 w-5" />
        </label>
        {a.conti !== null && conti.map(c => (
          <label key={c.id} className="flex items-center justify-between border-t border-bordo py-2 text-sm">
            <span className="min-w-0 truncate">{c.nome_banca}{c.attivo ? '' : ' (disattivato)'}</span>
            <input type="checkbox" role="switch" data-conto-ammesso={c.id} checked={a.conti.includes(c.id)} onChange={() => tocca(c.id)} className="h-5 w-5" />
          </label>
        ))}
        {a.conti !== null && a.conti.length === 0 && <p className="text-sm text-uscita">Scegli almeno un conto.</p>}
      </fieldset>
    </div>
  );
}

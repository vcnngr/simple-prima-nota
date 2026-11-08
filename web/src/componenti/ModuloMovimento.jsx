import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { registroApi } from '../api/registro';
import SelettoreControparte from './SelettoreControparte';
import Tastierino from './Tastierino';
import { nomeConto, useConti } from './conti';
import { VUOTO, daCentesimi, espressione, premi, problema, totale } from '../util/tastierino';
import { centesimiDa, formatta, perApi } from '../util/importi';
import { oggi } from '../util/date';

const TIPI = ['Uscita', 'Entrata'];

// Ogni lista e scheda che mostra movimenti, saldi o totali si ricarica.
export function aggiornaRegistro(qc) {
  for (const k of ['estratto', 'riepilogo', 'conti', 'conto', 'cerca-controparti', 'movimenti', 'movimento', 'controparti', 'controparte', 'report']) {
    qc.invalidateQueries({ queryKey: [k] });
  }
}

// Registrazione e modifica di un movimento, «chi, poi quanto» (09/10/2026):
// prima la controparte, poi l'importo con tipo e conto gia' proposti.
//   iniziale: movimento da modificare (PUT) — si parte dall'importo;
//   controparte: controparte gia' scelta (dalla sua scheda) — si parte dall'importo.
export default function ModuloMovimento({ iniziale, controparte: proposta, onFatto }) {
  const qc = useQueryClient();
  const { conti, conto: contoProposto } = useConti();
  const daIniziale = iniziale?.anagrafica_id ? { id: iniziale.anagrafica_id, nome: iniziale.anagrafica_nome } : null;
  const [passo, setPasso] = useState(iniziale || proposta ? 'quanto' : 'chi');
  const [controparte, setControparte] = useState(iniziale ? daIniziale : proposta ?? null);
  const [tipo, setTipo] = useState(iniziale?.tipo
    ?? (TIPI.includes(proposta?.tipo_movimento_preferito) ? proposta.tipo_movimento_preferito : 'Uscita'));
  const [tasti, setTasti] = useState(() => (iniziale ? daCentesimi(centesimiDa(iniziale.importo) ?? 0) : VUOTO));
  const [data, setData] = useState(iniziale?.giorno ?? oggi());
  const [contoId, setContoId] = useState(iniziale?.conto_id ?? null);
  // In modifica la descrizione resta quella salvata, anche se uguale al nome.
  const [descrizione, setDescrizione] = useState(iniziale?.descrizione ?? '');
  // Il conto del movimento anche se disattivato nel frattempo (non e' fra gli attivi).
  const conto = conti.find(c => c.id === contoId)
    || (iniziale && contoId === iniziale.conto_id ? { id: iniziale.conto_id, nome_banca: iniziale.nome_banca } : null)
    || contoProposto;
  // Un tocco, un movimento (U4): il ref blocca subito il secondo invio.
  const inviato = useRef(false);

  const salva = useMutation({
    mutationFn: () => {
      const corpo = {
        data,
        anagrafica_id: controparte?.id ?? null,
        conto_id: conto.id,
        descrizione: descrizione.trim() || controparte?.nome,
        importo: perApi(totale(tasti)),
        tipo
      };
      return iniziale ? registroApi.modifica(iniziale.id, corpo) : registroApi.registra(corpo);
    },
    onError: () => { inviato.current = false; },
    onSuccess: () => { aggiornaRegistro(qc); onFatto(); }
  });

  if (passo === 'chi') {
    return (
      <SelettoreControparte onScegli={a => {
        setControparte(a);
        if (a && TIPI.includes(a.tipo_movimento_preferito)) setTipo(a.tipo_movimento_preferito);
        setPasso('quanto');
      }} />
    );
  }

  const t = totale(tasti);
  const errore = !conto ? 'Nessun conto attivo'
    : problema(tasti) || (!descrizione.trim() && !controparte ? 'Scrivi una descrizione' : null);

  return (
    <form className="space-y-3" data-modulo={iniziale ? 'modifica' : 'nuovo'} onSubmit={e => {
      e.preventDefault();
      if (errore || inviato.current) return;
      inviato.current = true;
      salva.mutate();
    }}>
      <div className="flex rounded-xl bg-fondo p-1" role="radiogroup" aria-label="Tipo">
        {TIPI.map(x => (
          <button key={x} type="button" role="radio" aria-checked={tipo === x} data-tipo={x} onClick={() => setTipo(x)}
            className={`flex-1 rounded-lg py-2 font-semibold ${tipo === x
              ? `bg-superficie shadow ${x === 'Uscita' ? 'text-uscita' : 'text-entrata'}` : 'text-tenue'}`}>
            {x === 'Uscita' ? '− Uscita' : '+ Entrata'}
          </button>
        ))}
      </div>

      <div className="text-right" aria-live="polite">
        <p className="importo min-h-5 text-sm text-tenue" data-espressione>{espressione(tasti)}</p>
        <p className={`importo text-[40px] font-semibold leading-tight ${tipo === 'Uscita' ? 'text-uscita' : 'text-entrata'}`} data-totale={t}>
          {tipo === 'Uscita' ? '− ' : '+ '}{formatta(Math.abs(t))} €
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <button type="button" data-cambia-controparte onClick={() => setPasso('chi')}
          className="max-w-full truncate rounded-full bg-accento px-3 py-1.5 text-su-accento">
          {controparte ? controparte.nome : 'Senza controparte'}
        </button>
        <input type="date" name="data" value={data} required onChange={e => setData(e.target.value || oggi())}
          aria-label="Data" className="rounded-full border border-bordo bg-superficie px-3 py-1" />
        {conti.length > 1 || (conto && !conti.some(c => c.id === conto.id)) ? (
          <select name="conto" value={conto?.id ?? ''} onChange={e => setContoId(Number(e.target.value))} aria-label="Conto"
            className="max-w-full rounded-full border border-bordo bg-superficie px-3 py-1.5">
            {conto && !conti.some(c => c.id === conto.id) && <option value={conto.id}>{nomeConto(conto)} (disattivato)</option>}
            {conti.map(c => <option key={c.id} value={c.id}>{nomeConto(c)}</option>)}
          </select>
        ) : conto && <span className="rounded-full border border-bordo px-3 py-1.5">{nomeConto(conto)}</span>}
      </div>
      <input name="descrizione" value={descrizione} onChange={e => setDescrizione(e.target.value)} maxLength={255}
        placeholder={controparte ? `Descrizione (${controparte.nome})` : 'Descrizione'} aria-label="Descrizione"
        className="w-full rounded-xl border border-bordo bg-fondo px-3 py-2" />

      <Tastierino onTasto={k => setTasti(s => premi(s, k))} />

      {(salva.isError || (errore && t !== 0)) && (
        <p role="alert" className="text-sm text-uscita">{salva.isError ? salva.error.message : errore}</p>
      )}
      <button type="submit" disabled={!!errore || salva.isPending} data-registra
        className="h-12 w-full rounded-xl bg-principale font-bold text-su-principale disabled:opacity-40">
        {salva.isPending ? 'Salvataggio…' : iniziale ? 'Salva le modifiche' : 'Registra'}
      </button>
    </form>
  );
}

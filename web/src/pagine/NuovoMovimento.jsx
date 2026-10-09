import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { registroApi } from '../api/registro';
import BottomSheet from '../componenti/BottomSheet';
import SelettoreControparte from '../componenti/SelettoreControparte';
import Tastierino from '../componenti/Tastierino';
import Estratto, { nomeConto, useConti } from './Estratto';
import { VUOTO, espressione, premi, problema, totale } from '../util/tastierino';
import { formatta, perApi } from '../util/importi';
import { oggi } from '../util/date';

const TIPI = ['Uscita', 'Entrata'];

// Nuovo movimento, «chi, poi quanto» (09/10/2026): prima la controparte, poi
// l'importo con tipo e conto gia' proposti. In molti casi: +, controparte, cifre, Registra.
function Registrazione({ onFatto }) {
  const qc = useQueryClient();
  const { conti, conto: contoProposto } = useConti();
  const [passo, setPasso] = useState('chi');
  const [controparte, setControparte] = useState(null);
  const [tipo, setTipo] = useState('Uscita');
  const [tasti, setTasti] = useState(VUOTO);
  const [data, setData] = useState(oggi);
  const [contoId, setContoId] = useState(null);
  const [descrizione, setDescrizione] = useState('');
  const conto = conti.find(c => c.id === contoId) || contoProposto;
  // Un tocco, un movimento: isPending arriva solo al disegno successivo, e due
  // tocchi ravvicinati partivano entrambi (smoke U4). Il ref blocca subito.
  const inviato = useRef(false);

  const registra = useMutation({
    mutationFn: () => registroApi.registra({
      data,
      anagrafica_id: controparte?.id ?? null,
      conto_id: conto.id,
      descrizione: descrizione.trim() || controparte?.nome,
      importo: perApi(totale(tasti)),
      tipo
    }),
    onError: () => { inviato.current = false; },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['estratto'] });
      qc.invalidateQueries({ queryKey: ['conti'] });
      qc.invalidateQueries({ queryKey: ['cerca-controparti'] });
      onFatto();
    }
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
    <form className="space-y-3" onSubmit={e => {
      e.preventDefault();
      if (errore || inviato.current) return;
      inviato.current = true;
      registra.mutate();
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
        {conti.length > 1 ? (
          <select name="conto" value={conto?.id ?? ''} onChange={e => setContoId(Number(e.target.value))} aria-label="Conto"
            className="max-w-full rounded-full border border-bordo bg-superficie px-3 py-1.5">
            {conti.map(c => <option key={c.id} value={c.id}>{nomeConto(c)}</option>)}
          </select>
        ) : conto && <span className="rounded-full border border-bordo px-3 py-1.5">{nomeConto(conto)}</span>}
      </div>
      <input name="descrizione" value={descrizione} onChange={e => setDescrizione(e.target.value)} maxLength={255}
        placeholder={controparte ? `Descrizione (${controparte.nome})` : 'Descrizione'} aria-label="Descrizione"
        className="w-full rounded-xl border border-bordo bg-fondo px-3 py-2" />

      <Tastierino onTasto={k => setTasti(s => premi(s, k))} />

      {(registra.isError || (errore && t !== 0)) && (
        <p role="alert" className="text-sm text-uscita">{registra.isError ? registra.error.message : errore}</p>
      )}
      <button type="submit" disabled={!!errore || registra.isPending} data-registra
        className="h-12 w-full rounded-xl bg-principale font-bold text-su-principale disabled:opacity-40">
        {registra.isPending ? 'Registrazione…' : 'Registra'}
      </button>
    </form>
  );
}

export default function NuovoMovimento() {
  const vai = useNavigate();
  const chiudi = () => vai('/', { replace: true });
  return (
    <>
      <Estratto />
      <BottomSheet aperto onChiudi={chiudi} titolo="Nuovo movimento">
        <Registrazione onFatto={chiudi} />
      </BottomSheet>
    </>
  );
}

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { studioApi } from '../api/studio';
import BottomSheet from './BottomSheet';
import Iniziale from './Iniziale';
import Ambito, { ambitoValido, frase, perApiAmbito, useTuttiConti } from './Ambito';

const PASSI = ['Chi è', 'Cosa vede', 'Conferma'];
export const nomeStudio = c => c.ragione_sociale || c.username;

// Richiesta di collegamento (U6a, tavola 1 C): chi è -> cosa vede -> conferma.
export default function Richiesta({ c, onChiudi }) {
  const qc = useQueryClient();
  const conti = useTuttiConti();
  const [passo, setPasso] = useState(0);
  const [a, setA] = useState({ dal: '', al: '', conti: null });
  const [rifiuto, setRifiuto] = useState(false);
  const fatto = () => { qc.invalidateQueries({ queryKey: ['studio'] }); qc.invalidateQueries({ queryKey: ['movimenti'] }); onChiudi(); };
  const accetta = useMutation({ mutationFn: () => studioApi.accetta(c.id, perApiAmbito(a)), onSuccess: fatto });
  const rifiuta = useMutation({ mutationFn: () => studioApi.rifiuta(c.id), onSuccess: fatto });
  const occupato = accetta.isPending || rifiuta.isPending;
  const err = accetta.error || rifiuta.error;

  const piede = passo === 0 ? (
    <div className="flex gap-2">
      {rifiuto
        ? <button type="button" data-rifiuta="conferma" disabled={occupato} onClick={() => rifiuta.mutate()} className="flex-1 rounded-xl bg-uscita py-3 font-bold text-white">Sì, rifiuta</button>
        : <button type="button" data-rifiuta onClick={() => setRifiuto(true)} className="flex-1 rounded-xl border border-bordo py-3 font-semibold">Rifiuta</button>}
      <button type="button" data-avanti onClick={() => setPasso(1)} className="flex-1 rounded-xl bg-principale py-3 font-bold text-su-principale">Avanti</button>
    </div>
  ) : passo === 1 ? (
    <div className="flex gap-2">
      <button type="button" onClick={() => setPasso(0)} className="flex-1 rounded-xl border border-bordo py-3 font-semibold">Indietro</button>
      <button type="button" data-avanti disabled={!ambitoValido(a)} onClick={() => setPasso(2)} className="flex-1 rounded-xl bg-principale py-3 font-bold text-su-principale disabled:opacity-40">Avanti</button>
    </div>
  ) : (
    <div className="flex gap-2">
      <button type="button" onClick={() => setPasso(1)} className="flex-1 rounded-xl border border-bordo py-3 font-semibold">Indietro</button>
      <button type="button" data-accetta disabled={occupato} onClick={() => accetta.mutate()} className="flex-1 rounded-xl bg-principale py-3 font-bold text-su-principale disabled:opacity-40">{accetta.isPending ? 'Un momento…' : 'Accetta'}</button>
    </div>
  );

  return (
    <BottomSheet aperto onChiudi={onChiudi} titolo="Richiesta di collegamento" piede={piede}>
      <ol className="mb-3 flex gap-1 text-xs" data-passo={passo + 1}>
        {PASSI.map((t, i) => <li key={t} className={`flex-1 border-t-4 pt-1 ${i <= passo ? 'border-principale font-semibold' : 'border-bordo text-tenue'}`}>{i + 1}. {t}</li>)}
      </ol>
      {passo === 0 && (
        <div className="space-y-3" data-passo-chi>
          <div className="flex items-center gap-3">
            <Iniziale nome={nomeStudio(c)} grande />
            <div className="min-w-0">
              <p className="truncate font-importi text-lg font-semibold">{nomeStudio(c)}</p>
              <p className="text-xs text-tenue">richiesta del {new Date(c.data_richiesta).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
          </div>
          <dl className="divide-y divide-bordo rounded-xl border border-bordo text-sm">
            {[['Utente', c.username], ['Email', c.email], ['Partita IVA', c.partita_iva], ['Telefono', c.telefono]].filter(([, x]) => x).map(([k, x]) => (
              <div key={k} className="flex justify-between gap-3 px-3 py-2"><dt className="text-tenue">{k}</dt><dd className="min-w-0 truncate">{x}</dd></div>
            ))}
          </dl>
          <p className="text-sm text-tenue">Se non conosci questo studio, rifiuta. Accettando scegli tu cosa può vedere; puoi cambiarlo, sospendere o chiudere quando vuoi.</p>
        </div>
      )}
      {passo === 1 && <Ambito valore={a} onCambia={setA} conti={conti} />}
      {passo === 2 && (
        <div className="space-y-3" data-passo-conferma>
          <p><b>{nomeStudio(c)}</b> vedrà <span data-frase-ambito>{frase(a, conti)}</span>, in sola lettura.</p>
          <p className="text-sm text-tenue">Potrà scriverti in chat e chiederti chiarimenti sui movimenti. Ogni suo accesso resta registrato e lo vedi nei permessi.</p>
        </div>
      )}
      {err && <p role="alert" className="mt-3 text-sm text-uscita">{err.message}</p>}
    </BottomSheet>
  );
}

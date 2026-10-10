import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { registroApi } from '../api/registro';
import { studioApi } from '../api/studio';
import BottomSheet from './BottomSheet';
import ModuloMovimento, { aggiornaRegistro } from './ModuloMovimento';
import { centesimiDa, conSegno } from '../util/importi';
import { breve } from '../util/date';

function Campo({ nome, children }) {
  return (
    <div className="flex justify-between gap-4 border-b border-bordo py-2.5">
      <dt className="shrink-0 text-tenue">{nome}</dt>
      <dd className="min-w-0 truncate text-right font-semibold">{children || '—'}</dd>
    </div>
  );
}

// Chiede allo studio un chiarimento sul movimento (chat di lavoro, W5).
function ChiediStudio({ movimento, onFatto }) {
  const [testo, setTesto] = useState('');
  const invia = useMutation({ mutationFn: () => studioApi.invia({ messaggio: testo.trim(), movimento }), onSuccess: onFatto });
  return (
    <form className="space-y-2" data-chiedi-studio onSubmit={e => { e.preventDefault(); if (testo.trim() && !invia.isPending) invia.mutate(); }}>
      <textarea name="messaggio" value={testo} onChange={e => setTesto(e.target.value)} rows={3} maxLength={5000} autoFocus
        placeholder="Scrivi allo studio di questo movimento" aria-label="Messaggio allo studio"
        className="w-full rounded-xl border border-bordo bg-fondo px-3 py-2" />
      {invia.isError && <p role="alert" className="text-sm text-uscita">{invia.error.message}</p>}
      <button type="submit" disabled={!testo.trim() || invia.isPending} className="h-11 w-full rounded-xl bg-info font-bold text-fondo disabled:opacity-40">
        {invia.isPending ? 'Invio…' : 'Invia allo studio'}
      </button>
    </form>
  );
}

// Scheda di un movimento (U5, variante A): campi, Modifica (tastierino gia'
// compilato), Elimina con conferma, Chiedi allo studio. modo: 'vedi' | 'studio'.
export default function DettaglioMovimento({ id, modo: modoIniziale = 'vedi', onChiudi }) {
  const qc = useQueryClient();
  const [modo, setModo] = useState(modoIniziale);
  const [conferma, setConferma] = useState(false);
  const [inviato, setInviato] = useState(false);
  const q = useQuery({ queryKey: ['movimento', id], queryFn: () => registroApi.movimento(id), enabled: !!id });
  const elimina = useMutation({
    mutationFn: () => registroApi.elimina(id),
    onSuccess: () => { aggiornaRegistro(qc); onChiudi(); }
  });
  const m = q.data;
  const c = m ? centesimiDa(m.importo) ?? 0 : 0;
  const titolo = modo === 'modifica' ? 'Modifica movimento' : modo === 'studio' ? 'Chiedi allo studio' : 'Movimento';

  let corpo;
  if (q.isLoading) corpo = <p className="text-tenue" role="status">Caricamento…</p>;
  else if (q.isError) corpo = <p role="alert" className="text-uscita">Movimento non trovato.</p>;
  else if (modo === 'modifica') corpo = <ModuloMovimento iniziale={m} onFatto={() => setModo('vedi')} />;
  else if (modo === 'studio') {
    corpo = inviato
      ? <p className="py-4 text-center" role="status" data-inviato>Messaggio inviato. <Link to="/chat" className="font-bold text-principale">Apri la chat</Link></p>
      : <ChiediStudio movimento={m.id} onFatto={() => { setInviato(true); qc.invalidateQueries({ queryKey: ['studio'] }); }} />;
  } else {
    corpo = (
      <div data-dettaglio={m.id}>
        <p className="text-sm text-tenue">{m.tipo}</p>
        <p className={`importo text-[36px] font-semibold ${m.tipo === 'Uscita' ? 'text-uscita' : 'text-entrata'}`} data-importo={m.tipo === 'Uscita' ? -c : c}>
          {conSegno(m.tipo === 'Uscita' ? -c : c)} €
        </p>
        {m.da_chiarire && (
          <p className="mt-2 rounded-xl border border-chiarire bg-chiarire/10 px-3 py-2 text-sm">
            Lo studio ha chiesto un chiarimento. <Link to="/chat" className="font-bold text-principale">Rispondi in chat</Link>
          </p>
        )}
        <dl className="mt-2">
          <Campo nome="Controparte">{m.anagrafica_nome}</Campo>
          <Campo nome="Data">{breve(m.giorno)}</Campo>
          <Campo nome="Conto">{m.nome_banca}</Campo>
          <Campo nome="Categoria">{m.categoria || m.tipologia_nome}</Campo>
          <Campo nome="Descrizione">{m.descrizione}</Campo>
          <Campo nome="Note">{m.note}</Campo>
        </dl>
        {elimina.isError && <p role="alert" className="mt-2 text-sm text-uscita">{elimina.error.message}</p>}
        {conferma ? (
          <div className="mt-4 flex gap-2" role="group" aria-label="Conferma eliminazione">
            <button type="button" onClick={() => setConferma(false)} className="h-12 flex-1 rounded-xl border border-bordo font-bold">Annulla</button>
            <button type="button" data-elimina-conferma disabled={elimina.isPending} onClick={() => elimina.mutate()}
              className="h-12 flex-[2] rounded-xl bg-uscita font-bold text-fondo disabled:opacity-40">Elimina davvero</button>
          </div>
        ) : (
          <div className="mt-4 flex gap-2">
            <button type="button" data-elimina onClick={() => setConferma(true)} className="h-12 flex-1 rounded-xl border border-bordo font-bold text-uscita">Elimina</button>
            <button type="button" data-modifica onClick={() => setModo('modifica')} className="h-12 flex-[2] rounded-xl bg-principale font-bold text-su-principale">Modifica</button>
          </div>
        )}
        <button type="button" data-chiedi onClick={() => setModo('studio')} className="mt-3 w-full py-1 text-center font-bold text-info">Chiedi allo studio</button>
      </div>
    );
  }

  return (
    <BottomSheet aperto={!!id} onChiudi={onChiudi} titolo={titolo}>
      {corpo}
    </BottomSheet>
  );
}

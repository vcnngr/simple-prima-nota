import { Link } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { registroApi } from '../api/registro';
import { salvaFile } from '../api/client';
import BottomSheet from './BottomSheet';

// Export dei movimenti in vista (U8c): stessi filtri del Registro, Excel o CSV.
// filtri: parametri dell'API (come GET /movimenti); etichette: i filtri a parole;
// numero: quanti movimenti risultano coi filtri.
export default function EsportaMovimenti({ filtri, etichette, numero, onChiudi }) {
  const es = useMutation({
    mutationFn: formato => registroApi.esportaMovimenti({ ...filtri, formato }),
    onSuccess: f => { salvaFile(f); onChiudi(); }
  });
  const nessuno = numero === 0;
  return (
    <BottomSheet aperto onChiudi={onChiudi} titolo="Esporta questi movimenti">
      <div className="space-y-3" data-esporta-movimenti>
        <p className="text-sm">
          {numero != null && <><b className="importo">{numero}</b> moviment{numero === 1 ? 'o' : 'i'}, </>}
          {etichette.length ? 'con i filtri di adesso:' : 'tutti, senza filtri.'}
        </p>
        {etichette.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" data-filtri-export>
            {etichette.map(e => <li key={e} className="rounded-full border border-bordo bg-fondo px-2.5 py-1 text-sm">{e}</li>)}
          </ul>
        )}
        <p className="text-sm text-tenue">In ordine di data, con conto, controparte, tipologia, categoria, entrate, uscite, saldo e note.</p>
        <div className="flex gap-2">
          {[['xlsx', 'Excel'], ['csv', 'CSV']].map(([k, e]) => (
            <button key={k} type="button" disabled={es.isPending || nessuno} data-esporta-formato={k} onClick={() => es.mutate(k)}
              className="h-12 flex-1 rounded-xl border border-bordo font-bold disabled:opacity-40">{es.isPending && es.variables === k ? 'Preparo…' : e}</button>
          ))}
        </div>
        {nessuno && <p className="text-sm text-tenue">Nessun movimento da esportare con questi filtri.</p>}
        {es.isError && <p role="alert" className="text-sm text-uscita">{es.error.message}</p>}
        <Link to="/archivio" data-link-archivio className="block border-t border-bordo pt-3 text-sm text-principale">
          Export per lo studio e copia di sicurezza →
        </Link>
      </div>
    </BottomSheet>
  );
}

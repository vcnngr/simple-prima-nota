import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { registroApi } from '../api/registro';
import { archivioApi } from '../api/archivio';
import BottomSheet from './BottomSheet';
import SelettoreControparte from './SelettoreControparte';
import { SceltaVoce } from './Bottoni';
import { aggiornaRegistro } from './ModuloMovimento';
import { centesimiDa, formatta } from '../util/importi';
import { giornoLungo } from '../util/date';

// Righe dell'estratto da descrivere, una alla volta (U9a, tavola 2 B): in alto
// il testo della banca, poi chi, la categoria e una nota per lo studio.
// «Salva · avanti» le descrive (il server spegne «da descrivere»), «Salta» passa oltre.
function Scheda({ m, n, totale, onAvanti }) {
  const qc = useQueryClient();
  const [controparte, setControparte] = useState(m.anagrafica_id ? { id: m.anagrafica_id, nome: m.anagrafica_nome } : null);
  const [scegli, setScegli] = useState(false);
  const [categoria, setCategoria] = useState(m.categoria ?? '');
  const [note, setNote] = useState(m.note ?? '');
  const inviato = useRef(false);
  const cat = useQuery({ queryKey: ['categorie-movimenti', m.tipo], queryFn: () => registroApi.categorie(m.tipo) });
  const voci = (cat.data?.categorie ?? []).map(c => ({ chiave: c.nome, nome: c.nome, n: c.utilizzi }));
  if (categoria && !voci.some(v => v.chiave === categoria)) voci.unshift({ chiave: categoria, nome: categoria });
  const salva = useMutation({
    mutationFn: async () => {
      if (categoria && !(cat.data?.categorie ?? []).some(c => c.nome === categoria)) {
        await archivioApi.crea('movimenti', { nome: categoria, tipo: 'Entrambi' }).catch(() => {});
      }
      return registroApi.modifica(m.id, { anagrafica_id: controparte?.id ?? null, categoria: categoria || null, note: note.trim() || null });
    },
    onError: () => { inviato.current = false; },
    onSuccess: () => { aggiornaRegistro(qc); onAvanti(); }
  });
  const c = centesimiDa(m.importo) ?? 0;
  const vuota = !controparte && !categoria && !note.trim();

  if (scegli) {
    return <SelettoreControparte tipo={m.tipo} onScegli={a => { setControparte(a); if (!categoria && a?.ultima_categoria) setCategoria(a.ultima_categoria); setScegli(false); }} />;
  }
  return (
    <div className="space-y-4" data-descrivi={m.id}>
      <p className="text-sm text-tenue" data-descrivi-posizione>{n} di {totale}</p>
      <div className="rounded-2xl border-l-4 border-accento bg-fondo px-4 py-3">
        <p className="text-sm text-tenue">{giornoLungo(m.giorno)} · {m.nome_banca}</p>
        <p className="mt-1 break-words font-semibold" data-testo-banca>{m.descrizione}</p>
        <p className={`importo mt-1 text-xl font-semibold ${m.tipo === 'Entrata' ? 'text-entrata' : 'text-uscita'}`}>
          {m.tipo === 'Entrata' ? '+' : '−'}{formatta(c)} €</p>
      </div>
      <div>
        <p className="mb-1 text-sm text-tenue">Chi</p>
        <button type="button" onClick={() => setScegli(true)} data-descrivi-chi
          className="w-full rounded-xl border border-bordo bg-superficie px-3 py-2.5 text-left">
          {controparte ? <b>{controparte.nome}</b> : <span className="text-tenue">Scegli o crea la controparte</span>}
        </button>
      </div>
      <fieldset>
        <legend className="text-sm text-tenue">Categoria</legend>
        <SceltaVoce nome="categoria-descrivi" cosa="una categoria" attr="data-descrivi-categoria" voci={voci} scelta={categoria || null}
          onScegli={x => setCategoria(x ?? '')} onCrea={x => setCategoria(x)} max={6} />
      </fieldset>
      <label className="block text-sm">
        <span className="text-tenue">Nota per lo studio</span>
        <textarea name="nota-descrivi" value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={1000}
          placeholder="Es. cena con un fornitore, prelievo per la cassa" className="mt-1 w-full rounded-xl border border-bordo bg-fondo px-3 py-2" />
      </label>
      {salva.isError && <p role="alert" className="text-sm text-uscita">{salva.error.message}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onAvanti} data-descrivi-salta className="h-12 flex-1 rounded-xl border border-bordo font-semibold">Salta</button>
        <button type="button" disabled={vuota || salva.isPending} data-descrivi-salva
          onClick={() => { if (inviato.current) return; inviato.current = true; salva.mutate(); }}
          className="h-12 flex-[2] rounded-xl bg-principale font-bold text-su-principale disabled:opacity-40">
          {salva.isPending ? 'Salvo…' : 'Salva · avanti'}
        </button>
      </div>
    </div>
  );
}

export default function DescriviMovimenti({ onChiudi }) {
  // Elenco fissato all'apertura: una riga descritta non sparisce sotto le dita.
  const q = useQuery({ queryKey: ['descrivere-sequenza'], queryFn: () => registroApi.movimenti({ limite: 200, filtri: { da_descrivere: 'true' } }), staleTime: Infinity, gcTime: 0 });
  const [i, setI] = useState(0);
  const righe = q.data?.movimenti ?? [];
  const m = righe[i];
  return (
    <BottomSheet aperto onChiudi={onChiudi} titolo="Da descrivere">
      {q.isLoading && <p role="status" className="text-tenue">Caricamento…</p>}
      {q.isError && <p role="alert" className="text-uscita">{q.error.message}</p>}
      {q.isSuccess && !m && (
        <div className="space-y-3 py-4 text-center" data-descrivi-fine>
          <p className="font-semibold">{righe.length ? 'Fatto: hai visto tutte le righe.' : 'Nessuna riga da descrivere.'}</p>
          <button type="button" onClick={onChiudi} className="h-11 w-full rounded-xl bg-principale font-bold text-su-principale">Chiudi</button>
        </div>
      )}
      {m && <Scheda key={m.id} m={m} n={i + 1} totale={righe.length} onAvanti={() => setI(x => x + 1)} />}
    </BottomSheet>
  );
}

import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus } from 'lucide-react';
import { archivioApi } from '../api/archivio';
import BottomSheet from '../componenti/BottomSheet';

// Categorie dei movimenti, categorie delle controparti, tipologie (U6b).
// campoTipo: il campo «di solito entrata/uscita» (le categorie delle controparti non lo hanno).
const GENERI = {
  movimenti: { titolo: 'Movimenti', campoTipo: 'tipo', uso: n => `${n} moviment${n === 1 ? 'o' : 'i'}` },
  controparti: { titolo: 'Controparti', campoTipo: null, uso: n => `${n} controparti` },
  tipologie: { titolo: 'Tipologie', campoTipo: 'tipo_movimento_default', uso: null }
};
const TIPI = [['Entrambi', 'Entrambi'], ['Entrata', '+ Entrata'], ['Uscita', '− Uscita']];
const COLORI = ['#6B7280', '#2F6B4F', '#B4442E', '#C08A1E', '#2B5D8A', '#7A4E9C'];
const attiva = c => (c.attiva ?? c.attivo) !== false;

function Scheda({ genere, voce, onChiudi }) {
  const qc = useQueryClient();
  const g = GENERI[genere];
  const nuova = !voce.id;
  const [nome, setNome] = useState(voce.nome ?? '');
  const [tipo, setTipo] = useState((g.campoTipo && voce[g.campoTipo]) || 'Entrambi');
  const [colore, setColore] = useState(voce.colore || COLORI[0]);
  const [conferma, setConferma] = useState(false);
  const fine = () => { qc.invalidateQueries({ queryKey: ['categorie'] }); onChiudi(); };
  const corpo = extra => ({ nome: nome.trim(), colore, ...(g.campoTipo ? { [g.campoTipo]: tipo } : {}), ...extra });
  const salva = useMutation({
    mutationFn: () => (nuova ? archivioApi.crea(genere, corpo()) : archivioApi.modifica(genere, voce.id, corpo())),
    onSuccess: fine
  });
  const stato = useMutation({ mutationFn: () => archivioApi.modifica(genere, voce.id, { attiva: !attiva(voce) }), onSuccess: fine });
  const elimina = useMutation({ mutationFn: () => archivioApi.elimina(genere, voce.id), onSuccess: fine });
  const occupato = salva.isPending || stato.isPending || elimina.isPending;
  const err = salva.error || stato.error || elimina.error;
  const usi = Number(voce.utilizzi ?? 0);
  const rinomina = !nuova && nome.trim() && nome.trim() !== voce.nome && usi > 0;

  return (
    <form className="space-y-4" data-scheda-categoria={nuova ? 'nuova' : voce.id}
      onSubmit={e => { e.preventDefault(); if (nome.trim() && !occupato) salva.mutate(); }}>
      <label className="block text-sm">
        <span className="text-tenue">Nome</span>
        <input name="nome" value={nome} onChange={e => setNome(e.target.value)} maxLength={100} autoComplete="off" required
          className="mt-1 w-full rounded-xl border border-bordo bg-fondo px-3 py-2" />
      </label>
      {rinomina && (
        <p className="rounded-xl bg-chiarire/10 p-2.5 text-sm text-chiarire" role="status" data-avviso-rinomina>
          Il nuovo nome passa anche a {g.uso(usi)}.
        </p>
      )}
      {g.campoTipo && (
        <fieldset>
          <legend className="mb-1 text-sm text-tenue">Di solito</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {TIPI.map(([v, t]) => (
              <button key={v} type="button" role="radio" aria-checked={tipo === v} data-tipo-categoria={v} onClick={() => setTipo(v)}
                className={`rounded-lg border px-2 py-2 text-sm ${tipo === v ? 'border-principale bg-principale font-semibold text-su-principale' : 'border-bordo'}`}>{t}</button>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend className="mb-1 text-sm text-tenue">Colore</legend>
        <div className="flex gap-3">
          {COLORI.map(c => (
            <button key={c} type="button" aria-label={`Colore ${c}`} aria-pressed={colore.toLowerCase() === c.toLowerCase()} onClick={() => setColore(c)}
              style={{ backgroundColor: c }} className={`h-8 w-8 rounded-full ${colore.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-principale ring-offset-2 ring-offset-superficie' : ''}`} />
          ))}
        </div>
      </fieldset>
      {err && <p role="alert" className="text-sm text-uscita">{err.message}</p>}
      <button type="submit" disabled={!nome.trim() || occupato} data-salva-categoria
        className="h-11 w-full rounded-xl bg-principale font-bold text-su-principale disabled:opacity-40">
        {salva.isPending ? 'Salvo…' : nuova ? 'Crea' : 'Salva'}
      </button>
      {!nuova && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" data-stato-categoria disabled={occupato} onClick={() => stato.mutate()}
            className="rounded-xl border border-bordo py-2 text-sm">{attiva(voce) ? 'Disattiva' : 'Riattiva'}</button>
          {conferma ? (
            <button type="button" data-elimina-categoria="conferma" disabled={occupato} onClick={() => elimina.mutate()}
              className="rounded-xl bg-uscita py-2 text-sm font-bold text-white">Sì, elimina</button>
          ) : (
            <button type="button" data-elimina-categoria disabled={occupato || usi > 0} onClick={() => setConferma(true)}
              className="rounded-xl border border-uscita py-2 text-sm text-uscita disabled:opacity-40">Elimina</button>
          )}
        </div>
      )}
      {!nuova && usi > 0 && <p className="text-xs text-tenue">In uso: si può disattivare, non eliminare.</p>}
    </form>
  );
}

export default function Categorie() {
  const [genere, setGenere] = useState('movimenti');
  const [aperta, setAperta] = useState(null);
  const q = useQuery({ queryKey: ['categorie', genere], queryFn: () => archivioApi.elenco(genere) });
  const g = GENERI[genere];
  const voci = q.data ?? [];

  return (
    <div className="space-y-4" data-categorie={genere}>
      <div className="flex items-center justify-between">
        <Link to="/impostazioni" className="inline-flex items-center gap-1 text-sm text-principale"><ChevronLeft size={16} aria-hidden="true" />Impostazioni</Link>
        <button type="button" data-nuova-categoria onClick={() => setAperta({})}
          className="inline-flex items-center gap-1 rounded-lg bg-accento px-3 py-1.5 text-sm font-semibold text-su-accento">
          <Plus size={16} aria-hidden="true" /> Nuova
        </button>
      </div>
      <h1 className="font-importi text-2xl text-secondario">Categorie</h1>
      <div className="flex rounded-xl bg-fondo p-1" role="tablist">
        {Object.entries(GENERI).map(([k, x]) => (
          <button key={k} type="button" role="tab" aria-selected={genere === k} data-genere={k} onClick={() => setGenere(k)}
            className={`flex-1 rounded-lg py-2 text-sm ${genere === k ? 'bg-superficie font-semibold shadow' : 'text-tenue'}`}>{x.titolo}</button>
        ))}
      </div>
      {q.isLoading && <p className="text-tenue" role="status">Caricamento…</p>}
      {q.isError && <p role="alert" className="text-uscita">{q.error.message}</p>}
      {q.isSuccess && voci.length === 0 && <p className="py-8 text-center text-tenue" data-categorie-vuote>Nessuna voce. Crea la prima con «Nuova».</p>}
      {voci.length > 0 && (
        <ul className="divide-y divide-bordo rounded-2xl border border-bordo bg-superficie">
          {voci.map(c => (
            <li key={c.id}>
              <button type="button" data-categoria={c.id} onClick={() => setAperta(c)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left ${attiva(c) ? '' : 'opacity-50'}`}>
                <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: c.colore || COLORI[0] }} />
                <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                {g.campoTipo && c[g.campoTipo] !== 'Entrambi' && <span className="text-xs text-tenue">{c[g.campoTipo]}</span>}
                {g.uso && <span className="text-xs text-tenue">{g.uso(Number(c.utilizzi ?? 0))}</span>}
                {!attiva(c) && <span className="text-xs text-tenue">disattivata</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <BottomSheet aperto={!!aperta} onChiudi={() => setAperta(null)} titolo={aperta?.id ? aperta.nome : `Nuova · ${g.titolo}`}>
        {aperta && <Scheda key={`${genere}-${aperta.id ?? 'nuova'}`} genere={genere} voce={aperta} onChiudi={() => setAperta(null)} />}
      </BottomSheet>
    </div>
  );
}

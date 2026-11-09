import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { registroApi } from '../api/registro';
import { archivioApi } from '../api/archivio';
import SelettoreControparte from './SelettoreControparte';
import Tastierino from './Tastierino';
import { Bottone, NuovaVoce } from './Bottoni';
import { nomeConto, useConti } from './conti';
import { VUOTO, daCentesimi, espressione, premi, problema, totale } from '../util/tastierino';
import { centesimiDa, daIncollare, formatta, perApi } from '../util/importi';
import { oggi } from '../util/date';

const TIPI = ['Uscita', 'Entrata'];
// Bottoni delle categorie in vista (tavola 1 A); le altre con «+ Altra».
const IN_VISTA = 4;
// Tasti della tastiera vera -> tasti del tastierino (U8a).
const TASTIERA = { ',': ',', '.': ',', Backspace: 'canc', Delete: 'canc', '+': '+', '-': '-', '=': '=' };

// Ogni lista e scheda che mostra movimenti, saldi o totali si ricarica.
export function aggiornaRegistro(qc) {
  for (const k of ['estratto', 'riepilogo', 'conti', 'conto', 'cerca-controparti', 'movimenti', 'movimento', 'controparti', 'controparte', 'report', 'categorie-movimenti']) {
    qc.invalidateQueries({ queryKey: [k] });
  }
}

// Registrazione e modifica di un movimento, «chi, poi quanto» (09/10/2026):
// prima la controparte, poi l'importo con tipo e conto gia' proposti.
//   iniziale: movimento da modificare (PUT) — si parte dall'importo;
//   controparte: controparte gia' scelta (dalla sua scheda) — si parte dall'importo.
// U8a: categoria a bottoni (proposta l'ultima usata con la controparte), nota a
// richiesta, importo anche incollato o scritto con la tastiera vera.
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
  const [categoria, setCategoria] = useState(iniziale ? iniziale.categoria ?? '' : proposta?.ultima_categoria ?? '');
  // Scelta a mano: la controparte cambiata dopo non la sovrascrive.
  const [categoriaScelta, setCategoriaScelta] = useState(!!iniziale);
  // Categorie aggiunte con «+»: il bottone resta anche se la si toglie.
  const [aggiunte, setAggiunte] = useState([]);
  const [note, setNote] = useState(iniziale?.note ?? '');
  const [notaAperta, setNotaAperta] = useState(!!iniziale?.note);
  const [erroreIncolla, setErroreIncolla] = useState(null);
  // Il conto del movimento anche se disattivato nel frattempo (non e' fra gli attivi).
  const conto = conti.find(c => c.id === contoId)
    || (iniziale && contoId === iniziale.conto_id ? { id: iniziale.conto_id, nome_banca: iniziale.nome_banca } : null)
    || contoProposto;
  // Un tocco, un movimento (U4): il ref blocca subito il secondo invio.
  const inviato = useRef(false);

  const cat = useQuery({ queryKey: ['categorie-movimenti', tipo], queryFn: () => registroApi.categorie(tipo), enabled: passo === 'quanto' });
  const tutte = cat.data?.categorie ?? [];
  const nome = categoria.trim();
  const inVista = tutte.slice(0, IN_VISTA);
  for (const x of [nome, ...aggiunte]) if (x && !inVista.some(c => c.nome === x)) inVista.push(tutte.find(c => c.nome === x) ?? { nome: x });
  const proposta_ = !categoriaScelta && nome && controparte?.ultima_categoria === nome;

  const salva = useMutation({
    mutationFn: async () => {
      // Una categoria nuova entra anche nell'elenco delle categorie (best effort:
      // se c'e' gia' o non si puo', il movimento si registra lo stesso).
      if (nome && !tutte.some(c => c.nome === nome)) {
        await archivioApi.crea('movimenti', { nome, tipo: 'Entrambi' }).catch(() => {});
      }
      const corpo = {
        data,
        anagrafica_id: controparte?.id ?? null,
        conto_id: conto.id,
        descrizione: descrizione.trim() || controparte?.nome,
        categoria: nome || null,
        note: note.trim() || null,
        importo: perApi(totale(tasti)),
        tipo
      };
      return iniziale ? registroApi.modifica(iniziale.id, corpo) : registroApi.registra(corpo);
    },
    onError: () => { inviato.current = false; },
    onSuccess: () => { aggiornaRegistro(qc); qc.invalidateQueries({ queryKey: ['categorie'] }); onFatto(); }
  });

  if (passo === 'chi') {
    return (
      <SelettoreControparte onScegli={a => {
        setControparte(a);
        if (a && TIPI.includes(a.tipo_movimento_preferito)) setTipo(a.tipo_movimento_preferito);
        if (!categoriaScelta) setCategoria(a?.ultima_categoria ?? '');
        setPasso('quanto');
      }} />
    );
  }

  const t = totale(tasti);
  const errore = !conto ? 'Nessun conto attivo'
    : problema(tasti) || (!descrizione.trim() && !controparte ? 'Scrivi una descrizione' : null);
  const tasto = k => { setErroreIncolla(null); setTasti(s => premi(s, k)); };
  const scegli = n => { setCategoriaScelta(true); setCategoria(n === nome ? '' : n); };

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

      {/* Importo: sopra il testo un campo invisibile che riceve «Incolla» (tenendo
          premuto sul telefono, Cmd/Ctrl+V da computer) e i tasti della tastiera vera.
          inputMode none: sul telefono non apre la tastiera di sistema. */}
      <div className="relative rounded-lg text-right focus-within:ring-2 focus-within:ring-principale/40" aria-live="polite">
        <p className="importo min-h-5 text-sm text-tenue" data-espressione>{espressione(tasti)}</p>
        <p className={`importo text-[40px] font-semibold leading-tight ${tipo === 'Uscita' ? 'text-uscita' : 'text-entrata'}`} data-totale={t}>
          {tipo === 'Uscita' ? '− ' : '+ '}{formatta(Math.abs(t))} €
        </p>
        <input name="importo" inputMode="none" autoComplete="off" value="" onChange={() => {}}
          aria-label="Importo: scrivi o incolla la cifra" data-campo-importo
          autoFocus={typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches}
          onPaste={e => {
            e.preventDefault();
            const r = daIncollare(e.clipboardData.getData('text'));
            if (r.c) { setTasti(daCentesimi(r.c)); setErroreIncolla(null); } else setErroreIncolla(r.errore);
          }}
          onKeyDown={e => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const k = /^\d$/.test(e.key) ? e.key : TASTIERA[e.key];
            if (k) { e.preventDefault(); tasto(k); }
          }}
          className="absolute inset-0 h-full w-full cursor-text opacity-0" style={{ caretColor: 'transparent' }} />
      </div>
      {erroreIncolla && <p role="alert" className="text-right text-sm text-uscita" data-errore-incolla>{erroreIncolla}</p>}

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

      <fieldset data-categorie-movimento>
        <legend className="flex w-full justify-between text-sm text-tenue">
          <span>Categoria</span>
          {proposta_ && <span data-categoria-proposta>proposta da {controparte.nome}</span>}
        </legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {inVista.map(c => (
            <Bottone key={c.nome} attivo={c.nome === nome} colore={c.colore ?? null} onClick={() => scegli(c.nome)} data-categoria-scelta={c.nome}>
              {c.nome}
            </Bottone>
          ))}
          <NuovaVoce nome="categoria" etichetta={tutte.length > IN_VISTA ? 'Altra' : 'Nuova'} segnaposto="Nome della categoria"
            suggerimenti={tutte.map(c => c.nome)} onAggiungi={n => { setCategoriaScelta(true); setCategoria(n); setAggiunte(a => (a.includes(n) ? a : [...a, n])); }} />
        </div>
      </fieldset>

      {notaAperta ? (
        <textarea name="note" value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={2000} autoFocus={!iniziale?.note}
          placeholder="Nota (facoltativa)" aria-label="Nota" className="w-full rounded-xl border border-bordo bg-fondo px-3 py-2" />
      ) : (
        <button type="button" data-aggiungi-nota onClick={() => setNotaAperta(true)}
          className="inline-flex items-center gap-2 text-[0.9375rem] text-principale">
          <Pencil size={16} aria-hidden="true" />Aggiungi una nota
        </button>
      )}

      <Tastierino onTasto={tasto} />

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

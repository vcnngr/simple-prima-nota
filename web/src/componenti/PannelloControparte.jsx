import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { registroApi } from '../api/registro';
import BottomSheet from './BottomSheet';
import { aggiornaRegistro } from './ModuloMovimento';

const DI_SOLITO = [['Uscita', 'Uscita'], ['Entrata', 'Entrata'], ['Entrambi', 'Tutte e due']];
const ALTRI = [['piva', 'Partita IVA', 20], ['email', 'Email', 100], ['telefono', 'Telefono', 20], ['indirizzo', 'Indirizzo', 300]];

// Modifica della controparte (U6a, tavola 3 A): nome, di solito entrata o uscita,
// categoria; P.IVA e contatti dietro una riga. Elimina solo senza movimenti
// (lo dice il server), altrimenti si disattiva: sparisce dalla ricerca.
export default function PannelloControparte({ c, aperto, onChiudi }) {
  const qc = useQueryClient();
  const vai = useNavigate();
  const [v, setV] = useState(() => ({
    nome: c.nome ?? '', tipo_movimento_preferito: c.tipo_movimento_preferito ?? 'Entrambi', categoria: c.categoria ?? '',
    piva: c.piva ?? '', email: c.email ?? '', telefono: c.telefono ?? '', indirizzo: c.indirizzo ?? ''
  }));
  const [altri, setAltri] = useState(false);
  const [conferma, setConferma] = useState(false);
  const campo = k => e => setV(x => ({ ...x, [k]: e.target.value }));
  const fatto = () => { aggiornaRegistro(qc); };

  const salva = useMutation({
    mutationFn: () => registroApi.modificaControparte(c.id, {
      ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim() || null])),
      nome: v.nome.trim().replace(/\s+/g, ' '),
      tipo_movimento_preferito: v.tipo_movimento_preferito
    }),
    onSuccess: () => { fatto(); onChiudi(); }
  });
  const attiva = useMutation({
    mutationFn: () => registroApi.modificaControparte(c.id, { attivo: !c.attivo }),
    onSuccess: () => { fatto(); onChiudi(); }
  });
  const elimina = useMutation({
    mutationFn: () => registroApi.eliminaControparte(c.id),
    onSuccess: () => { fatto(); vai('/controparti', { replace: true }); }
  });
  const errore = salva.error || attiva.error || elimina.error;
  const occupato = salva.isPending || attiva.isPending || elimina.isPending;

  return (
    <BottomSheet aperto={aperto} onChiudi={onChiudi} titolo="Modifica controparte" piede={
      <button type="submit" form="pannello-controparte" disabled={!v.nome.trim() || occupato} data-salva-controparte
        className="h-12 w-full rounded-xl bg-principale font-bold text-su-principale disabled:opacity-40">
        {salva.isPending ? 'Salvataggio…' : 'Salva'}
      </button>
    }>
      <form id="pannello-controparte" className="space-y-3" onSubmit={e => { e.preventDefault(); if (v.nome.trim() && !occupato) salva.mutate(); }}>
        <label className="block text-sm">
          <span className="text-tenue">Nome</span>
          <input name="nome" value={v.nome} onChange={campo('nome')} maxLength={100} required
            className="mt-1 w-full rounded-xl border border-bordo bg-fondo px-3 py-2" />
        </label>
        <fieldset>
          <legend className="text-sm text-tenue">Di solito</legend>
          {c.tipologia_id && <p className="text-xs text-tenue">Lo decide la tipologia «{c.tipologia_nome}».</p>}
          <div className="mt-1 flex rounded-xl bg-fondo p-1" role="radiogroup" aria-label="Di solito">
            {DI_SOLITO.map(([k, t]) => (
              <button key={k} type="button" role="radio" aria-checked={v.tipo_movimento_preferito === k} data-di-solito={k}
                disabled={!!c.tipologia_id} onClick={() => setV(x => ({ ...x, tipo_movimento_preferito: k }))}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold disabled:opacity-60 ${v.tipo_movimento_preferito === k ? 'bg-superficie shadow' : 'text-tenue'}`}>{t}</button>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm">
          <span className="text-tenue">Categoria</span>
          <input name="categoria" value={v.categoria} onChange={campo('categoria')} maxLength={100} placeholder="es. Utenze"
            className="mt-1 w-full rounded-xl border border-bordo bg-fondo px-3 py-2" />
        </label>
        <button type="button" onClick={() => setAltri(x => !x)} aria-expanded={altri} data-altri-dati
          className="flex w-full items-center justify-between border-t border-bordo pt-3 text-sm text-principale">
          P.IVA, contatti, indirizzo <ChevronDown size={16} aria-hidden="true" className={altri ? 'rotate-180' : ''} />
        </button>
        {altri && ALTRI.map(([k, t, max]) => (
          <label key={k} className="block text-sm">
            <span className="text-tenue">{t}</span>
            <input name={k} value={v[k]} onChange={campo(k)} maxLength={max} type={k === 'email' ? 'email' : 'text'}
              className="mt-1 w-full rounded-xl border border-bordo bg-fondo px-3 py-2" />
          </label>
        ))}
        {errore && <p role="alert" className="text-sm text-uscita">{errore.message}</p>}
        <div className="flex gap-2 border-t border-bordo pt-3 text-sm">
          <button type="button" data-attiva-controparte disabled={occupato} onClick={() => attiva.mutate()}
            className="flex-1 rounded-xl border border-bordo py-2 font-semibold">{c.attivo ? 'Disattiva' : 'Riattiva'}</button>
          {conferma ? (
            <button type="button" data-elimina-controparte="conferma" disabled={occupato} onClick={() => elimina.mutate()}
              className="flex-1 rounded-xl bg-uscita py-2 font-bold text-white">Sì, elimina</button>
          ) : (
            <button type="button" data-elimina-controparte disabled={occupato} onClick={() => setConferma(true)}
              className="flex-1 rounded-xl border border-uscita py-2 font-semibold text-uscita">Elimina</button>
          )}
        </div>
        {c.attivo === false && <p className="text-xs text-tenue">Disattivata: non compare nella ricerca di «Chi?».</p>}
      </form>
    </BottomSheet>
  );
}

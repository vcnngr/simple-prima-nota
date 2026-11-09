import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { registroApi } from '../api/registro';
import BottomSheet from './BottomSheet';
import { aggiornaRegistro } from './ModuloMovimento';
import { archivioApi } from '../api/archivio';
import { Bottone, NuovaVoce } from './Bottoni';

// Colori proposti per una tipologia nuova (gli stessi della pagina Categorie).
const COLORI = ['#2B5D8A', '#2F6B4F', '#C08A1E', '#B4442E', '#7A4E9C', '#6B7280'];

const DI_SOLITO = [['Uscita', 'Uscita'], ['Entrata', 'Entrata'], ['Entrambi', 'Tutte e due']];
const ALTRI = [['piva', 'Partita IVA', 20], ['email', 'Email', 100], ['telefono', 'Telefono', 20], ['indirizzo', 'Indirizzo', 300]];

// Modifica della controparte (U6a, tavola 3 A): nome, di solito entrata o uscita,
// categoria; P.IVA e contatti dietro una riga. Elimina solo senza movimenti
// (lo dice il server), altrimenti si disattiva: sparisce dalla ricerca.
// U8b: senza c.id e' «Nuova controparte» (POST), poi si apre la sua scheda.
export default function PannelloControparte({ c, aperto, onChiudi }) {
  const nuova = !c.id;
  const qc = useQueryClient();
  const vai = useNavigate();
  const [v, setV] = useState(() => ({
    nome: c.nome ?? '', tipo_movimento_preferito: c.tipo_movimento_preferito ?? 'Entrambi', categoria: c.categoria ?? '',
    tipologia_id: c.tipologia_id ?? null,
    piva: c.piva ?? '', email: c.email ?? '', telefono: c.telefono ?? '', indirizzo: c.indirizzo ?? ''
  }));
  const [altri, setAltri] = useState(nuova);
  const [conferma, setConferma] = useState(false);
  const campo = k => e => setV(x => ({ ...x, [k]: e.target.value }));
  const fatto = () => { aggiornaRegistro(qc); };
  // U8a (tavola 2 A): tipologia e categoria a bottoni, «+ Nuova» al volo.
  const tip = useQuery({ queryKey: ['categorie', 'tipologie'], queryFn: () => archivioApi.elenco('tipologie') });
  const cat = useQuery({ queryKey: ['categorie', 'controparti'], queryFn: () => archivioApi.elenco('controparti') });
  const tipologie = (tip.data ?? []).filter(t => t.attiva !== false || t.id === v.tipologia_id);
  const categorie = (cat.data ?? []).filter(x => x.attiva !== false || x.nome === v.categoria);
  const tipologia = (tip.data ?? []).find(t => t.id === v.tipologia_id) ?? null;
  // Con una tipologia «di solito» lo decide lei (trigger del database).
  const diSolito = tipologia ? tipologia.tipo_movimento_default || 'Entrambi' : v.tipo_movimento_preferito;
  const creaTipologia = useMutation({
    mutationFn: nome => archivioApi.crea('tipologie', { nome, colore: COLORI[(tip.data ?? []).length % COLORI.length], tipo_movimento_default: v.tipo_movimento_preferito }),
    onSuccess: t => { qc.invalidateQueries({ queryKey: ['categorie'] }); setV(x => ({ ...x, tipologia_id: t.id })); }
  });
  const creaCategoria = useMutation({
    mutationFn: nome => archivioApi.crea('controparti', { nome }),
    onSuccess: (_, nome) => { qc.invalidateQueries({ queryKey: ['categorie'] }); setV(x => ({ ...x, categoria: nome })); }
  });

  const salva = useMutation({
    mutationFn: () => (nuova ? registroApi.creaControparte : corpo => registroApi.modificaControparte(c.id, corpo))({
      ...Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'tipologia_id').map(([k, x]) => [k, x.trim() || null])),
      nome: v.nome.trim().replace(/\s+/g, ' '),
      tipologia_id: v.tipologia_id,
      tipo_movimento_preferito: diSolito
    }),
    onSuccess: r => { fatto(); onChiudi(); if (nuova && r?.id) vai(`/controparti/${r.id}`); }
  });
  const attiva = useMutation({
    mutationFn: () => registroApi.modificaControparte(c.id, { attivo: !c.attivo }),
    onSuccess: () => { fatto(); onChiudi(); }
  });
  const elimina = useMutation({
    mutationFn: () => registroApi.eliminaControparte(c.id),
    onSuccess: () => { fatto(); vai('/controparti', { replace: true }); }
  });
  const errore = salva.error || attiva.error || elimina.error || creaTipologia.error || creaCategoria.error;
  const occupato = salva.isPending || attiva.isPending || elimina.isPending;

  return (
    <BottomSheet aperto={aperto} onChiudi={onChiudi} titolo={nuova ? 'Nuova controparte' : 'Modifica controparte'} piede={
      <button type="submit" form="pannello-controparte" disabled={!v.nome.trim() || occupato} data-salva-controparte
        className="h-12 w-full rounded-xl bg-principale font-bold text-su-principale disabled:opacity-40">
        {salva.isPending ? 'Salvataggio…' : nuova ? 'Crea la controparte' : 'Salva'}
      </button>
    }>
      <form id="pannello-controparte" className="space-y-3" onSubmit={e => { e.preventDefault(); if (v.nome.trim() && !occupato) salva.mutate(); }}>
        <label className="block text-sm">
          <span className="text-tenue">Nome</span>
          <input name="nome" value={v.nome} onChange={campo('nome')} maxLength={100} required autoFocus={nuova}
            className="mt-1 w-full rounded-xl border border-bordo bg-fondo px-3 py-2" />
        </label>
        <fieldset data-tipologie-controparte>
          <legend className="text-sm text-tenue">Tipologia</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {tipologie.map(t => (
              <Bottone key={t.id} attivo={t.id === v.tipologia_id} colore={t.colore} data-tipologia-scelta={t.id}
                onClick={() => setV(x => ({ ...x, tipologia_id: x.tipologia_id === t.id ? null : t.id }))}>{t.nome}</Bottone>
            ))}
            <NuovaVoce nome="tipologia" segnaposto="Nome della tipologia" occupato={creaTipologia.isPending}
              onAggiungi={n => creaTipologia.mutate(n)} />
          </div>
        </fieldset>
        <fieldset>
          <legend className="flex w-full justify-between text-sm text-tenue">
            <span>Di solito</span>{tipologia && <span>dalla tipologia</span>}
          </legend>
          <div className="mt-1 flex rounded-xl bg-fondo p-1" role="radiogroup" aria-label="Di solito">
            {DI_SOLITO.map(([k, t]) => (
              <button key={k} type="button" role="radio" aria-checked={diSolito === k} data-di-solito={k}
                disabled={!!tipologia} onClick={() => setV(x => ({ ...x, tipo_movimento_preferito: k }))}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold disabled:opacity-60 ${diSolito === k ? 'bg-superficie shadow' : 'text-tenue'}`}>{t}</button>
            ))}
          </div>
        </fieldset>
        <fieldset data-categorie-controparte>
          <legend className="text-sm text-tenue">Categoria</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {categorie.map(x => (
              <Bottone key={x.id} attivo={x.nome === v.categoria} data-categoria-controparte={x.nome}
                onClick={() => setV(y => ({ ...y, categoria: y.categoria === x.nome ? '' : x.nome }))}>{x.nome}</Bottone>
            ))}
            {v.categoria && !categorie.some(x => x.nome === v.categoria) && (
              <Bottone attivo onClick={() => setV(y => ({ ...y, categoria: '' }))}>{v.categoria}</Bottone>
            )}
            <NuovaVoce nome="categoria-controparte" segnaposto="Nome della categoria" occupato={creaCategoria.isPending}
              onAggiungi={n => (categorie.some(x => x.nome === n) ? setV(y => ({ ...y, categoria: n })) : creaCategoria.mutate(n))} />
          </div>
        </fieldset>
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
        {!nuova && <div className="flex gap-2 border-t border-bordo pt-3 text-sm">
          <button type="button" data-attiva-controparte disabled={occupato} onClick={() => attiva.mutate()}
            className="flex-1 rounded-xl border border-bordo py-2 font-semibold">{c.attivo ? 'Disattiva' : 'Riattiva'}</button>
          {conferma ? (
            <button type="button" data-elimina-controparte="conferma" disabled={occupato} onClick={() => elimina.mutate()}
              className="flex-1 rounded-xl bg-uscita py-2 font-bold text-white">Sì, elimina</button>
          ) : (
            <button type="button" data-elimina-controparte disabled={occupato} onClick={() => setConferma(true)}
              className="flex-1 rounded-xl border border-uscita py-2 font-semibold text-uscita">Elimina</button>
          )}
        </div>}
        {c.attivo === false && <p className="text-xs text-tenue">Disattivata: non compare nella ricerca di «Chi?».</p>}
      </form>
    </BottomSheet>
  );
}

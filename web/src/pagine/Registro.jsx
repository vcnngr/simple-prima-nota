import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Download, Search, SlidersHorizontal, Users, X } from 'lucide-react';
import { registroApi } from '../api/registro';
import BottomSheet from '../componenti/BottomSheet';
import ListaInfinita from '../componenti/ListaInfinita';
import RigaMovimento from '../componenti/RigaMovimento';
import DettaglioMovimento from '../componenti/DettaglioMovimento';
import { aggiornaRegistro } from '../componenti/ModuloMovimento';
import { datiRiga, perGiorno } from '../componenti/righe/comune';
import { alternaConto, contiScelti, nomeConto, scriviConti, useConti } from '../componenti/conti';
import { centesimiDa, formatta, leggi, perApi as importoApi } from '../util/importi';
import { archivioApi } from '../api/archivio';
import { Bottone } from '../componenti/Bottoni';
import { etichettaPeriodo, giornoLungo, periodo } from '../util/date';
import Fascia from '../componenti/Fascia';
import TabellaRegistro from '../componenti/TabellaRegistro';

// Filtri nell'indirizzo (si condividono e sopravvivono al ritorno indietro).
// U8a: tipologie della controparte (id), categorie (cat, ripetuto), importo da/a (euro, "12.50").
const CHIAVI = ['q', 'tipo', 'conto', 'dal', 'al', 'controparte', 'chiarire', 'tipologie', 'da', 'a'];
const IMPORTO = /^\d{1,10}(\.\d{1,2})?$/;
const GIORNO = /^\d{4}-\d{2}-\d{2}$/;

function leggiFiltri(p) {
  const f = {};
  for (const k of CHIAVI) { const v = p.get(k); if (v) f[k] = v; }
  if (f.tipo && !['Entrata', 'Uscita'].includes(f.tipo)) delete f.tipo;
  if (f.controparte && !/^[1-9]\d{0,9}$/.test(f.controparte)) delete f.controparte;
  // Uno o piu' conti (U7b), normalizzati: stessa scelta, stesso indirizzo.
  if (f.conto) { const v = scriviConti(contiScelti(f.conto)); if (v) f.conto = v; else delete f.conto; }
  for (const k of ['dal', 'al']) if (f[k] && !GIORNO.test(f[k])) delete f[k];
  if (f.chiarire !== '1') delete f.chiarire;
  if (f.tipologie) { const v = scriviConti(contiScelti(f.tipologie)); if (v) f.tipologie = v; else delete f.tipologie; }
  const cat = [...new Set(p.getAll('cat').map(x => x.trim()).filter(x => x && x.length <= 100))].slice(0, 50);
  if (cat.length) f.cat = cat;
  for (const k of ['da', 'a']) if (f[k] && !IMPORTO.test(f[k])) delete f[k];
  return f;
}

// Per l'API: nomi del server.
function perApi(f) {
  return {
    search: f.q, tipo: f.tipo, conti: f.conto, data_inizio: f.dal, data_fine: f.al,
    anagrafica_id: f.controparte, da_chiarire: f.chiarire ? 'true' : undefined,
    tipologie: f.tipologie, categorie: f.cat, importo_min: f.da, importo_max: f.a
  };
}

function Chip({ attiva, onClick, children, ...resto }) {
  return (
    <button type="button" onClick={onClick} {...resto}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${
        attiva ? 'border-principale bg-principale font-bold text-su-principale' : 'border-bordo bg-superficie'}`}>
      {children}
    </button>
  );
}

// Conti da sommare (U7b): «Tutti» svuota la scelta, gli altri si aggiungono o si tolgono.
function ScelteConti({ conti, scelta, onScegli }) {
  const ids = contiScelti(scelta);
  return (
    <>
      <Chip attiva={!ids.length} data-filtro-conto="tutti" onClick={() => onScegli(null)}>Tutti</Chip>
      {conti.map(c => (
        <Chip key={c.id} attiva={ids.includes(String(c.id))} aria-pressed={ids.includes(String(c.id))} data-filtro-conto={c.id}
          onClick={() => onScegli(alternaConto(ids, c.id))}>{nomeConto(c)}</Chip>
      ))}
    </>
  );
}

// Scelta dei conti da computer: un pulsante e un pannello con le stesse scelte.
function PulsanteConti({ conti, scelta, onScegli, className }) {
  const [aperto, setAperto] = useState(false);
  const [b, setB] = useState(scelta);
  const ids = contiScelti(scelta);
  const uno = ids.length === 1 && conti.find(c => String(c.id) === ids[0]);
  return (
    <>
      <button type="button" data-scelta-conto={scelta ?? ''} onClick={() => { setB(scelta); setAperto(true); }}
        className={`${className} inline-flex items-center gap-2`}>
        {!ids.length ? 'Tutti i conti' : uno ? nomeConto(uno) : `${ids.length} conti`}<ChevronDown size={16} aria-hidden="true" />
      </button>
      <BottomSheet aperto={aperto} onChiudi={() => setAperto(false)} titolo="Conti da vedere"
        piede={<button type="button" data-applica-conti onClick={() => { onScegli(b); setAperto(false); }} className="h-12 w-full rounded-xl bg-principale font-bold text-su-principale">Mostra</button>}>
        <p className="mb-3 text-sm text-tenue">Scegli uno o più conti: saldo e righe si calcolano solo su quelli.</p>
        <div className="flex flex-wrap gap-2" data-pannello-conti><ScelteConti conti={conti} scelta={b} onScegli={setB} /></div>
      </BottomSheet>
    </>
  );
}

const PERIODI = [['mese', 'Questo mese'], ['mese_scorso', 'Mese scorso'], ['anno', "Quest'anno"], ['tutto', 'Sempre']];

// Pannello dei filtri: si lavora su una bozza, «Mostra» la applica.
// soloAltri (computer, tavola 3 B): solo tipologia, categoria e importo, gli
// altri filtri stanno nella barra.
function PannelloFiltri({ filtri, conti, onApplica, onChiudi, soloAltri = false }) {
  const [b, setB] = useState(filtri);
  const metti = (k, v) => setB(x => { const y = { ...x }; if (Array.isArray(v) ? v.length : v) y[k] = v; else delete y[k]; return y; });
  const sceltaPeriodo = PERIODI.find(([k]) => { const p = periodo(k); return (p.dal ?? undefined) === b.dal && (p.al ?? undefined) === b.al; })?.[0];
  return (
    <BottomSheet aperto onChiudi={onChiudi} titolo={soloAltri ? 'Altri filtri' : 'Filtri'} lato={soloAltri}
      piede={<button type="button" data-applica onClick={() => onApplica(b)} className="h-12 w-full rounded-xl bg-principale font-bold text-su-principale">Mostra i movimenti</button>}>
      <div className="space-y-4" data-pannello-filtri={soloAltri ? 'altri' : 'tutti'}>
        {!soloAltri && <>
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-tenue">Periodo</h3>
          <div className="flex flex-wrap gap-2">
            {PERIODI.map(([k, e]) => (
              <Chip key={k} attiva={sceltaPeriodo === k} data-periodo={k}
                onClick={() => { const p = periodo(k); metti('dal', p.dal); metti('al', p.al); }}>{e}</Chip>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input type="date" aria-label="Dal" value={b.dal ?? ''} onChange={e => metti('dal', e.target.value)} name="dal"
              className="min-w-0 flex-1 rounded-xl border border-bordo bg-fondo px-3 py-2" />
            <input type="date" aria-label="Al" value={b.al ?? ''} onChange={e => metti('al', e.target.value)} name="al"
              className="min-w-0 flex-1 rounded-xl border border-bordo bg-fondo px-3 py-2" />
          </div>
        </section>
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-tenue">Tipo</h3>
          <div className="flex gap-2">
            <Chip attiva={!b.tipo} onClick={() => metti('tipo')}>Tutti</Chip>
            <Chip attiva={b.tipo === 'Entrata'} data-filtro-tipo="Entrata" onClick={() => metti('tipo', 'Entrata')}>Entrate</Chip>
            <Chip attiva={b.tipo === 'Uscita'} data-filtro-tipo="Uscita" onClick={() => metti('tipo', 'Uscita')}>Uscite</Chip>
          </div>
        </section>
        {conti.length > 1 && (
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-tenue">Conto</h3>
            <div className="flex flex-wrap gap-2">
              <ScelteConti conti={conti} scelta={b.conto} onScegli={v => metti('conto', v)} />
            </div>
          </section>
        )}
        <label className="flex items-center justify-between gap-3 rounded-xl border border-bordo px-3 py-2.5">
          <span>Solo quelli da chiarire con lo studio</span>
          <input type="checkbox" checked={!!b.chiarire} onChange={e => metti('chiarire', e.target.checked ? '1' : null)} className="h-5 w-5" data-filtro-chiarire />
        </label>
        </>}
        <AltriFiltri b={b} metti={metti} />
      </div>
    </BottomSheet>
  );
}

// Tipologia della controparte, categoria del movimento, importo (U8a, tavola 3 B).
function AltriFiltri({ b, metti }) {
  const tip = useQuery({ queryKey: ['categorie', 'tipologie'], queryFn: () => archivioApi.elenco('tipologie') });
  const cat = useQuery({ queryKey: ['categorie-movimenti', null], queryFn: () => registroApi.categorie() });
  const tipologie = tip.data ?? [];
  const categorie = cat.data?.categorie ?? [];
  const sceltiT = contiScelti(b.tipologie);
  const sceltiC = b.cat ?? [];
  const [da, setDa] = useState(b.da ? b.da.replace('.', ',') : '');
  const [a, setA] = useState(b.a ? b.a.replace('.', ',') : '');
  const importo = (k, testo, set) => {
    set(testo);
    const c = testo.trim() ? leggi(testo) : null;
    metti(k, c != null && c >= 0 ? importoApi(c) : null);
  };
  const errato = t => t.trim() && (leggi(t) == null || leggi(t) < 0);
  const titolo = t => <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-tenue">{t}</h3>;
  return (
    <>
      {tipologie.length > 0 && (
        <section data-filtro-tipologie>
          {titolo('Tipologia della controparte')}
          <div className="flex flex-wrap gap-2">
            {tipologie.map(t => (
              <Bottone key={t.id} attivo={sceltiT.includes(String(t.id))} colore={t.colore} data-filtro-tipologia={t.id}
                onClick={() => metti('tipologie', alternaConto(sceltiT, t.id))}>{t.nome}</Bottone>
            ))}
          </div>
        </section>
      )}
      {categorie.length > 0 && (
        <section data-filtro-categorie>
          {titolo('Categoria')}
          <ul className="space-y-0.5">
            {categorie.map(c => (
              <li key={c.nome}>
                <label className="flex cursor-pointer items-center gap-3 py-1.5">
                  <input type="checkbox" className="h-5 w-5 shrink-0" checked={sceltiC.includes(c.nome)} data-filtro-categoria={c.nome}
                    onChange={e => metti('cat', e.target.checked ? [...sceltiC, c.nome] : sceltiC.filter(x => x !== c.nome))} />
                  <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                  <span className="importo text-sm text-tenue">{c.utilizzi}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        {titolo('Importo')}
        <div className="flex gap-2">
          {[['da', da, setDa, 'da €'], ['a', a, setA, 'a €']].map(([k, v, set, seg]) => (
            <input key={k} name={`importo-${k}`} inputMode="decimal" autoComplete="off" value={v} placeholder={seg} aria-label={`Importo ${seg}`}
              onChange={e => importo(k, e.target.value, set)} aria-invalid={!!errato(v)}
              className={`importo min-w-0 flex-1 rounded-xl border bg-fondo px-3 py-2 ${errato(v) ? 'border-uscita' : 'border-bordo'}`} />
          ))}
        </div>
        {(errato(da) || errato(a)) && <p role="alert" className="mt-1 text-sm text-uscita">Importo non valido (es. 1.250,00).</p>}
      </section>
    </>
  );
}

// Eliminazione con 5 secondi per annullare (scorrimento, variante C).
function useEliminaDopo() {
  const qc = useQueryClient();
  const [inAttesa, setInAttesa] = useState(null); // { id, timer }
  const [errore, setErrore] = useState(null);
  const ref = useRef(null);
  ref.current = inAttesa;

  const esegui = async id => {
    setInAttesa(x => (x?.id === id ? null : x));
    try { await registroApi.elimina(id); } catch (e) { setErrore(e.message); }
    aggiornaRegistro(qc);
  };
  const elimina = id => {
    if (ref.current) { clearTimeout(ref.current.timer); esegui(ref.current.id); }
    setErrore(null);
    setInAttesa({ id, timer: setTimeout(() => esegui(id), 5000) });
  };
  const annulla = () => { if (ref.current) clearTimeout(ref.current.timer); setInAttesa(null); };
  // Lasciando la pagina l'eliminazione chiesta si compie subito.
  useEffect(() => () => { if (ref.current) { clearTimeout(ref.current.timer); registroApi.elimina(ref.current.id).finally(() => aggiornaRegistro(qc)); } }, [qc]);
  return { nascosto: inAttesa?.id, elimina, annulla, errore, chiudiErrore: () => setErrore(null) };
}

// Da lg (1024 px) la tabella, sotto la lista: se ne disegna una sola.
const MQ = '(min-width: 1024px)';
function useLargo() {
  const [v, setV] = useState(() => window.matchMedia(MQ).matches);
  useEffect(() => {
    const m = window.matchMedia(MQ);
    const f = () => setV(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return v;
}

const PERIODO_SCELTE = [['', 'Sempre'], ...PERIODI.filter(([k]) => k !== 'tutto')];
const selettore = 'h-11 rounded-lg border border-bordo bg-superficie px-3 text-[1rem]';

// Il Registro (U7, tavola A): pagina iniziale dell'utente. Fascia dei saldi,
// poi i movimenti di tutti i conti (o del conto scelto) col saldo riga per riga.
// Da lg una tabella a tutta larghezza; sotto, la lista del telefono.
export default function Registro() {
  const [params, setParams] = useSearchParams();
  const filtri = useMemo(() => leggiFiltri(params), [params]);
  const { conti } = useConti();
  const [testo, setTesto] = useState(filtri.q ?? '');
  const [pannello, setPannello] = useState(false); // false | 'tutti' | 'altri'
  const [aperto, setAperto] = useState(null); // { id, modo }
  const el = useEliminaDopo();
  const riepilogo = useQuery({ queryKey: ['riepilogo', filtri.conto ?? null], queryFn: () => registroApi.riepilogo({ conti: filtri.conto }),
    placeholderData: keepPreviousData });

  const imposta = f => setParams(Object.fromEntries(Object.entries(f).filter(([, v]) => (Array.isArray(v) ? v.length : v))), { replace: true });
  const togli = (...k) => { const f = { ...filtri }; for (const x of k) delete f[x]; imposta(f); };

  // Ricerca mentre si scrive, con un attimo di respiro.
  useEffect(() => {
    const t = setTimeout(() => { if ((filtri.q ?? '') !== testo.trim()) imposta({ ...filtri, q: testo.trim() }); }, 300);
    return () => clearTimeout(t);
  }, [testo]); // eslint-disable-line react-hooks/exhaustive-deps

  const nomeControparte = useQuery({
    queryKey: ['controparte', Number(filtri.controparte)], enabled: !!filtri.controparte,
    queryFn: () => registroApi.controparte(filtri.controparte)
  }).data?.nome;

  const lista = useInfiniteQuery({
    queryKey: ['movimenti', filtri],
    initialPageParam: undefined,
    queryFn: ({ pageParam }) => registroApi.movimenti({ dopo: pageParam, filtri: perApi(filtri) }),
    getNextPageParam: p => p.pagination?.cursore ?? undefined
  });
  const righe = useMemo(() => (lista.data?.pages ?? []).flatMap(p => p.movimenti).filter(m => m.id !== el.nascosto).map(datiRiga),
    [lista.data, el.nascosto]);
  const gruppi = useMemo(() => perGiorno(righe), [righe]);
  const tot = lista.data?.pages?.[0]?.totali;
  const ids = contiScelti(filtri.conto);
  const conto = ids.length === 1 ? conti.find(c => String(c.id) === ids[0]) : null;
  const tipologie = useQuery({ queryKey: ['categorie', 'tipologie'], queryFn: () => archivioApi.elenco('tipologie'), enabled: !!filtri.tipologie }).data ?? [];
  const euro = v => formatta(centesimiDa(v) ?? 0);
  // Etichette di tipologie, categorie e importo: una per voce, si tolgono una a una.
  const altre = [
    ...contiScelti(filtri.tipologie).map(id => ({ k: ['tipologie'], id: `t${id}`, e: tipologie.find(t => String(t.id) === id)?.nome ?? 'Tipologia',
      via: () => imposta({ ...filtri, tipologie: scriviConti(contiScelti(filtri.tipologie).filter(x => x !== id)) || null }) })),
    ...(filtri.cat ?? []).map(n => ({ k: ['cat'], id: `c${n}`, e: n, via: () => imposta({ ...filtri, cat: filtri.cat.filter(x => x !== n) }) })),
    (filtri.da || filtri.a) && { k: ['da', 'a'], id: 'importo',
      e: filtri.da && filtri.a ? `da ${euro(filtri.da)} a ${euro(filtri.a)} €` : filtri.da ? `da ${euro(filtri.da)} €` : `fino a ${euro(filtri.a)} €` }
  ].filter(Boolean);
  const etichette = [
    (filtri.dal || filtri.al) && { k: ['dal', 'al'], e: etichettaPeriodo(filtri.dal, filtri.al) },
    filtri.tipo && { k: ['tipo'], e: filtri.tipo === 'Entrata' ? 'Entrate' : 'Uscite' },
    filtri.conto && { k: ['conto'], e: ids.length > 1 ? `${ids.length} conti` : conto ? conto.nome_banca : 'Conto' },
    filtri.controparte && { k: ['controparte'], e: nomeControparte || 'Controparte' },
    filtri.chiarire && { k: ['chiarire'], e: 'Da chiarire' },
    ...altre
  ].filter(Boolean);
  const sceltaPeriodo = (filtri.dal || filtri.al)
    ? PERIODI.find(([k]) => { const p = periodo(k); return (p.dal ?? undefined) === filtri.dal && (p.al ?? undefined) === filtri.al; })?.[0] ?? 'altro'
    : '';
  const apri = id => setAperto({ id, modo: 'vedi' });
  const largo = useLargo();

  return (
    <div className="-mx-4 md:mx-0" data-pagina="movimenti">
      <Fascia r={riepilogo.data} conto={filtri.conto} onConto={id => imposta({ ...filtri, conto: id })}
        chiarire={!!filtri.chiarire} onChiarire={() => imposta({ ...filtri, chiarire: filtri.chiarire ? null : '1' })} />

      {/* Barra dei filtri da computer */}
      <div className="mt-4 hidden flex-wrap items-center gap-2 lg:flex" data-filtri-largo>
        <label className="flex h-11 min-w-64 flex-1 items-center gap-2 rounded-lg border border-bordo bg-superficie px-3">
          <Search size={18} aria-hidden="true" className="text-tenue" />
          <input name="cerca-largo" value={testo} onChange={e => setTesto(e.target.value)} maxLength={100} autoComplete="off"
            placeholder="Cerca controparte, descrizione…" aria-label="Cerca nel registro" className="min-w-0 flex-1 bg-transparent text-[1rem] outline-none" />
          {testo && <button type="button" aria-label="Svuota la ricerca" onClick={() => setTesto('')}><X size={16} aria-hidden="true" /></button>}
        </label>
        <select aria-label="Periodo" data-scelta-periodo value={sceltaPeriodo} className={selettore}
          onChange={e => { const p = periodo(e.target.value || 'tutto'); imposta({ ...filtri, dal: p.dal, al: p.al }); }}>
          {PERIODO_SCELTE.map(([k, e]) => <option key={k} value={k}>{e}</option>)}
          {sceltaPeriodo === 'altro' && <option value="altro" disabled>{etichettaPeriodo(filtri.dal, filtri.al)}</option>}
        </select>
        {conti.length > 1 && (
          <PulsanteConti conti={conti} scelta={filtri.conto} className={selettore} onScegli={v => imposta({ ...filtri, conto: v })} />
        )}
        <select aria-label="Tipo" data-scelta-tipo value={filtri.tipo ?? ''} className={selettore}
          onChange={e => imposta({ ...filtri, tipo: e.target.value })}>
          <option value="">Entrate e uscite</option>
          <option value="Entrata">Solo entrate</option>
          <option value="Uscita">Solo uscite</option>
        </select>
        {filtri.controparte && (
          <Chip attiva onClick={() => togli('controparte')} aria-label={`Togli il filtro ${nomeControparte || 'Controparte'}`} data-togli="controparte">
            {nomeControparte || 'Controparte'}<X size={14} aria-hidden="true" />
          </Chip>
        )}
        <button type="button" data-apri-altri onClick={() => setPannello('altri')}
          className={`${selettore} inline-flex items-center gap-2 ${altre.length ? 'border-principale font-semibold text-principale' : ''}`}>
          <SlidersHorizontal size={18} aria-hidden="true" />Altri filtri{altre.length ? ` · ${altre.length}` : ''}
        </button>
        <Link to="/archivio" data-link-esporta className={`${selettore} inline-flex items-center gap-2`}>
          <Download size={18} aria-hidden="true" />Esporta
        </Link>
      </div>
      {altre.length > 0 && (
        <div className="mt-2 hidden flex-wrap items-center gap-2 lg:flex" data-etichette-largo>
          {altre.map(x => (
            <Chip key={x.id} attiva onClick={() => (x.via ? x.via() : togli(...x.k))} aria-label={`Togli il filtro ${x.e}`} data-togli-largo={x.id}>
              {x.e}<X size={14} aria-hidden="true" />
            </Chip>
          ))}
          <button type="button" onClick={() => togli('tipologie', 'cat', 'da', 'a')} data-togli-altri className="px-2 text-sm text-principale">Togli tutti</button>
        </div>
      )}

      {/* Ricerca e filtri del telefono */}
      <div className="mt-3 lg:hidden">
        <div className="flex items-center gap-2 px-4 md:px-0">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-bordo bg-superficie px-3 py-2">
            <Search size={18} aria-hidden="true" className="text-tenue" />
            <input name="cerca" value={testo} onChange={e => setTesto(e.target.value)} maxLength={100} autoComplete="off"
              placeholder="Cerca descrizione, controparte…" aria-label="Cerca nei movimenti" className="min-w-0 flex-1 bg-transparent outline-none" />
            {testo && <button type="button" aria-label="Svuota la ricerca" onClick={() => setTesto('')}><X size={16} aria-hidden="true" /></button>}
          </label>
          <Link to="/controparti" aria-label="Controparti" data-link-controparti className="rounded-xl border border-bordo bg-superficie p-2.5">
            <Users size={20} aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto px-4 pb-2 md:px-0" data-etichette>
          <Chip attiva={etichette.length > 0} onClick={() => setPannello('tutti')} data-apri-filtri>
            <SlidersHorizontal size={14} aria-hidden="true" />Filtri{etichette.length ? ` · ${etichette.length}` : ''}
          </Chip>
          {etichette.map(x => (
            <Chip key={x.id ?? x.k[0]} attiva onClick={() => (x.via ? x.via() : togli(...x.k))} aria-label={`Togli il filtro ${x.e}`} data-togli={x.k[0]}>
              {x.e}<X size={14} aria-hidden="true" />
            </Chip>
          ))}
          {!etichette.length && (
            <>
              <Chip onClick={() => imposta({ ...filtri, ...periodo('mese') })} data-rapido="mese">Questo mese</Chip>
              <Chip onClick={() => imposta({ ...filtri, tipo: 'Uscita' })} data-rapido="uscite">Uscite</Chip>
              <Chip onClick={() => imposta({ ...filtri, tipo: 'Entrata' })} data-rapido="entrate">Entrate</Chip>
            </>
          )}
        </div>
      </div>

      {tot && (
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-y border-bordo bg-superficie px-4 py-2 text-[15px] lg:mt-3 lg:justify-end lg:gap-6 lg:border-0 lg:bg-transparent lg:px-0 lg:text-base"
          data-totali={tot.numero_movimenti}>
          <span className="basis-full text-tenue lg:mr-auto lg:basis-auto">{tot.numero_movimenti} moviment{tot.numero_movimenti === '1' ? 'o' : 'i'}{etichette.length || filtri.q ? ' con questi filtri' : ''}</span>
          <span className="importo text-entrata">entrate {formatta(centesimiDa(tot.totale_entrate) ?? 0)}</span>
          <span className="importo text-uscita">uscite {formatta(centesimiDa(tot.totale_uscite) ?? 0)}</span>
        </div>
      )}

      <ListaInfinita altre={!!lista.hasNextPage} caricando={lista.isFetchingNextPage} onAltre={() => lista.fetchNextPage()}
        vuota={lista.isSuccess && righe.length === 0 && (
          <p className="px-4 py-10 text-center text-tenue" data-vuota>Nessun movimento{etichette.length || filtri.q ? ' con questi filtri' : ''}.</p>
        )}>
        {lista.isError && <p role="alert" className="px-4 text-uscita">{lista.error.message}</p>}
        {largo ? righe.length > 0 && (
          <div className="mt-1">
            <TabellaRegistro gruppi={gruppi} onApri={apri} conConto={ids.length !== 1 && conti.length > 1} />
          </div>
        ) : (
        <div>
          {gruppi.map(g => (
            <section key={g.giorno} data-giorno={g.giorno}>
              <h3 className="flex justify-between gap-3 border-b border-bordo bg-principale/[0.06] px-4 py-2 text-[15px] font-bold text-secondario md:px-3">
                <span>{giornoLungo(g.giorno)}</span>
                {g.saldoFine != null && <span className="importo whitespace-nowrap" data-saldo-giorno={g.giorno}>saldo {formatta(g.saldoFine)}</span>}
              </h3>
              <ul className="divide-y divide-bordo border-b border-bordo">
                {g.righe.map(r => (
                  <RigaMovimento key={r.id} r={r} onApri={apri}
                    onStudio={id => setAperto({ id, modo: 'studio' })} onElimina={el.elimina} />
                ))}
              </ul>
            </section>
          ))}
        </div>
        )}
      </ListaInfinita>

      {(el.nascosto || el.errore) && (
        <div role="status" data-avviso-elimina className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl bg-secondario px-4 py-3 text-sm text-fondo shadow-lg md:bottom-6">
          {el.errore
            ? <><span>Non eliminato: {el.errore}</span><button type="button" onClick={el.chiudiErrore} className="font-bold">OK</button></>
            : <><span>Movimento eliminato</span><button type="button" data-annulla onClick={el.annulla} className="font-bold text-accento">Annulla</button></>}
        </div>
      )}

      {pannello && <PannelloFiltri key={pannello} soloAltri={pannello === 'altri'} filtri={filtri} conti={conti} onChiudi={() => setPannello(false)}
        onApplica={f => { imposta({ ...f, q: filtri.q }); setPannello(false); }} />}
      {aperto && <DettaglioMovimento key={`${aperto.id}-${aperto.modo}`} id={aperto.id} modo={aperto.modo} onChiudi={() => setAperto(null)} />}
    </div>
  );
}

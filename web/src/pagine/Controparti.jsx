import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { Download, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { registroApi } from '../api/registro';
import { salvaFile } from '../api/client';
import ListaInfinita from '../componenti/ListaInfinita';
import Iniziale from '../componenti/Iniziale';
import BottomSheet from '../componenti/BottomSheet';
import PannelloControparte from '../componenti/PannelloControparte';
import { Bottone } from '../componenti/Bottoni';
import { alternaConto, contiScelti } from '../componenti/conti';
import { centesimiDa, conSegno, formatta } from '../util/importi';

const ORDINI = [['uso', 'Più movimenti'], ['recente', 'Recenti'], ['nome', 'A–Z']];
const STATI = [['', 'Tutte'], ['true', 'Attive'], ['false', 'Disattivate']];
const SENZA = '-'; // «senza tipologia» / «senza categoria» nell'indirizzo

// Filtri nell'indirizzo (U8b): tip=2,7[,-] cat=Utenze&cat=- st=true|false ord=...
function leggi(p) {
  const tip = (p.get('tip') || '').split(',');
  const cat = [...new Set(p.getAll('cat').map(x => x.trim()).filter(x => x && x.length <= 100))].slice(0, 50);
  return {
    tipologie: contiScelti(tip.filter(x => x !== SENZA).join(',')),
    senzaTipologia: tip.includes(SENZA),
    categorie: cat.filter(x => x !== SENZA),
    senzaCategoria: cat.includes(SENZA),
    stato: ['true', 'false'].includes(p.get('st')) ? p.get('st') : '',
    ordina: ORDINI.some(([k]) => k === p.get('ord')) ? p.get('ord') : 'uso'
  };
}
function scrivi(f, q) {
  const p = new URLSearchParams();
  const tip = [...f.tipologie, ...(f.senzaTipologia ? [SENZA] : [])];
  if (tip.length) p.set('tip', tip.join(','));
  for (const c of [...f.categorie, ...(f.senzaCategoria ? [SENZA] : [])]) p.append('cat', c);
  if (f.stato) p.set('st', f.stato);
  if (f.ordina !== 'uso') p.set('ord', f.ordina);
  if (q) p.set('q', q);
  return p;
}
// Per l'API (stessi nomi di /elenco e /export).
export function perApiControparti(f, q) {
  return {
    q: q || undefined,
    tipologie: f.tipologie.length ? f.tipologie.join(',') : undefined,
    senza_tipologia: f.senzaTipologia ? 'true' : undefined,
    categorie: f.categorie.length ? f.categorie : undefined,
    senza_categoria: f.senzaCategoria ? 'true' : undefined,
    attivo: f.stato || undefined
  };
}
const quanti = f => f.tipologie.length + f.categorie.length + (f.senzaTipologia ? 1 : 0) + (f.senzaCategoria ? 1 : 0) + (f.stato ? 1 : 0);
const alterna = (l, x) => (l.includes(x) ? l.filter(y => y !== x) : [...l, x]);

// Pannello dei filtri (U8b, come «Altri filtri» del Registro): bozza, «Mostra» applica.
function PannelloFiltri({ filtri, r, onApplica, onChiudi }) {
  const [b, setB] = useState(filtri);
  const m = (k, v) => setB(x => ({ ...x, [k]: v }));
  return (
    <BottomSheet aperto lato onChiudi={onChiudi} titolo="Filtri delle controparti"
      piede={<button type="button" data-applica-controparti onClick={() => onApplica(b)} className="h-12 w-full rounded-xl bg-principale font-bold text-su-principale">Mostra le controparti</button>}>
      <div className="space-y-5" data-pannello-controparti>
        <section>
          <h3 className="mb-2 text-sm font-bold text-tenue">Tipologia</h3>
          <div className="flex flex-wrap gap-2">
            {(r?.tipologie ?? []).map(t => (
              <Bottone key={t.id} colore={t.colore} attivo={b.tipologie.includes(String(t.id))} data-filtro-tipologia={t.id}
                onClick={() => m('tipologie', contiScelti(alternaConto(b.tipologie, t.id)))}>{t.nome} · {t.n}</Bottone>
            ))}
            <Bottone attivo={b.senzaTipologia} data-filtro-tipologia="senza" onClick={() => m('senzaTipologia', !b.senzaTipologia)}>
              Senza tipologia · {r?.senza_tipologia ?? 0}
            </Bottone>
          </div>
        </section>
        <section>
          <h3 className="mb-2 text-sm font-bold text-tenue">Categoria</h3>
          <div className="flex flex-wrap gap-2">
            {(r?.categorie ?? []).map(c => (
              <Bottone key={c.nome} attivo={b.categorie.includes(c.nome)} data-filtro-categoria={c.nome}
                onClick={() => m('categorie', alterna(b.categorie, c.nome))}>{c.nome} · {c.n}</Bottone>
            ))}
            <Bottone attivo={b.senzaCategoria} data-filtro-categoria="senza" onClick={() => m('senzaCategoria', !b.senzaCategoria)}>
              Senza categoria · {r?.senza_categoria ?? 0}
            </Bottone>
          </div>
        </section>
        <section>
          <h3 className="mb-2 text-sm font-bold text-tenue">Stato</h3>
          <div className="flex rounded-xl bg-fondo p-1" role="radiogroup" aria-label="Stato">
            {STATI.map(([k, e]) => (
              <button key={k || 'tutte'} type="button" role="radio" aria-checked={b.stato === k} data-filtro-stato={k || 'tutte'}
                onClick={() => m('stato', k)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold ${b.stato === k ? 'bg-superficie shadow' : 'text-tenue'}`}>
                {e}{k === 'true' && r ? ` · ${r.attive}` : k === 'false' && r ? ` · ${r.disattivate}` : ''}
              </button>
            ))}
          </div>
        </section>
      </div>
    </BottomSheet>
  );
}

// Esporta le controparti in vista (stessi filtri e ricerca), CSV o Excel.
function Esporta({ filtri, q, onChiudi }) {
  const es = useMutation({
    mutationFn: formato => registroApi.esportaControparti({ ...perApiControparti(filtri, q), formato }),
    onSuccess: f => { salvaFile(f); onChiudi(); }
  });
  return (
    <BottomSheet aperto onChiudi={onChiudi} titolo="Esporta le controparti">
      <p className="mb-3 text-sm text-tenue">
        {quanti(filtri) || q ? 'Solo quelle in vista, con i filtri e la ricerca di adesso.' : 'Tutte le controparti.'} Con contatti, movimenti, entrate e uscite.
      </p>
      <div className="flex gap-2">
        {[['xlsx', 'Excel'], ['csv', 'CSV']].map(([k, e]) => (
          <button key={k} type="button" disabled={es.isPending} data-esporta-controparti={k} onClick={() => es.mutate(k)}
            className="h-12 flex-1 rounded-xl border border-bordo font-bold disabled:opacity-40">{e}</button>
        ))}
      </div>
      {es.isError && <p role="alert" className="mt-2 text-sm text-uscita">{es.error.message}</p>}
    </BottomSheet>
  );
}

const MQ = '(min-width: 1024px)';
function useLargo() {
  const [v, setV] = useState(() => window.matchMedia(MQ).matches);
  useEffect(() => {
    const mq = window.matchMedia(MQ);
    const f = () => setV(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return v;
}

const nettoDi = a => (centesimiDa(a.totale_entrate) ?? 0) - (centesimiDa(a.totale_uscite) ?? 0);
const tonoDi = a => (a.tipo_movimento_preferito === 'Entrata' ? 'entrata' : a.tipo_movimento_preferito === 'Uscita' ? 'uscita' : 'info');
const Pallino = ({ colore }) => <span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: colore || 'var(--pn-neutro)' }} />;

// Da computer (U8b): tabella come il vecchio elenco delle anagrafiche.
function Tabella({ voci }) {
  const vai = useNavigate();
  return (
    <table className="w-full border-collapse text-[1.0625rem]" data-tabella-controparti>
      <thead className="sticky top-0 z-[5] bg-fondo">
        <tr className="border-b-2 border-bordo text-left text-[0.9375rem] text-tenue">
          <th scope="col" className="py-2.5 pl-3 font-semibold">Nome</th>
          <th scope="col" className="w-[13%] py-2.5 pr-3 font-semibold">Tipologia</th>
          <th scope="col" className="w-[13%] py-2.5 pr-3 font-semibold">Categoria</th>
          <th scope="col" className="w-[18%] py-2.5 pr-3 font-semibold">Contatti</th>
          <th scope="col" className="w-20 py-2.5 pr-3 text-right font-semibold">Mov.</th>
          <th scope="col" className="w-32 py-2.5 pr-3 text-right font-semibold">Entrate</th>
          <th scope="col" className="w-32 py-2.5 pr-3 text-right font-semibold">Uscite</th>
        </tr>
      </thead>
      <tbody>
        {voci.map(a => (
          <tr key={a.id} data-controparte={a.id} onClick={() => vai(`/controparti/${a.id}`)}
            className={`cursor-pointer border-b border-bordo bg-superficie align-top hover:bg-principale/[0.04] ${a.attivo ? '' : 'opacity-60'}`}>
            <td className="py-3 pl-3 pr-3">
              <Link to={`/controparti/${a.id}`} onClick={e => e.stopPropagation()} className="font-bold hover:underline">{a.nome}</Link>
              {!a.attivo && <span className="ml-2 text-sm text-tenue">disattivata</span>}
              {a.piva && <p className="text-[0.9375rem] text-tenue">P.IVA {a.piva}</p>}
            </td>
            <td className="py-3 pr-3">{a.tipologia_nome ? <><Pallino colore={a.tipologia_colore} />{a.tipologia_nome}</> : <span className="text-tenue">—</span>}</td>
            <td className="py-3 pr-3">{a.categoria?.trim() || <span className="text-tenue">—</span>}</td>
            <td className="py-3 pr-3 text-[0.9375rem]">
              {a.email && <p className="truncate">{a.email}</p>}
              {a.telefono && <p>{a.telefono}</p>}
              {!a.email && !a.telefono && <span className="text-tenue">—</span>}
            </td>
            <td className="importo py-3 pr-3 text-right">{a.numero_movimenti}</td>
            <td className="importo py-3 pr-3 text-right text-entrata">{centesimiDa(a.totale_entrate) ? formatta(centesimiDa(a.totale_entrate)) : ''}</td>
            <td className="importo py-3 pr-3 text-right text-uscita">{centesimiDa(a.totale_uscite) ? formatta(centesimiDa(a.totale_uscite)) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Controparti (U5 variante B; U8b: filtri per tipologia, categoria e stato,
// conteggi, export, «Nuova controparte», tabella da computer).
export default function Controparti() {
  const [params, setParams] = useSearchParams();
  const filtri = useMemo(() => leggi(params), [params]);
  const [testo, setTesto] = useState(params.get('q') ?? '');
  const [q, setQ] = useState(testo.trim());
  const [pannello, setPannello] = useState(null); // 'filtri' | 'esporta' | 'nuova'
  const largo = useLargo();
  useEffect(() => { const t = setTimeout(() => setQ(testo.trim()), 250); return () => clearTimeout(t); }, [testo]);
  const imposta = (f, qq = q) => setParams(scrivi(f, qq), { replace: true });
  useEffect(() => { if ((params.get('q') ?? '') !== q) imposta(filtri, q); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const r = useQuery({ queryKey: ['controparti', 'riepilogo'], queryFn: registroApi.riepilogoControparti }).data;
  const lista = useInfiniteQuery({
    queryKey: ['controparti', q, filtri],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => registroApi.elenco({ q, ordina: filtri.ordina, offset: pageParam, ...perApiControparti(filtri) }),
    getNextPageParam: p => (p.altri ? p.offset + p.limit : undefined)
  });
  const voci = useMemo(() => (lista.data?.pages ?? []).flatMap(p => p.anagrafiche), [lista.data]);
  const totale = lista.data?.pages?.[0]?.totale;
  const n = quanti(filtri);

  // Etichette dei filtri attivi, togliibili una per una.
  const tip = id => r?.tipologie.find(t => String(t.id) === id);
  const etichette = [
    ...filtri.tipologie.map(id => ({ id: `t${id}`, e: tip(id)?.nome ?? 'Tipologia', via: () => imposta({ ...filtri, tipologie: filtri.tipologie.filter(x => x !== id) }) })),
    ...(filtri.senzaTipologia ? [{ id: 'ts', e: 'Senza tipologia', via: () => imposta({ ...filtri, senzaTipologia: false }) }] : []),
    ...filtri.categorie.map(c => ({ id: `c${c}`, e: c, via: () => imposta({ ...filtri, categorie: filtri.categorie.filter(x => x !== c) }) })),
    ...(filtri.senzaCategoria ? [{ id: 'cs', e: 'Senza categoria', via: () => imposta({ ...filtri, senzaCategoria: false }) }] : []),
    ...(filtri.stato ? [{ id: 'st', e: filtri.stato === 'true' ? 'Attive' : 'Disattivate', via: () => imposta({ ...filtri, stato: '' }) }] : [])
  ];
  const pulisci = () => imposta({ ...filtri, tipologie: [], senzaTipologia: false, categorie: [], senzaCategoria: false, stato: '' });
  const bottone = 'inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-[0.9375rem]';

  return (
    <div className="space-y-3" data-pagina="controparti">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-importi text-2xl text-secondario">Controparti</h1>
        <div className="flex gap-2">
          <button type="button" onClick={() => setPannello('esporta')} data-apri-esporta-controparti aria-label="Esporta le controparti"
            className={`${bottone} border-bordo bg-superficie`}><Download size={18} aria-hidden="true" /><span className="hidden sm:inline">Esporta</span></button>
          <button type="button" onClick={() => setPannello('nuova')} data-nuova-controparte
            className={`${bottone} border-accento bg-accento font-bold text-su-accento`}><Plus size={18} aria-hidden="true" />Nuova</button>
        </div>
      </div>

      {/* Conteggi per tipologia: un tocco filtra (U8b). */}
      {r && r.tipologie.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0" data-conteggi-tipologie>
          {r.tipologie.filter(t => t.n > 0 || filtri.tipologie.includes(String(t.id))).map(t => (
            <Bottone key={t.id} colore={t.colore} attivo={filtri.tipologie.includes(String(t.id))} data-conteggio-tipologia={t.id}
              onClick={() => imposta({ ...filtri, tipologie: contiScelti(alternaConto(filtri.tipologie, t.id)) })}>
              {t.nome} <span className="importo">{t.n}</span>
            </Bottone>
          ))}
          {r.senza_tipologia > 0 && (
            <Bottone attivo={filtri.senzaTipologia} data-conteggio-tipologia="senza"
              onClick={() => imposta({ ...filtri, senzaTipologia: !filtri.senzaTipologia })}>Senza tipologia <span className="importo">{r.senza_tipologia}</span></Bottone>
          )}
          {r.disattivate > 0 && (
            <Bottone attivo={filtri.stato === 'false'} data-conteggio-disattivate
              onClick={() => imposta({ ...filtri, stato: filtri.stato === 'false' ? '' : 'false' })}>Disattivate <span className="importo">{r.disattivate}</span></Bottone>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 basis-60 items-center gap-2 rounded-xl border border-bordo bg-superficie px-3 py-2">
          <Search size={18} aria-hidden="true" className="text-tenue" />
          <input name="cerca" value={testo} onChange={e => setTesto(e.target.value)} maxLength={100} autoComplete="off"
            placeholder={r && !q ? `Cerca fra ${r.totale} controparti` : 'Cerca controparte o P.IVA'} aria-label="Cerca controparte"
            className="min-w-0 flex-1 bg-transparent outline-none" />
          {testo && <button type="button" aria-label="Svuota la ricerca" onClick={() => setTesto('')}><X size={16} aria-hidden="true" /></button>}
        </label>
        <button type="button" onClick={() => setPannello('filtri')} data-apri-filtri-controparti
          className={`${bottone} ${n ? 'border-principale font-semibold text-principale' : 'border-bordo bg-superficie'}`}>
          <SlidersHorizontal size={18} aria-hidden="true" />Filtri{n ? ` · ${n}` : ''}
        </button>
      </div>

      {etichette.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" data-etichette-controparti>
          {etichette.map(x => (
            <button key={x.id} type="button" onClick={x.via} aria-label={`Togli il filtro ${x.e}`} data-togli-controparti={x.id}
              className="inline-flex items-center gap-1 rounded-full border border-principale bg-principale px-3 py-1.5 text-sm font-bold text-su-principale">
              {x.e}<X size={14} aria-hidden="true" />
            </button>
          ))}
          <button type="button" onClick={pulisci} data-togli-tutti-controparti className="px-2 text-sm text-principale">Togli tutti</button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2" role="radiogroup" aria-label="Ordine">
          {ORDINI.map(([k, e]) => (
            <button key={k} type="button" role="radio" aria-checked={filtri.ordina === k} data-ordina={k} onClick={() => imposta({ ...filtri, ordina: k })}
              className={`rounded-full border px-3 py-1.5 text-sm ${filtri.ordina === k ? 'border-principale bg-principale font-bold text-su-principale' : 'border-bordo bg-superficie'}`}>{e}</button>
          ))}
        </div>
        {totale != null && <span className="shrink-0 text-sm text-tenue" data-totale-controparti={totale}>{totale} {totale === 1 ? 'controparte' : 'controparti'}</span>}
      </div>

      <ListaInfinita altre={!!lista.hasNextPage} caricando={lista.isFetchingNextPage} onAltre={() => lista.fetchNextPage()}
        vuota={lista.isSuccess && voci.length === 0 && <p className="py-10 text-center text-tenue" data-controparti-vuote>Nessuna controparte{q || n ? ' con questi filtri' : ''}.</p>}>
        {lista.isError && <p role="alert" className="text-uscita">{lista.error.message}</p>}
        {largo ? voci.length > 0 && <Tabella voci={voci} /> : (
          <ul className="space-y-2">
            {voci.map(a => {
              const netto = nettoDi(a);
              return (
                <li key={a.id}>
                  <Link to={`/controparti/${a.id}`} data-controparte={a.id}
                    className={`flex items-center gap-3 rounded-2xl border border-bordo bg-superficie p-3 ${a.attivo ? '' : 'opacity-60'}`}>
                    <Iniziale nome={a.nome} tono={tonoDi(a)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{a.nome}</span>
                      <span className="block truncate text-xs text-tenue">
                        {a.tipologia_nome && <><Pallino colore={a.tipologia_colore} />{a.tipologia_nome} · </>}
                        {a.categoria?.trim() ? `${a.categoria.trim()} · ` : ''}
                        {a.numero_movimenti ? `${a.numero_movimenti} moviment${a.numero_movimenti === 1 ? 'o' : 'i'}` : 'Nessun movimento'}
                        {a.attivo ? '' : ' · disattivata'}
                      </span>
                    </span>
                    {a.numero_movimenti > 0 && (
                      <span className="shrink-0 text-right">
                        <span className={`importo block font-semibold ${netto < 0 ? 'text-uscita' : 'text-entrata'}`} data-netto={netto}>{conSegno(netto)} €</span>
                        <span className="block text-[11px] text-tenue">in totale</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </ListaInfinita>

      {pannello === 'filtri' && <PannelloFiltri filtri={filtri} r={r} onChiudi={() => setPannello(null)}
        onApplica={f => { imposta(f); setPannello(null); }} />}
      {pannello === 'esporta' && <Esporta filtri={filtri} q={q} onChiudi={() => setPannello(null)} />}
      {pannello === 'nuova' && <PannelloControparte c={{ attivo: true }} aperto onChiudi={() => setPannello(null)} />}
    </div>
  );
}

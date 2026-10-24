import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, Paperclip, Send } from 'lucide-react';
import { portaleApi } from '../api/portale';
import { salvaFile } from '../api/client';
import Iniziale from '../componenti/Iniziale';
import BottomSheet from '../componenti/BottomSheet';
import ListaInfinita from '../componenti/ListaInfinita';
import { ACCETTA, Bolla, peso } from './Studio';
import { centesimiDa, conSegno, formatta } from '../util/importi';
import { breve, estremiMese, etichettaMese, meseDi, mesePrima, oggi, periodo } from '../util/date';

// Portale dello studio (U6c, tavole 5 C e 6 C): home «Da fare» di tutti i
// clienti, elenco dei clienti, scheda del cliente come riepilogo da cui si entra
// in movimenti, report ed export, chat, accessi. Lo studio non modifica i dati.

const ora = t => new Date(t).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const segnato = mv => {
  const c = centesimiDa(mv.importo) ?? 0;
  return mv.tipo === 'Uscita' ? -c : c;
};
const valido = id => { const n = Number(id); return Number.isInteger(n) && n > 0 && n <= 2147483647 ? n : null; };
const Indietro = ({ a, testo }) => (
  <Link to={a} className="inline-flex items-center gap-1 text-sm text-principale"><ChevronLeft size={16} aria-hidden="true" />{testo}</Link>
);
const Errore = ({ e }) => e ? <p role="alert" className="text-sm text-uscita">{e.message}</p> : null;
const Carica = () => <p className="text-tenue" role="status">Caricamento…</p>;

function useCliente(id) {
  const n = valido(id);
  const q = useQuery({ queryKey: ['portale', 'clienti'], queryFn: portaleApi.clienti });
  const c = (q.data?.clienti ?? []).find(x => x.user_id === n) || null;
  return { n, q, c, nome: c?.username ?? '' };
}

// ------------------------------------------------------------------ Da fare
const GRUPPI = [['tutto', 'Tutto'], ['rivedere', 'Da rivedere'], ['attesa', 'In attesa'], ['messaggi', 'Messaggi']];

export function DaFare() {
  const [filtro, setFiltro] = useState('tutto');
  const q = useQuery({ queryKey: ['portale', 'da-fare'], queryFn: portaleApi.daFare, refetchInterval: 30000 });
  const d = q.data ?? { rivedere: [], attesa: [], messaggi: [] };
  const voci = [
    ...d.rivedere.map(x => ({ ...x, gruppo: 'rivedere', chiave: `c${x.id}` })),
    ...d.attesa.map(x => ({ ...x, gruppo: 'attesa', chiave: `c${x.id}` })),
    ...d.messaggi.map(x => ({ ...x, gruppo: 'messaggi', chiave: `m${x.collegamento_id}` }))
  ].filter(x => filtro === 'tutto' || x.gruppo === filtro)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const quanti = { tutto: d.rivedere.length + d.attesa.length + d.messaggi.length, rivedere: d.rivedere.length, attesa: d.attesa.length, messaggi: d.messaggi.length };

  return (
    <div className="space-y-3" data-da-fare={q.data ? quanti.tutto : ''}>
      <h1 className="font-importi text-2xl text-secondario">Da fare</h1>
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
        {GRUPPI.map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={filtro === k} data-filtro={k} onClick={() => setFiltro(k)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${filtro === k ? 'border-principale bg-principale font-bold text-su-principale' : 'border-bordo bg-superficie'}`}>
            {t} <span className="importo">{quanti[k]}</span>
          </button>
        ))}
      </div>
      {q.isLoading && <Carica />}
      <Errore e={q.error} />
      {q.data && voci.length === 0 && <p className="py-8 text-center text-tenue" data-niente>Niente da fare. I chiarimenti e i messaggi dei clienti arrivano qui.</p>}
      <ul className="divide-y divide-bordo rounded-2xl border border-bordo bg-superficie">
        {voci.map(x => (
          <li key={x.chiave} data-voce={x.gruppo} data-cliente={x.user_id}>
            <Link to={`/studio/clienti/${x.user_id}/chat`} className="flex items-start gap-3 px-4 py-3">
              <Iniziale nome={x.cliente} tono={x.gruppo === 'messaggi' ? 'info' : x.gruppo === 'rivedere' ? 'entrata' : 'uscita'} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <b className="truncate">{x.cliente}</b>
                  <span className="shrink-0 text-xs text-tenue">{ora(x.created_at)}</span>
                </span>
                <span className="block text-xs font-bold uppercase tracking-wide text-tenue">
                  {x.gruppo === 'messaggi' ? `${x.non_letti} ${x.non_letti === 1 ? 'messaggio nuovo' : 'messaggi nuovi'}`
                    : x.gruppo === 'rivedere' ? (x.mittente_tipo === 'user' ? 'chiede lo studio' : 'ha risposto') : 'in attesa del cliente'}
                </span>
                <span className="line-clamp-2 block text-sm">{x.gruppo === 'messaggi' ? x.ultimo : x.messaggio}</span>
                {x.movimento && (
                  <span className="mt-1 flex justify-between gap-2 border-l-[3px] border-chiarire pl-2 text-xs" data-movimento-citato={x.movimento.id}>
                    <span className="truncate">{x.movimento.descrizione} · {breve(x.movimento.giorno)}</span>
                    <span className={`importo shrink-0 ${x.movimento.tipo === 'Uscita' ? 'text-uscita' : 'text-entrata'}`}>{conSegno(segnato(x.movimento))} €</span>
                  </span>
                )}
                {x.movimento_nascosto && <span className="mt-1 block text-xs italic text-tenue">movimento fuori da ciò che vedi</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ Clienti
export function Clienti() {
  const qc = useQueryClient();
  const [cerca, setCerca] = useState('');
  const [nuovo, setNuovo] = useState('');
  const q = useQuery({ queryKey: ['portale', 'clienti'], queryFn: portaleApi.clienti });
  const r = useQuery({ queryKey: ['portale', 'richieste'], queryFn: portaleApi.richieste });
  const chiedi = useMutation({
    mutationFn: () => portaleApi.chiedi(nuovo.trim()),
    onSuccess: () => { setNuovo(''); qc.invalidateQueries({ queryKey: ['portale', 'richieste'] }); }
  });
  const [codice, setCodice] = useState('');
  const conCodice = useMutation({
    mutationFn: () => portaleApi.conCodice(codice.trim()),
    onSuccess: () => { setCodice(''); qc.invalidateQueries({ queryKey: ['portale'] }); }
  });
  const codiceValido = /^[0-9a-f]{64}$/i.test(codice.trim());
  const t = cerca.trim().toLowerCase();
  const filtra = x => !t || x.username.toLowerCase().includes(t) || (x.email || '').toLowerCase().includes(t);
  const clienti = (q.data?.clienti ?? []).filter(filtra);
  const attesa = (r.data?.richieste ?? []).filter(filtra);

  return (
    <div className="space-y-3">
      <h1 className="font-importi text-2xl text-secondario">Clienti</h1>
      <input type="search" name="cerca" value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca un cliente" aria-label="Cerca un cliente"
        className="w-full rounded-xl border border-bordo bg-superficie px-3 py-2" />
      {q.isLoading && <Carica />}
      <Errore e={q.error || r.error} />
      <ul className="divide-y divide-bordo rounded-2xl border border-bordo bg-superficie" data-clienti={q.data ? clienti.length : ''}>
        {clienti.map(c => (
          <li key={c.collegamento_id} data-cliente={c.user_id} data-stato={c.stato}>
            <Link to={`/studio/clienti/${c.user_id}`} className="flex items-center gap-3 px-4 py-3">
              <Iniziale nome={c.username} />
              <span className="min-w-0 flex-1">
                <b className="block truncate">{c.username}</b>
                <span className="block truncate text-xs text-tenue">
                  {c.stato === 'sospesa' ? 'sospeso dal cliente' : `${c.numero_movimenti} movimenti · ${c.numero_conti} ${c.numero_conti === 1 ? 'conto' : 'conti'}`}
                </span>
              </span>
              {c.unread_messages > 0 && <span className="importo shrink-0 rounded-full bg-info px-2 py-0.5 text-xs font-bold text-fondo" data-non-letti={c.unread_messages}>{c.unread_messages}</span>}
              <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-tenue" />
            </Link>
          </li>
        ))}
        {attesa.map(c => (
          <li key={`r${c.id}`} className="flex items-center gap-3 px-4 py-3 opacity-60" data-richiesta={c.user_id}>
            <Iniziale nome={c.username} />
            <span className="min-w-0 flex-1"><b className="block truncate">{c.username}</b><span className="text-xs text-tenue">richiesta in attesa del cliente</span></span>
          </li>
        ))}
        {q.data && r.data && clienti.length + attesa.length === 0 && <li className="px-4 py-6 text-center text-tenue">{t ? 'Nessun cliente trovato.' : 'Nessun cliente ancora.'}</li>}
      </ul>
      <form className="space-y-2 rounded-2xl border border-bordo bg-superficie p-4" data-nuova-richiesta
        onSubmit={e => { e.preventDefault(); if (nuovo.trim() && !chiedi.isPending) chiedi.mutate(); }}>
        <label className="block text-sm"><span className="text-tenue">Nuovo cliente: nome utente o email</span>
          <input name="identificativo" value={nuovo} onChange={e => setNuovo(e.target.value)} autoComplete="off" maxLength={255}
            className="mt-1 w-full rounded-xl border border-bordo bg-fondo px-3 py-2" />
        </label>
        <button type="submit" disabled={!nuovo.trim() || chiedi.isPending} className="h-11 w-full rounded-xl bg-principale font-bold text-su-principale disabled:opacity-40">Chiedi il collegamento</button>
        <p className="text-xs text-tenue">Il cliente riceve la richiesta e sceglie lui cosa puoi vedere.</p>
        {chiedi.isSuccess && <p role="status" className="text-sm text-entrata">Richiesta mandata.</p>}
        <Errore e={chiedi.error} />
      </form>
      <form className="space-y-2 rounded-2xl border border-bordo bg-superficie p-4" data-codice-invito
        onSubmit={e => { e.preventDefault(); if (codiceValido && !conCodice.isPending) conCodice.mutate(); }}>
        <label className="block text-sm"><span className="text-tenue">Hai un codice d'invito del cliente?</span>
          <input name="codice" value={codice} onChange={e => setCodice(e.target.value)} autoComplete="off" spellCheck={false} maxLength={80}
            className="mt-1 w-full rounded-xl border border-bordo bg-fondo px-3 py-2 font-mono text-sm" />
        </label>
        <button type="submit" disabled={!codiceValido || conCodice.isPending} className="h-11 w-full rounded-xl border border-bordo font-bold text-principale disabled:opacity-40">Usa il codice</button>
        {codice.trim() && !codiceValido && <p className="text-xs text-tenue">Il codice ha 64 caratteri, cifre e lettere da a a f.</p>}
        {conCodice.isSuccess && <p role="status" className="text-sm text-entrata" data-codice-esito>{conCodice.data.message}</p>}
        <Errore e={conCodice.error} />
      </form>
    </div>
  );
}

// ------------------------------------------------------------------ Scheda del cliente
export function Cliente() {
  const { id } = useParams();
  const { n, nome } = useCliente(id);
  const [mese, setMese] = useState(() => meseDi(oggi()));
  const q = useQuery({ queryKey: ['portale', 'riepilogo', n, mese], queryFn: () => portaleApi.riepilogo(n, mese), enabled: !!n, placeholderData: keepPreviousData });
  if (!n) return <NonTrovato />;
  if (q.isError) return <div className="space-y-3"><Indietro a="/studio/clienti" testo="Clienti" /><Errore e={q.error} /></div>;
  const r = q.data?.riepilogo;
  const e = centesimiDa(r?.entrate) ?? 0, u = centesimiDa(r?.uscite) ?? 0;
  const ambito = r && [r.ambito_dal && `dal ${breve(r.ambito_dal)}`, r.ambito_al && `al ${breve(r.ambito_al)}`, r.conti_ammessi?.length ? `${r.conti_ammessi.length} ${r.conti_ammessi.length === 1 ? 'conto' : 'conti'}` : 'tutti i conti'].filter(Boolean).join(' · ');
  const base = `/studio/clienti/${n}`;

  return (
    <div className="space-y-3" data-scheda-cliente={n}>
      <Indietro a="/studio/clienti" testo="Clienti" />
      <div className="flex items-center gap-3">
        <Iniziale nome={r?.username || nome} grande />
        <div className="min-w-0">
          <h1 className="truncate font-importi text-2xl text-secondario">{r?.username || nome}</h1>
          {ambito && <p className="text-xs text-tenue" data-ambito>vedi: {ambito}</p>}
        </div>
      </div>
      {!r && <Carica />}
      {r && <>
        <div className="grid grid-cols-2 gap-2">
          <Link to={`${base}/chat`} className="rounded-xl bg-chiarire/10 p-3" data-tessera="chiarire">
            <p className="importo text-2xl font-semibold text-chiarire">{r.chiarimenti_aperti}</p><p className="text-xs">da chiarire</p>
          </Link>
          <Link to={`${base}/chat`} className="rounded-xl bg-info/10 p-3" data-tessera="non-letti">
            <p className="importo text-2xl font-semibold text-info">{r.non_letti}</p><p className="text-xs">messaggi nuovi</p>
          </Link>
        </div>
        <section className="rounded-2xl border border-bordo bg-superficie p-4" data-mese={r.mese}>
          <div className="flex items-center justify-between">
            <button type="button" aria-label="Mese prima" data-mese-prima onClick={() => setMese(m => mesePrima(m))} className="p-1 text-principale"><ChevronLeft size={20} aria-hidden="true" /></button>
            <h2 className="font-semibold">{etichettaMese(r.mese)}</h2>
            <button type="button" aria-label="Mese dopo" data-mese-dopo disabled={mese >= meseDi(oggi())} onClick={() => setMese(m => mesePrima(m, -1))} className="p-1 text-principale disabled:opacity-30"><ChevronRight size={20} aria-hidden="true" /></button>
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div><dt className="text-xs text-tenue">Entrate</dt><dd className="importo font-semibold text-entrata" data-entrate={r.entrate}>{formatta(e)}</dd></div>
            <div><dt className="text-xs text-tenue">Uscite</dt><dd className="importo font-semibold text-uscita" data-uscite={r.uscite}>{formatta(u)}</dd></div>
            <div><dt className="text-xs text-tenue">Saldo</dt><dd className="importo font-semibold">{conSegno(e - u)}</dd></div>
          </dl>
          <p className="mt-1 text-center text-xs text-tenue">{r.movimenti} {r.movimenti === 1 ? 'movimento' : 'movimenti'} che vedi</p>
        </section>
      </>}
      <nav aria-label="Cliente" className="divide-y divide-bordo rounded-2xl border border-bordo bg-superficie">
        {[['movimenti', 'Movimenti', 'sola lettura · chiedi un chiarimento'], ['report', 'Report ed export', 'PDF, Excel, CSV'], ['chat', 'Chat', 'messaggi e documenti'], ['accessi', 'Accessi', 'cosa hai guardato, come lo vede il cliente']].map(([k, t, s]) => (
          <Link key={k} to={`${base}/${k}`} data-voce-cliente={k} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1"><b className="block">{t}</b><span className="block text-xs text-tenue">{s}</span></span>
            <ChevronRight size={18} aria-hidden="true" className="text-tenue" />
          </Link>
        ))}
      </nav>
      <ChiudiCollegamento n={n} nome={r?.username || nome} />
    </div>
  );
}

// Fine del collegamento dallo studio (U6d): il cliente lo vede nei suoi accessi e
// lo stato passa a chiuso; per riaprire serve una nuova richiesta accettata.
function ChiudiCollegamento({ n, nome }) {
  const qc = useQueryClient();
  const vai = useNavigate();
  const [aperto, setAperto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const chiudi = useMutation({
    mutationFn: () => portaleApi.chiudi(n, motivo.trim()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['portale'] }); vai('/studio/clienti', { replace: true }); }
  });
  if (!aperto) return <button type="button" data-chiudi-collegamento onClick={() => setAperto(true)} className="w-full py-2 text-sm font-bold text-uscita">Chiudi il collegamento</button>;
  return (
    <form className="space-y-2 rounded-2xl border border-uscita bg-uscita/5 p-4" data-conferma-chiusura
      onSubmit={e => { e.preventDefault(); if (!chiudi.isPending) chiudi.mutate(); }}>
      <p className="text-sm">Non vedrai più i dati di <b>{nome}</b> e la chat si chiude. Per ricollegarvi servirà una nuova richiesta accettata dal cliente.</p>
      <textarea name="motivo" value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} maxLength={500}
        placeholder="Motivo (facoltativo, lo legge il cliente)" aria-label="Motivo" className="w-full rounded-xl border border-bordo bg-fondo px-3 py-2" />
      <div className="flex gap-2">
        <button type="button" onClick={() => setAperto(false)} className="flex-1 rounded-xl border border-bordo py-2.5 font-bold">Annulla</button>
        <button type="submit" data-conferma-chiudi disabled={chiudi.isPending} className="flex-1 rounded-xl bg-uscita py-2.5 font-bold text-fondo disabled:opacity-40">Chiudi</button>
      </div>
      <Errore e={chiudi.error} />
    </form>
  );
}

const NonTrovato = () => <p role="alert" className="py-10 text-center text-tenue" data-cliente-assente>Cliente non trovato. <Link to="/studio/clienti" className="text-principale">Torna ai clienti</Link></p>;

// ------------------------------------------------------------------ Movimenti (sola lettura)
const PAGINA = 50;
export function MovimentiCliente() {
  const { id } = useParams();
  const { n, nome } = useCliente(id);
  const qc = useQueryClient();
  const [scelto, setScelto] = useState(null);
  const [testo, setTesto] = useState('');
  const q = useInfiniteQuery({
    queryKey: ['portale', 'movimenti', n],
    queryFn: ({ pageParam }) => portaleApi.movimenti(n, pageParam, PAGINA),
    initialPageParam: 1,
    getNextPageParam: ult => (ult.pagination.page < ult.pagination.totalPages ? ult.pagination.page + 1 : undefined),
    enabled: !!n
  });
  const chiedi = useMutation({
    mutationFn: () => portaleApi.invia(n, { messaggio: testo.trim(), movimento: scelto.id, chiarimento: true }),
    onSuccess: () => { setScelto(null); setTesto(''); qc.invalidateQueries({ queryKey: ['portale'] }); }
  });
  const righe = useMemo(() => q.data?.pages.flatMap(p => p.movimenti) ?? [], [q.data]);
  if (!n) return <NonTrovato />;
  const totale = q.data?.pages[0]?.pagination.total;
  let giorno = null;

  return (
    <div className="space-y-3" data-movimenti-cliente={totale ?? ''}>
      <Indietro a={`/studio/clienti/${n}`} testo={nome || 'Cliente'} />
      <h1 className="font-importi text-2xl text-secondario">Movimenti</h1>
      <p className="text-xs text-tenue">Sola lettura. Tocca un movimento per chiedere un chiarimento al cliente.</p>
      {q.isLoading && <Carica />}
      <Errore e={q.error} />
      <ListaInfinita altre={q.hasNextPage} caricando={q.isFetchingNextPage} onAltre={() => q.fetchNextPage()}
        vuota={q.data && righe.length === 0 ? <p className="py-8 text-center text-tenue">Nessun movimento nel periodo e nei conti che vedi.</p> : null}>
        <ul className="overflow-hidden rounded-2xl border border-bordo bg-superficie">
          {righe.map(m => {
            const intesta = m.giorno !== giorno; giorno = m.giorno;
            return [
              intesta && <li key={`g${m.giorno}`} className="bg-fondo px-4 py-1 text-xs font-bold uppercase tracking-wide text-tenue">{breve(m.giorno)}</li>,
              <li key={m.id} data-movimento={m.id} className="border-t border-bordo first:border-t-0">
                <button type="button" onClick={() => setScelto(m)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left">
                  <span className="min-w-0 flex-1">
                    <b className="block truncate">{m.controparte || m.descrizione}</b>
                    <span className="block truncate text-sm text-tenue">{[m.controparte && m.descrizione, m.categoria, m.nome_banca].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className={`importo shrink-0 font-semibold ${m.tipo === 'Uscita' ? 'text-uscita' : 'text-entrata'}`}>{conSegno(segnato(m))} €</span>
                </button>
              </li>
            ];
          })}
        </ul>
      </ListaInfinita>
      <BottomSheet aperto={!!scelto} onChiudi={() => { setScelto(null); chiedi.reset(); }} titolo="Chiedi un chiarimento">
        {scelto && (
          <form className="space-y-3" data-chiedi-chiarimento={scelto.id} onSubmit={e => { e.preventDefault(); if (testo.trim() && !chiedi.isPending) chiedi.mutate(); }}>
            <p className="flex justify-between gap-2 rounded-xl bg-fondo p-3 text-sm">
              <span className="truncate">{scelto.controparte || scelto.descrizione} · {breve(scelto.giorno)}</span>
              <span className="importo shrink-0">{conSegno(segnato(scelto))} €</span>
            </p>
            <textarea name="messaggio" value={testo} onChange={e => setTesto(e.target.value)} rows={3} maxLength={5000} autoFocus
              placeholder="Cosa ti serve sapere?" aria-label="Domanda al cliente" className="w-full rounded-xl border border-bordo bg-fondo px-3 py-2" />
            <Errore e={chiedi.error} />
            <button type="submit" disabled={!testo.trim() || chiedi.isPending} className="h-11 w-full rounded-xl bg-chiarire font-bold text-fondo disabled:opacity-40">Chiedi al cliente</button>
          </form>
        )}
      </BottomSheet>
    </div>
  );
}

// ------------------------------------------------------------------ Report ed export
function trimestre(rif = oggi()) {
  const a = Number(rif.slice(0, 4)), m = Number(rif.slice(5, 7));
  const p = Math.floor((m - 1) / 3) * 3 + 1;
  return { dal: estremiMese(`${a}-${String(p).padStart(2, '0')}`).dal, al: estremiMese(`${a}-${String(p + 2).padStart(2, '0')}`).al };
}
const PERIODI = [['mese', 'Questo mese', () => periodo('mese')], ['mese_scorso', 'Mese scorso', () => periodo('mese_scorso')],
  ['trimestre', 'Trimestre', () => trimestre()], ['anno', 'Anno', () => periodo('anno')], ['scelto', 'Dal… al…', null]];
const FORMATI = [['pdf', 'PDF'], ['xlsx', 'Excel'], ['csv', 'CSV']];

export function ReportCliente() {
  const { id } = useParams();
  const { n, nome } = useCliente(id);
  const [scelta, setScelta] = useState('mese');
  const [libero, setLibero] = useState(() => periodo('mese'));
  const p = scelta === 'scelto' ? libero : PERIODI.find(x => x[0] === scelta)[2]();
  const errore = !p.dal || !p.al ? 'Scegli le due date' : p.al < p.dal ? 'La fine viene prima dell\'inizio' : null;
  const esporta = useMutation({ mutationFn: formato => portaleApi.esporta(n, { formato, ...p }).then(salvaFile) });
  if (!n) return <NonTrovato />;

  return (
    <div className="space-y-3" data-report-cliente={n}>
      <Indietro a={`/studio/clienti/${n}`} testo={nome || 'Cliente'} />
      <h1 className="font-importi text-2xl text-secondario">Report ed export</h1>
      <section className="space-y-3 rounded-2xl border border-bordo bg-superficie p-4">
        <h2 className="font-semibold">Periodo</h2>
        <div className="flex flex-wrap gap-2">
          {PERIODI.map(([k, t]) => (
            <button key={k} type="button" data-periodo={k} aria-pressed={scelta === k} onClick={() => setScelta(k)}
              className={`rounded-full border px-3 py-1.5 text-sm ${scelta === k ? 'border-principale bg-principale font-bold text-su-principale' : 'border-bordo'}`}>{t}</button>
          ))}
        </div>
        {scelta === 'scelto' && (
          <div className="grid grid-cols-2 gap-2">
            {[['dal', 'Dal'], ['al', 'Al']].map(([k, t]) => (
              <label key={k} className="text-sm"><span className="text-tenue">{t}</span>
                <input type="date" name={k} value={libero[k] ?? ''} onChange={e => setLibero(x => ({ ...x, [k]: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-bordo bg-fondo px-2 py-2" />
              </label>
            ))}
          </div>
        )}
        <p className="text-sm text-tenue" data-periodo-scelto={`${p.dal}|${p.al}`}>{p.dal && p.al ? `dal ${breve(p.dal)} al ${breve(p.al)}` : ''}</p>
      </section>
      <section className="space-y-3 rounded-2xl border border-bordo bg-superficie p-4">
        <h2 className="font-semibold">Scarica i movimenti</h2>
        <div className="grid grid-cols-3 gap-2">
          {FORMATI.map(([f, t]) => (
            <button key={f} type="button" data-esporta={f} disabled={!!errore || esporta.isPending} onClick={() => esporta.mutate(f)}
              className="h-11 rounded-xl border border-bordo font-bold disabled:opacity-40"><Download size={16} aria-hidden="true" className="mr-1 inline" />{t}</button>
          ))}
        </div>
        <p className="text-xs text-tenue">Solo i movimenti che vedi. Ogni export resta negli accessi del cliente, con il numero di righe.</p>
        {errore && <p role="alert" className="text-sm text-uscita">{errore}</p>}
        {esporta.isPending && <p role="status" className="text-sm text-tenue">Preparo il file…</p>}
        {esporta.isSuccess && <p role="status" className="text-sm text-entrata" data-esportato>File scaricato.</p>}
        <Errore e={esporta.error} />
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ Chat dello studio
export function ChatCliente() {
  const { id } = useParams();
  const { n, nome } = useCliente(id);
  const qc = useQueryClient();
  const [testo, setTesto] = useState('');
  const [scheda, setScheda] = useState('messaggi');
  const fondo = useRef(null);
  const file = useRef(null);
  const chiave = ['portale', 'chat', n];
  const msg = useQuery({ queryKey: [...chiave, 'messaggi'], queryFn: () => portaleApi.messaggi(n), enabled: !!n, refetchInterval: 15000 });
  const chi = useQuery({ queryKey: [...chiave, 'chiarimenti'], queryFn: () => portaleApi.chiarimenti(n), enabled: !!n });
  const doc = useQuery({ queryKey: [...chiave, 'documenti'], queryFn: () => portaleApi.documenti(n), enabled: !!n && scheda === 'documenti' });
  const aggiorna = () => qc.invalidateQueries({ queryKey: ['portale'] });
  const invia = useMutation({ mutationFn: () => portaleApi.invia(n, { messaggio: testo.trim() }), onSuccess: () => { setTesto(''); aggiorna(); } });
  const risolvi = useMutation({ mutationFn: m => portaleApi.risolvi(n, m), onSuccess: aggiorna });
  const scarica = useMutation({ mutationFn: a => portaleApi.scarica(n, a).then(salvaFile) });
  const allega = useMutation({
    mutationFn: f => portaleApi.allega(n, { file: f, messaggio: testo.trim() }),
    onSuccess: () => { setTesto(''); aggiorna(); },
    onSettled: () => { if (file.current) file.current.value = ''; }
  });
  const nonLetti = msg.data?.unread_count;
  useEffect(() => {
    if (n && nonLetti > 0) portaleApi.letti(n).then(() => qc.invalidateQueries({ queryKey: ['portale'] })).catch(() => {});
  }, [n, nonLetti, qc]);
  const quanti = msg.data?.messaggi?.length;
  useEffect(() => { fondo.current?.scrollIntoView({ block: 'end' }); }, [quanti]);
  if (!n) return <NonTrovato />;
  const aperti = chi.data?.chiarimenti ?? [];

  return (
    <div className="-mx-4 flex min-h-full flex-col md:mx-0" data-chat-cliente={n}>
      <div className="flex items-center gap-2 border-b border-bordo bg-superficie px-4 py-2">
        <Link to={`/studio/clienti/${n}`} aria-label="Scheda del cliente" className="text-principale"><ChevronLeft size={20} aria-hidden="true" /></Link>
        <Iniziale nome={nome} />
        <p className="min-w-0 truncate font-bold">{nome}</p>
      </div>
      <div className="flex border-b border-bordo bg-superficie" role="tablist">
        {[['messaggi', 'Messaggi'], ['documenti', 'Documenti']].map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={scheda === k} data-scheda={k} onClick={() => setScheda(k)}
            className={`flex-1 py-2.5 text-sm ${scheda === k ? 'border-b-[3px] border-principale font-bold text-principale' : 'text-tenue'}`}>{t}</button>
        ))}
      </div>
      {(msg.isError || chi.isError) && <div className="px-4 py-3"><Errore e={msg.error || chi.error} /></div>}
      {scheda === 'documenti' && (
        <div className="flex-1 px-4 py-3" data-documenti={doc.data?.documenti?.length ?? ''}>
          {doc.isLoading && <Carica />}
          <Errore e={doc.error} />
          {doc.data?.documenti?.length === 0 && <p className="py-6 text-center text-tenue">Nessun documento.</p>}
          <ul className="divide-y divide-bordo">
            {doc.data?.documenti?.map(d => (
              <li key={d.id}>
                <button type="button" data-documento={d.id} onClick={() => scarica.mutate(d.id)} className="flex w-full items-center gap-3 py-3 text-left">
                  <Download size={18} aria-hidden="true" className="shrink-0 text-principale" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{d.nome}</span>
                    <span className="block truncate text-xs text-tenue">
                      {d.mittente_tipo === 'user' ? 'il cliente' : 'tu'} · {new Date(d.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} · {peso(d.dimensione)}
                      {d.movimento ? ` · ${d.movimento.descrizione}, ${breve(d.movimento.giorno)}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Errore e={scarica.error} />
        </div>
      )}
      {scheda === 'messaggi' && <>
        {aperti.length > 0 && (
          <section className="mx-4 mt-3 rounded-2xl border border-chiarire bg-chiarire/10 px-3 py-2" data-fascia-chiarire={aperti.length}>
            <p className="text-xs font-bold uppercase tracking-wide text-chiarire">{aperti.length} da chiarire</p>
            <ul>
              {aperti.map(x => (
                <li key={x.id} className="flex items-center gap-2 py-1.5 text-sm" data-chiarimento={x.id}>
                  <span className="min-w-0 flex-1 truncate">{x.messaggio}</span>
                  <button type="button" data-risolvi={x.id} disabled={risolvi.isPending} onClick={() => risolvi.mutate(x.id)}
                    className="shrink-0 rounded-full border border-bordo bg-superficie px-2 py-0.5 text-xs font-bold">Chiarito</button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <ul className="flex-1 space-y-2 px-4 py-3" aria-live="polite">
          {msg.data?.messaggi?.length === 0 && <p className="py-6 text-center text-tenue">Scrivi il primo messaggio al cliente.</p>}
          {msg.data?.messaggi?.map(m => <Bolla key={m.id} m={m} io="commercialista" onScarica={a => scarica.mutate(a)} />)}
          <li ref={fondo} aria-hidden="true" />
        </ul>
        <form className="sticky bottom-0 flex items-end gap-2 border-t border-bordo bg-superficie px-3 py-2"
          onSubmit={e => { e.preventDefault(); if (testo.trim() && !invia.isPending) invia.mutate(); }}>
          <input ref={file} type="file" name="file" accept={ACCETTA} hidden data-file
            onChange={e => { const f = e.target.files?.[0]; if (f && !allega.isPending) allega.mutate(f); }} />
          <button type="button" aria-label="Allega un file" data-allega disabled={allega.isPending} onClick={() => file.current?.click()}
            className="rounded-full p-2.5 text-principale disabled:opacity-40"><Paperclip size={20} aria-hidden="true" /></button>
          <textarea name="messaggio" value={testo} onChange={e => setTesto(e.target.value)} rows={1} maxLength={5000}
            placeholder="Scrivi al cliente" aria-label="Messaggio" className="max-h-32 min-w-0 flex-1 resize-none rounded-xl border border-bordo bg-fondo px-3 py-2" />
          <button type="submit" aria-label="Invia" data-invia disabled={!testo.trim() || invia.isPending}
            className="rounded-full bg-principale p-2.5 text-su-principale disabled:opacity-40"><Send size={18} aria-hidden="true" /></button>
        </form>
        {(invia.isError || allega.isError || scarica.isError) && <p role="alert" className="px-4 text-sm text-uscita">{(invia.error || allega.error || scarica.error).message}</p>}
        {allega.isPending && <p role="status" className="px-4 text-sm text-tenue">Invio del file…</p>}
      </>}
    </div>
  );
}

// ------------------------------------------------------------------ Elenco delle chat
export function Chat() {
  const q = useQuery({ queryKey: ['portale', 'clienti'], queryFn: portaleApi.clienti });
  const attivi = (q.data?.clienti ?? []).filter(c => c.stato === 'attiva');
  return (
    <div className="space-y-3">
      <h1 className="font-importi text-2xl text-secondario">Chat</h1>
      {q.isLoading && <Carica />}
      <Errore e={q.error} />
      <ul className="divide-y divide-bordo rounded-2xl border border-bordo bg-superficie" data-chat-clienti={q.data ? attivi.length : ''}>
        {attivi.map(c => (
          <li key={c.collegamento_id}>
            <Link to={`/studio/clienti/${c.user_id}/chat`} data-chat-con={c.user_id} className="flex items-center gap-3 px-4 py-3">
              <Iniziale nome={c.username} />
              <b className="min-w-0 flex-1 truncate">{c.username}</b>
              {c.unread_messages > 0 && <span className="importo rounded-full bg-info px-2 py-0.5 text-xs font-bold text-fondo">{c.unread_messages}</span>}
            </Link>
          </li>
        ))}
        {q.data && attivi.length === 0 && <li className="px-4 py-6 text-center text-tenue">Nessun cliente attivo.</li>}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ Accessi
const TIPI = { dettaglio_cliente: 'scheda e movimenti', export: 'export', chat: 'chat', lista_clienti: 'elenco dei clienti', allegato: 'documento scaricato', disconnessione: 'fine del collegamento' };
export function AccessiCliente() {
  const { id } = useParams();
  const { n, nome } = useCliente(id);
  const q = useQuery({ queryKey: ['portale', 'accessi', n], queryFn: () => portaleApi.accessi(n), enabled: !!n });
  if (!n) return <NonTrovato />;
  return (
    <div className="space-y-3" data-accessi-cliente={q.data?.accessi?.length ?? ''}>
      <Indietro a={`/studio/clienti/${n}`} testo={nome || 'Cliente'} />
      <h1 className="font-importi text-2xl text-secondario">Accessi</h1>
      <p className="text-sm text-tenue">Ogni volta che guardi i dati del cliente resta scritto qui, e il cliente lo vede.</p>
      {q.isLoading && <Carica />}
      <Errore e={q.error} />
      <ul className="divide-y divide-bordo rounded-2xl border border-bordo bg-superficie">
        {q.data?.accessi?.map(a => (
          <li key={a.id} className="flex justify-between gap-2 px-4 py-2.5 text-sm" data-accesso={a.tipo_accesso}>
            <span>{TIPI[a.tipo_accesso] || a.tipo_accesso}{a.numero_record != null ? ` · ${a.numero_record} ${a.numero_record === 1 ? 'riga' : 'righe'}` : ''}</span>
            <span className="shrink-0 text-tenue">{ora(a.created_at)}</span>
          </li>
        ))}
        {q.data?.accessi?.length === 0 && <li className="px-4 py-6 text-center text-tenue">Nessun accesso.</li>}
      </ul>
    </div>
  );
}

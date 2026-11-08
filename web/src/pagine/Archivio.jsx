import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { archivioApi } from '../api/archivio';
import { salvaFile } from '../api/client';
import { aggiornaRegistro } from '../componenti/ModuloMovimento';
import { centesimiDa, formatta } from '../util/importi';
import { oggi } from '../util/date';

const Sezione = ({ titolo, children, ...resto }) => (
  <section className="space-y-3 rounded-2xl border border-bordo bg-superficie p-4" {...resto}>
    <h2 className="font-semibold">{titolo}</h2>
    {children}
  </section>
);
// «1 movimento», «2 movimenti».
const quanti = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;
const euro = t => `${formatta(centesimiDa(t) ?? 0)} €`;
const bottone = 'rounded-xl border border-bordo px-3 py-2 text-sm disabled:opacity-40';
const primario = 'h-11 w-full rounded-xl bg-principale font-bold text-su-principale disabled:opacity-40';

function Esito({ r }) {
  const e = r.dettagli?.entità_create ?? {};
  const nuove = [[e.anagrafiche, 'controparte', 'controparti'], [e.conti, 'conto', 'conti'],
    [(e.categorie_movimenti ?? 0) + (e.categorie_anagrafiche ?? 0), 'categoria', 'categorie'], [e.tipologie, 'tipologia', 'tipologie']]
    .filter(([n]) => n > 0).map(([n, uno, molti]) => quanti(n, uno, molti));
  const avvisi = r.stats?.warnings ?? [];
  return (
    <div className="space-y-2 text-sm" data-esito-import={r.anteprima ? 'anteprima' : 'fatto'} data-importati={r.stats?.movimenti_importati ?? 0}>
      <p className="font-semibold">
        {r.anteprima ? `Si importeranno ${quanti(r.stats.movimenti_importati, 'movimento', 'movimenti')}` : `Importati ${quanti(r.stats.movimenti_importati, 'movimento', 'movimenti')}`}
      </p>
      <p>Entrate <span className="importo text-entrata" data-totale-entrate={r.totali?.entrate}>+ {euro(r.totali?.entrate)}</span>
        {' · '}Uscite <span className="importo text-uscita" data-totale-uscite={r.totali?.uscite}>− {euro(r.totali?.uscite)}</span></p>
      {nuove.length > 0 && <p className="text-tenue">Nuovi: {nuove.join(', ')}.</p>}
      {avvisi.length > 0 && (
        <div className="rounded-xl bg-uscita/10 p-2.5 text-uscita" data-righe-scartate={r.stats.errori}>
          <p className="font-semibold">{quanti(r.stats.errori, 'riga', 'righe')} {r.anteprima ? (r.stats.errori === 1 ? 'verrà saltata' : 'verranno saltate') : (r.stats.errori === 1 ? 'saltata' : 'saltate')}:</p>
          <ul className="mt-1 list-disc pl-5">{avvisi.slice(0, 8).map(a => <li key={a}>{a}</li>)}</ul>
          {avvisi.length > 8 && <p>… e altre {avvisi.length - 8}.</p>}
        </div>
      )}
    </div>
  );
}

// Import CSV in due tempi: anteprima (il server fa tutto e annulla), poi conferma.
function Importa() {
  const qc = useQueryClient();
  const [file, setFile] = useState(null);
  const [testo, setTesto] = useState('');
  const anteprima = useMutation({ mutationFn: t => archivioApi.importa(t, true) });
  const importa = useMutation({ mutationFn: () => archivioApi.importa(testo, false), onSuccess: () => aggiornaRegistro(qc) });
  const modello = useMutation({ mutationFn: () => archivioApi.modello().then(salvaFile) });
  const scegli = async f => {
    setFile(f); anteprima.reset(); importa.reset();
    if (!f) return;
    const t = await f.text();
    setTesto(t);
    anteprima.mutate(t);
  };
  const r = importa.data || anteprima.data;
  const err = anteprima.error || importa.error;
  const n = anteprima.data?.stats?.movimenti_importati ?? 0;

  return (
    <Sezione titolo="Importa movimenti" data-importa>
      <p className="text-sm text-tenue">File CSV con punto e virgola: Data, Descrizione, Importo, Tipo; facoltativi Anagrafica, Conto, Categoria_Movimento, Note.
        {' '}<button type="button" className="text-principale underline" data-modello onClick={() => modello.mutate()}>Scarica il modello</button></p>
      <input type="file" accept=".csv,text/csv" name="csv" aria-label="File CSV" data-file-import
        onChange={e => scegli(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
      {anteprima.isPending && <p className="text-sm text-tenue" role="status">Leggo il file…</p>}
      {err && <p role="alert" className="text-sm text-uscita">{err.message}</p>}
      {r && <Esito r={r} />}
      {anteprima.data && !importa.data && (
        <button type="button" className={primario} disabled={n === 0 || importa.isPending} data-conferma-import onClick={() => importa.mutate()}>
          {importa.isPending ? 'Importo…' : `Importa ${quanti(n, 'movimento', 'movimenti')}`}
        </button>
      )}
      {importa.data && <p className="text-sm"><Link to="/" className="text-principale">Vai al registro</Link>{file && ` · ${file.name}`}</p>}
    </Sezione>
  );
}

function Esporta() {
  const anno = oggi().slice(0, 4);
  const [dal, setDal] = useState(`${anno}-01-01`);
  const [al, setAl] = useState(oggi());
  const [formato, setFormato] = useState('xlsx');
  const esporta = useMutation({
    mutationFn: () => archivioApi.esporta({ export_type: 'commercialista', formato, data_inizio: dal, data_fine: al, ordine: 'asc' }).then(salvaFile)
  });
  const errore = !dal || !al ? 'Indica il periodo' : al < dal ? 'La fine precede l\'inizio' : null;
  return (
    <Sezione titolo="Esporta movimenti" data-esporta>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label>Dal<input type="date" name="dal" value={dal} onChange={e => setDal(e.target.value)} className="mt-1 w-full rounded-xl border border-bordo bg-fondo px-2 py-1.5" /></label>
        <label>Al<input type="date" name="al" value={al} onChange={e => setAl(e.target.value)} className="mt-1 w-full rounded-xl border border-bordo bg-fondo px-2 py-1.5" /></label>
      </div>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Formato">
        {[['xlsx', 'Excel'], ['csv', 'CSV'], ['pdf', 'PDF']].map(([v, t]) => (
          <button key={v} type="button" role="radio" aria-checked={formato === v} data-formato={v} onClick={() => setFormato(v)}
            className={`rounded-lg border py-2 text-sm ${formato === v ? 'border-principale bg-principale font-semibold text-su-principale' : 'border-bordo'}`}>{t}</button>
        ))}
      </div>
      {(errore || esporta.error) && <p role="alert" className="text-sm text-uscita">{errore || esporta.error.message}</p>}
      <button type="button" className={primario} disabled={!!errore || esporta.isPending} data-scarica-export onClick={() => esporta.mutate()}>
        {esporta.isPending ? 'Preparo…' : 'Scarica'}
      </button>
    </Sezione>
  );
}

// Copia completa dei dati (JSON) e ripristino, tutto o niente sul server.
function Copia() {
  const qc = useQueryClient();
  const [dati, setDati] = useState(null);
  const [letturaKo, setLetturaKo] = useState('');
  const [modo, setModo] = useState(null);
  const scarica = useMutation({ mutationFn: () => archivioApi.copia().then(salvaFile) });
  const ripristina = useMutation({
    mutationFn: () => archivioApi.ripristina(dati, modo),
    onSuccess: () => { aggiornaRegistro(qc); qc.invalidateQueries({ queryKey: ['categorie'] }); }
  });
  const scegli = async f => {
    setDati(null); setModo(null); setLetturaKo(''); ripristina.reset();
    if (!f) return;
    try { setDati(JSON.parse(await f.text())); } catch { setLetturaKo('Il file non è una copia di Prima Nota'); }
  };
  const err = ripristina.error;
  const conti = dati ? ['movimenti', 'anagrafiche', 'conti_correnti'].map(k => (Array.isArray(dati[k]) ? dati[k].length : 0)) : null;

  return (
    <Sezione titolo="Copia di sicurezza" data-copia>
      <p className="text-sm text-tenue">Tutti i tuoi dati in un file: conti, controparti, categorie, movimenti.</p>
      <button type="button" className={bottone} disabled={scarica.isPending} data-scarica-copia onClick={() => scarica.mutate()}>
        {scarica.isPending ? 'Preparo…' : 'Scarica la copia'}
      </button>
      {scarica.error && <p role="alert" className="text-sm text-uscita">{scarica.error.message}</p>}
      <label className="block text-sm">
        <span className="text-tenue">Ripristina da una copia</span>
        <input type="file" accept=".json,application/json" name="copia" data-file-copia onChange={e => scegli(e.target.files?.[0] ?? null)} className="mt-1 block w-full" />
      </label>
      {letturaKo && <p role="alert" className="text-sm text-uscita">{letturaKo}</p>}
      {dati && !ripristina.data && (
        <div className="space-y-2" data-copia-letta>
          <p className="text-sm">Nella copia: {quanti(conti[0], 'movimento', 'movimenti')}, {quanti(conti[1], 'controparte', 'controparti')}, {quanti(conti[2], 'conto', 'conti')}.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" data-modo="merge" aria-pressed={modo === 'merge'} onClick={() => setModo('merge')}
              className={`${bottone} ${modo === 'merge' ? 'border-principale font-semibold' : ''}`}>Aggiungi ai miei dati</button>
            <button type="button" data-modo="replace" aria-pressed={modo === 'replace'} onClick={() => setModo('replace')}
              className={`${bottone} ${modo === 'replace' ? 'border-uscita font-semibold text-uscita' : ''}`}>Sostituisci tutto</button>
          </div>
          {modo === 'replace' && (
            <p className="rounded-xl bg-uscita/10 p-2.5 text-sm text-uscita" role="status" data-avviso-sostituisci>
              I tuoi movimenti, controparti, conti e categorie di adesso vengono cancellati e sostituiti da quelli della copia.
            </p>
          )}
          {modo && (
            <button type="button" className={modo === 'replace' ? 'h-11 w-full rounded-xl bg-uscita font-bold text-white disabled:opacity-40' : primario}
              disabled={ripristina.isPending} data-conferma-ripristino onClick={() => ripristina.mutate()}>
              {ripristina.isPending ? 'Ripristino…' : modo === 'replace' ? 'Sì, sostituisci tutto' : 'Aggiungi'}
            </button>
          )}
        </div>
      )}
      {err && (
        <div role="alert" className="text-sm text-uscita" data-ripristino-ko>
          <p>{err.message}</p>
          {err.corpo?.errori?.length > 0 && <ul className="mt-1 list-disc pl-5">{err.corpo.errori.slice(0, 5).map(x => <li key={x}>{x}</li>)}</ul>}
        </div>
      )}
      {ripristina.data && (
        <p className="text-sm" data-ripristino-ok>Ripristinati {ripristina.data.results?.imported?.movimenti ?? 0} movimenti.</p>
      )}
    </Sezione>
  );
}

export default function Archivio() {
  return (
    <div className="space-y-4" data-archivio>
      <Link to="/impostazioni" className="inline-flex items-center gap-1 text-sm text-principale"><ChevronLeft size={16} aria-hidden="true" />Impostazioni</Link>
      <h1 className="font-importi text-2xl text-secondario">Import ed export</h1>
      <Importa />
      <Esporta />
      <Copia />
    </div>
  );
}

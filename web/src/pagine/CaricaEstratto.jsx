import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, FileUp } from 'lucide-react';
import { estrattiApi } from '../api/estratti';
import { aggiornaRegistro } from '../componenti/ModuloMovimento';
import { useConti } from '../componenti/conti';
import { centesimiDa, formatta } from '../util/importi';
import { breve } from '../util/date';

// Estratto conto della banca (U9a, tavola 1): conto e file -> colonne (solo se la
// banca non e' riconosciuta) -> anteprima -> importa. Le righe nuove entrano nel
// Registro «da descrivere».
const primario = 'h-12 w-full rounded-xl bg-principale font-bold text-su-principale disabled:opacity-40';
const RUOLI = [
  ['data', 'Data'], ['descrizione', 'Descrizione'], ['importo', 'Importo (col segno)'],
  ['entrate', 'Entrate'], ['uscite', 'Uscite'], ['data_valuta', 'Data valuta']
];
const quante = (n, uno, tanti) => `${n} ${n === 1 ? uno : tanti}`;

// Abbinamento delle colonne a mano, sulla riga d'intestazione scelta.
function Colonne({ righe, onUsa }) {
  const prima = Math.max(0, righe.findIndex(r => r.filter(Boolean).length >= 3));
  const [riga, setRiga] = useState(prima);
  const [m, setM] = useState({});
  const celle = righe[riga] ?? [];
  const colonne = Math.max(...righe.map(r => r.length));
  const metti = (k, v) => setM(x => { const y = { ...x }; if (v === '') delete y[k]; else y[k] = Number(v); return y; });
  const importi = m.importo !== undefined || (m.entrate !== undefined && m.uscite !== undefined);
  const pronta = m.data !== undefined && m.descrizione !== undefined && importi;
  const esempio = righe[riga + 1] ?? [];
  return (
    <div className="space-y-3" data-colonne>
      <p className="text-sm">Questa banca non la conosco ancora. Indica una volta sola dove sono le colonne: il modello resta salvato (solo i nomi delle colonne, nessun dato).</p>
      <label className="block text-sm">
        <span className="text-tenue">Riga con i nomi delle colonne</span>
        <select name="intestazione" value={riga} onChange={e => setRiga(Number(e.target.value))}
          className="mt-1 w-full rounded-xl border border-bordo bg-fondo px-3 py-2">
          {righe.map((r, i) => <option key={i} value={i}>{i + 1}: {r.filter(Boolean).join(' · ').slice(0, 70) || '(vuota)'}</option>)}
        </select>
      </label>
      {RUOLI.map(([k, t]) => (
        <label key={k} className="flex items-center justify-between gap-3 text-sm">
          <span>{t}</span>
          <select name={`colonna-${k}`} value={m[k] ?? ''} onChange={e => metti(k, e.target.value)}
            className="w-1/2 rounded-xl border border-bordo bg-fondo px-2 py-1.5">
            <option value="">—</option>
            {Array.from({ length: colonne }, (_, i) => (
              <option key={i} value={i}>{celle[i] || `Colonna ${i + 1}`}{esempio[i] ? ` (es. ${String(esempio[i]).slice(0, 18)})` : ''}</option>
            ))}
          </select>
        </label>
      ))}
      <p className="text-xs text-tenue">Servono data, descrizione e l'importo: una colonna col segno oppure Entrate e Uscite.</p>
      <button type="button" className={primario} disabled={!pronta} data-usa-colonne onClick={() => onUsa({ ...m, intestazione: riga })}>Usa queste colonne</button>
    </div>
  );
}

function Anteprima({ a }) {
  const r = a.riepilogo;
  const diff = centesimiDa(r.saldo.differenza);
  return (
    <div className="space-y-3" data-anteprima-estratto data-nuove={r.nuove} data-abbinate={r.abbinate} data-gia={r.gia}>
      <p className="text-sm text-tenue">{breve(a.dal)} – {breve(a.al)} · {quante(r.totale, 'riga', 'righe')}{a.modello ? ` · modello ${a.modello.nome}` : ''}</p>
      <ul className="divide-y divide-bordo rounded-2xl border border-bordo bg-superficie text-[0.9375rem]">
        <li className="flex justify-between px-4 py-2.5"><span>Già nel Registro</span><b>{r.abbinate}</b></li>
        <li className="flex justify-between px-4 py-2.5"><span>Nuove, da descrivere</span><b>{r.nuove}</b></li>
        {r.gia > 0 && <li className="flex justify-between px-4 py-2.5 text-tenue"><span>Già importate prima (saltate)</span><b>{r.gia}</b></li>}
        {a.scartate > 0 && <li className="flex justify-between px-4 py-2.5 text-tenue"><span>Non contabilizzate o senza importo</span><b>{a.scartate}</b></li>}
      </ul>
      {r.saldo.file !== null && (
        <p className={`rounded-xl px-4 py-2.5 text-sm ${diff === 0 ? 'bg-entrata/10' : 'bg-uscita/10'}`} data-controllo-saldo={diff === 0 ? 'ok' : 'diverso'}>
          {diff === 0
            ? <>Saldo della banca {formatta(centesimiDa(r.saldo.file))} € = saldo del Registro. Tutto torna.</>
            : <>Saldo della banca {formatta(centesimiDa(r.saldo.file))} €, del Registro dopo l'import {formatta(centesimiDa(r.saldo.registro_dopo))} €: differenza {formatta(diff)} €. Manca o è in più qualche movimento, oppure il saldo iniziale del conto è diverso.</>}
        </p>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-principale">Vedi le righe</summary>
        <ul className="mt-2 divide-y divide-bordo">
          {a.righe.map(x => (
            <li key={x.riga} className="flex gap-3 py-2" data-riga-estratto={x.esito}>
              <span className="w-12 shrink-0 text-tenue">{breve(x.data)}</span>
              <span className="min-w-0 flex-1 truncate">{x.descrizione}</span>
              <span className={`importo shrink-0 ${x.tipo === 'Entrata' ? 'text-entrata' : 'text-uscita'}`}>{x.tipo === 'Entrata' ? '+' : '−'}{formatta(centesimiDa(x.importo))}</span>
              <span className="w-20 shrink-0 text-right text-xs text-tenue">{x.esito === 'nuova' ? 'nuova' : x.esito === 'abbinata' ? 'nel Registro' : 'già importata'}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export default function CaricaEstratto() {
  const qc = useQueryClient();
  const vai = useNavigate();
  const { conti, conto: proposto } = useConti();
  const [contoId, setContoId] = useState(null);
  const [file, setFile] = useState(null);
  const [mappa, setMappa] = useState(null);
  const conto = contoId ?? proposto?.id ?? null;
  const anteprima = useMutation({ mutationFn: x => estrattiApi.anteprima(x) });
  const importa = useMutation({
    mutationFn: () => estrattiApi.importa({ file, conto, mappa }),
    onSuccess: () => aggiornaRegistro(qc)
  });
  const leggi = (f, m) => { importa.reset(); if (f && conto) anteprima.mutate({ file: f, conto, mappa: m }); };
  const err = anteprima.error;
  const serveMappa = err?.corpo?.serve_mappa;
  const a = anteprima.data;

  if (importa.data) {
    const n = importa.data.riepilogo.nuove;
    return (
      <div className="space-y-4" data-estratto-importato={n}>
        <h1 className="font-importi text-2xl text-secondario">Estratto importato</h1>
        <p>{quante(n, 'movimento nuovo', 'movimenti nuovi')} nel Registro, {quante(importa.data.riepilogo.abbinate, 'già presente', 'già presenti')}.</p>
        {n > 0 && <button type="button" className={primario} data-vai-descrivere onClick={() => vai('/?descrivere=1')}>Descrivi le righe nuove</button>}
        <Link to="/" className="block text-center text-principale">Torna al Registro</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4" data-carica-estratto>
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-principale"><ChevronLeft size={16} aria-hidden="true" />Registro</Link>
      <h1 className="font-importi text-2xl text-secondario">Carica l'estratto conto</h1>
      <p className="text-sm text-tenue">Il file come lo scarichi dall'home banking: Excel (.xlsx), CSV o camt.053. I movimenti che hai già scritto non si doppiano; gli altri entrano da descrivere, così lo studio li vede tutti.</p>
      <label className="block text-sm">
        <span className="text-tenue">Conto</span>
        <select name="conto" value={conto ?? ''} onChange={e => { setContoId(Number(e.target.value)); anteprima.reset(); setMappa(null); }}
          className="mt-1 w-full rounded-xl border border-bordo bg-fondo px-3 py-2">
          {conti.map(c => <option key={c.id} value={c.id}>{c.nome_banca}</option>)}
        </select>
      </label>
      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-principale/60 bg-superficie px-4 py-4">
        <FileUp size={22} aria-hidden="true" className="text-principale" />
        <span className="min-w-0 flex-1 truncate">{file ? file.name : 'Scegli il file della banca'}</span>
        <input type="file" name="estratto" accept=".xlsx,.csv,.txt,.xml,text/csv,application/xml" className="sr-only" data-file-estratto
          onChange={e => { const f = e.target.files?.[0] ?? null; setFile(f); setMappa(null); leggi(f, null); }} />
      </label>
      {anteprima.isPending && <p role="status" className="text-sm text-tenue">Leggo il file…</p>}
      {err && !serveMappa && <p role="alert" className="text-sm text-uscita">{err.message}</p>}
      {serveMappa && <Colonne righe={err.corpo.righe} onUsa={m => { setMappa(m); leggi(file, m); }} />}
      {a && <Anteprima a={a} />}
      {importa.error && <p role="alert" className="text-sm text-uscita">{importa.error.message}</p>}
      {a && (
        <button type="button" className={primario} data-conferma-estratto disabled={importa.isPending || a.riepilogo.nuove + a.riepilogo.abbinate === 0}
          onClick={() => importa.mutate()}>
          {importa.isPending ? 'Importo…' : a.riepilogo.nuove + a.riepilogo.abbinate === 0 ? 'Niente di nuovo da importare' : `Importa ${quante(a.riepilogo.nuove, 'riga nuova', 'righe nuove')}`}
        </button>
      )}
    </div>
  );
}

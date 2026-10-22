import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { registroApi } from '../api/registro';
import { aggiornaRegistro } from '../componenti/ModuloMovimento';
import { centesimiDa, formatta, inCampo, leggi, perApi } from '../util/importi';

const VUOTO = { nome_banca: '', intestatario: '', iban: '', saldo: '0,00', attivo: true };

function Modulo({ conto }) {
  const qc = useQueryClient();
  const vai = useNavigate();
  const nuovo = !conto;
  const [v, setV] = useState(() => (nuovo ? VUOTO : {
    nome_banca: conto.nome_banca ?? '', intestatario: conto.intestatario ?? '', iban: conto.iban ?? '',
    saldo: inCampo(centesimiDa(conto.saldo_iniziale) ?? 0), attivo: conto.attivo !== false
  }));
  const [conferma, setConferma] = useState(false);
  const campo = k => e => setV(x => ({ ...x, [k]: e.target.value }));
  const saldo = leggi(v.saldo);
  const saldoPrima = nuovo ? 0 : centesimiDa(conto.saldo_iniziale) ?? 0;
  const cambiaSaldo = !nuovo && saldo !== null && saldo !== saldoPrima;
  const errore = !v.nome_banca.trim() ? 'Scrivi il nome del conto' : !v.intestatario.trim() ? 'Scrivi l\'intestatario'
    : saldo === null ? 'Saldo iniziale non valido' : null;
  const fine = () => { aggiornaRegistro(qc); vai('/conti', { replace: true }); };

  const salva = useMutation({
    mutationFn: () => {
      const corpo = {
        nome_banca: v.nome_banca.trim(), intestatario: v.intestatario.trim(),
        iban: v.iban.replace(/\s/g, '').toUpperCase() || null, saldo_iniziale: perApi(saldo), attivo: v.attivo
      };
      return nuovo ? registroApi.creaConto(corpo) : registroApi.modificaConto(conto.id, corpo);
    },
    onSuccess: fine
  });
  const elimina = useMutation({ mutationFn: () => registroApi.eliminaConto(conto.id), onSuccess: fine });
  const occupato = salva.isPending || elimina.isPending;
  const err = salva.error || elimina.error;

  return (
    <form className="space-y-4" data-modulo-conto={nuovo ? 'nuovo' : conto.id}
      onSubmit={e => { e.preventDefault(); if (!errore && !occupato) salva.mutate(); }}>
      <div className="flex items-center justify-between">
        <Link to="/conti" className="inline-flex items-center gap-1 text-sm text-principale"><ChevronLeft size={16} aria-hidden="true" />Conti</Link>
        <button type="submit" disabled={!!errore || occupato} data-salva-conto
          className="rounded-lg bg-principale px-4 py-1.5 font-bold text-su-principale disabled:opacity-40">{salva.isPending ? 'Salvo…' : 'Salva'}</button>
      </div>
      <h1 className="font-importi text-2xl text-secondario">{nuovo ? 'Nuovo conto' : conto.nome_banca}</h1>
      {!nuovo && (
        <p className="text-sm text-tenue">Saldo attuale <span className="importo font-semibold text-testo">{formatta(centesimiDa(conto.saldo_corrente) ?? 0)} €</span> · {conto.numero_movimenti} movimenti</p>
      )}
      <section className="space-y-3 rounded-2xl border border-bordo bg-superficie p-4">
        {[['nome_banca', 'Nome (banca, carta, cassa)', 100], ['intestatario', 'Intestatario', 100], ['iban', 'IBAN (facoltativo)', 42]].map(([k, t, max]) => (
          <label key={k} className="block text-sm">
            <span className="text-tenue">{t}</span>
            <input name={k} value={v[k]} onChange={campo(k)} maxLength={max} autoComplete="off"
              className="mt-1 w-full rounded-xl border border-bordo bg-fondo px-3 py-2" />
          </label>
        ))}
        <label className="block text-sm">
          <span className="text-tenue">Saldo iniziale (€)</span>
          <input name="saldo_iniziale" value={v.saldo} onChange={campo('saldo')} inputMode="decimal" autoComplete="off"
            className="importo mt-1 w-full rounded-xl border border-bordo bg-fondo px-3 py-2 text-right" />
        </label>
        {cambiaSaldo && (
          <p className="rounded-xl bg-chiarire/10 p-2.5 text-sm text-chiarire" role="status" data-avviso-saldo>
            Cambiando il saldo iniziale cambiano tutti i saldi del conto, anche quelli passati: da {formatta(saldoPrima)} a {formatta(saldo)} €.
          </p>
        )}
        <label className="flex items-center justify-between text-sm">
          <span>Attivo<span className="block text-xs text-tenue">Un conto disattivato non si sceglie nei nuovi movimenti.</span></span>
          <input type="checkbox" name="attivo" checked={v.attivo} onChange={e => setV(x => ({ ...x, attivo: e.target.checked }))} className="h-5 w-5" />
        </label>
      </section>
      {(err || (errore && (v.nome_banca || v.intestatario))) && <p role="alert" className="text-sm text-uscita">{err ? err.message : errore}</p>}
      {!nuovo && (
        conferma ? (
          <button type="button" data-elimina-conto="conferma" disabled={occupato} onClick={() => elimina.mutate()}
            className="w-full rounded-xl bg-uscita py-2.5 font-bold text-white">Sì, elimina il conto</button>
        ) : (
          <button type="button" data-elimina-conto onClick={() => setConferma(true)}
            className="w-full rounded-xl border border-uscita py-2.5 font-semibold text-uscita">Elimina il conto</button>
        )
      )}
      {!nuovo && <p className="text-xs text-tenue">Si elimina solo un conto senza movimenti; altrimenti si disattiva.</p>}
    </form>
  );
}

// Pagina del conto (U6a, tavola 4 B): nuovo o modifica.
export default function Conto() {
  const { id } = useParams();
  const nuovo = id === 'nuovo';
  const n = Number(id);
  const valido = nuovo || (Number.isInteger(n) && n > 0 && n <= 2147483647);
  const q = useQuery({ queryKey: ['conto', n], queryFn: () => registroApi.conto(n), enabled: valido && !nuovo });
  if (!valido || q.isError) return <p role="alert" className="py-10 text-center text-tenue" data-conto-assente>Conto non trovato. <Link to="/conti" className="text-principale">Torna ai conti</Link></p>;
  if (!nuovo && q.isLoading) return <p className="text-tenue" role="status">Caricamento…</p>;
  return <Modulo key={nuovo ? 'nuovo' : q.data.updated_at} conto={nuovo ? null : q.data} />;
}

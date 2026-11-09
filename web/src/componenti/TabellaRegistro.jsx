import { Fragment } from 'react';
import { formatta } from '../util/importi';
import { giornoCorto, giornoLungo } from '../util/date';
import { Chiarire } from './righe/Righe';

const filetto = 'border-l border-uscita/25';

// Il Registro da computer (U7, tavola A): la prima nota come libro cassa, una
// riga per movimento, entrate e uscite in colonne separate, saldo riga per riga.
// Righe a gruppi di giorno, in ordine (data, id) decrescente come l'API.
export default function TabellaRegistro({ gruppi, onApri, conConto }) {
  return (
    <table className="w-full border-collapse text-[1.0625rem]" data-tabella-registro>
      <thead className="sticky top-0 z-[5] bg-fondo">
        <tr className="border-b-2 border-bordo text-left text-[0.9375rem] font-semibold text-tenue">
          <th scope="col" className="w-24 py-2.5 pl-3 font-semibold">Data</th>
          <th scope="col" className="py-2.5 pr-3 font-semibold">Controparte e descrizione</th>
          <th scope="col" className="w-[14%] py-2.5 pr-3 font-semibold">Categoria</th>
          {conConto && <th scope="col" className="w-[11%] py-2.5 pr-3 font-semibold">Conto</th>}
          <th scope="col" className={`w-32 py-2.5 pr-3 text-right font-semibold ${filetto}`}>Entrate</th>
          <th scope="col" className={`w-32 py-2.5 pr-3 text-right font-semibold ${filetto}`}>Uscite</th>
          <th scope="col" className={`w-36 py-2.5 pr-3 text-right font-semibold ${filetto}`}>Saldo</th>
        </tr>
      </thead>
      <tbody>
        {gruppi.map(g => (
          <Fragment key={g.giorno}>
            <tr data-giorno={g.giorno} className="border-b border-bordo bg-principale/[0.06]">
              <th scope="colgroup" colSpan={conConto ? 7 : 6} className="py-1.5 pl-3 text-left text-[0.9375rem] font-bold text-secondario">
                {giornoLungo(g.giorno)}
              </th>
            </tr>
            {g.righe.map(r => (
              <tr key={r.id} data-movimento={r.id} onClick={() => onApri(r.id)}
                className="cursor-pointer border-b border-bordo bg-superficie align-top hover:bg-principale/[0.04]">
                <td className="importo py-3 pl-3 text-tenue">{giornoCorto(r.giorno)}</td>
                <td className="py-3 pr-3">
                  <button type="button" onClick={e => { e.stopPropagation(); onApri(r.id); }}
                    className="text-left font-bold hover:underline">{r.chi}</button>
                  {r.daChiarire && <Chiarire />}
                  {r.cosa && <p className="text-[0.9375rem] text-tenue">{r.cosa}</p>}
                </td>
                <td className="py-3 pr-3" data-categoria-riga={r.soloCategoria}>
                  {r.soloCategoria}
                  {r.tipologia && (
                    <p className="flex items-center gap-1.5 text-[0.9375rem] text-tenue" data-tipologia-riga={r.tipologia}>
                      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: r.coloreTipologia || 'var(--pn-neutro)' }} />
                      {r.tipologia}
                    </p>
                  )}
                </td>
                {conConto && <td className="py-3 pr-3">{r.conto}</td>}
                <td className={`importo py-3 pr-3 text-right text-lg font-semibold text-entrata ${filetto}`} data-entrata>
                  {r.entrata ? formatta(r.importo) : ''}
                </td>
                <td className={`importo py-3 pr-3 text-right text-lg font-semibold text-uscita ${filetto}`} data-uscita>
                  {r.entrata ? '' : formatta(-r.importo)}
                </td>
                <td className={`importo py-3 pr-3 text-right text-lg font-semibold ${r.saldo < 0 ? 'text-uscita' : ''} ${filetto}`} data-saldo-riga={r.saldo ?? ''}>
                  {r.saldo != null ? formatta(r.saldo) : ''}
                </td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

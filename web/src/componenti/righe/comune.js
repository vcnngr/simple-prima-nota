import { centesimiDa } from '../../util/importi.js';

// Dati di una riga dell'Estratto, uguali per le quattro viste.
export function datiRiga(m) {
  const c = centesimiDa(m.importo) ?? 0;
  return {
    id: m.id,
    giorno: m.giorno,
    chi: m.anagrafica_nome || m.descrizione,
    cosa: m.anagrafica_nome ? m.descrizione : '',
    categoria: m.categoria || m.tipologia_nome || '',
    importo: m.tipo === 'Uscita' ? -c : c,
    entrata: m.tipo === 'Entrata',
    saldo: m.saldo_progressivo == null ? null : centesimiDa(m.saldo_progressivo),
    conto: m.nome_banca || '',
    daChiarire: !!m.da_chiarire
  };
}

// Righe in ordine (data, id) decrescente -> gruppi per giorno. Il saldo di fine
// giornata e' quello della prima riga del giorno (l'ultimo movimento).
export function perGiorno(righe) {
  const gruppi = [];
  for (const r of righe) {
    const g = gruppi[gruppi.length - 1];
    if (g && g.giorno === r.giorno) g.righe.push(r);
    else gruppi.push({ giorno: r.giorno, righe: [r], saldoFine: r.saldo });
  }
  return gruppi;
}

// Riga che si apre col tocco (dettaglio, U5): anche da tastiera.
export function apribile(id, onApri) {
  if (!onApri) return {};
  return {
    role: 'button', tabIndex: 0, onClick: () => onApri(id),
    onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onApri(id); } },
    className: ' cursor-pointer'
  };
}

// CSV per gli export (U8b): virgola come separatore, ogni campo di testo tra
// virgolette, a capo e virgolette protetti, BOM per Excel. Una cella che comincia
// con = + - @ (anche dopo spazi o tab), o con tab o ritorno, diventerebbe una formula in Excel o LibreOffice:
// le si mette davanti un apostrofo. I numeri (anche negativi) restano numeri.
const NUMERO = /^-?\d+(\.\d+)?$/;

function cellaCsv(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = String(v);
  if (NUMERO.test(s)) return s;
  // Anche dopo spazi o tab iniziali (RED t_886b0088: " =1+1" passava).
  if (/^[\s]*[=+\-@]/.test(s) || /^[\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

// testoCsv(['A', 'B'], [{ A: 1, B: 'x' }]) -> '\ufeff"A","B"\r\n1,"x"\r\n'
function testoCsv(colonne, righe) {
  const linee = [colonne.map(cellaCsv).join(',')];
  for (const r of righe) linee.push(colonne.map(c => cellaCsv(r[c])).join(','));
  return '\ufeff' + linee.join('\r\n') + '\r\n';
}

module.exports = { cellaCsv, testoCsv };

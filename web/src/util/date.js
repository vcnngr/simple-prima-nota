// Date come giorni (YYYY-MM-DD) nel fuso del dispositivo: mai toISOString(),
// che dopo la mezzanotte UTC darebbe il giorno sbagliato.
const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

export function giornoDi(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const oggi = () => giornoDi(new Date());

function daGiorno(g) {
  const [a, m, d] = g.split('-').map(Number);
  return new Date(a, m - 1, d);
}

// "gio 8 ott" (anno solo se diverso da quello di riferimento).
export function breve(g, riferimento = oggi()) {
  const d = daGiorno(g);
  const anno = g.slice(0, 4) !== riferimento.slice(0, 4) ? ` ${d.getFullYear()}` : '';
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}${anno}`;
}

// Intestazione di un giorno nell'Estratto: "Oggi · gio 8 ott", "Ieri · …".
export function etichettaGiorno(g, riferimento = oggi()) {
  const r = daGiorno(riferimento);
  const ieri = giornoDi(new Date(r.getFullYear(), r.getMonth(), r.getDate() - 1));
  const b = breve(g, riferimento);
  if (g === riferimento) return `Oggi · ${b}`;
  if (g === ieri) return `Ieri · ${b}`;
  return b;
}

// Parti per la colonna del giorno del libro mastro: { giorno: 8, mese: 'ott' }.
export function partiGiorno(g) {
  const d = daGiorno(g);
  return { giorno: d.getDate(), mese: MESI[d.getMonth()], settimana: GIORNI[d.getDay()] };
}

// Periodi dei filtri (U5), come giorni { dal, al } nel fuso del dispositivo.
const MESI_LUNGHI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto',
  'settembre', 'ottobre', 'novembre', 'dicembre'];
export const nomeMese = m => MESI_LUNGHI[m];

export function periodo(nome, riferimento = oggi()) {
  const r = daGiorno(riferimento);
  const a = r.getFullYear(), m = r.getMonth();
  if (nome === 'mese') return { dal: giornoDi(new Date(a, m, 1)), al: giornoDi(new Date(a, m + 1, 0)) };
  if (nome === 'mese_scorso') return { dal: giornoDi(new Date(a, m - 1, 1)), al: giornoDi(new Date(a, m, 0)) };
  if (nome === 'anno') return { dal: `${a}-01-01`, al: `${a}-12-31` };
  return { dal: null, al: null };
}

// Etichetta di un periodo: "Ottobre", "Settembre 2025", "2026", "dal 1 ott al 5 ott".
export function etichettaPeriodo(dal, al, riferimento = oggi()) {
  if (!dal && !al) return '';
  if (dal && al) {
    const d = daGiorno(dal), f = daGiorno(al);
    const anno = d.getFullYear() !== daGiorno(riferimento).getFullYear() ? ` ${d.getFullYear()}` : '';
    if (dal === giornoDi(new Date(d.getFullYear(), d.getMonth(), 1)) && al === giornoDi(new Date(d.getFullYear(), d.getMonth() + 1, 0))) {
      return MESI_LUNGHI[d.getMonth()].replace(/^./, x => x.toUpperCase()) + anno;
    }
    if (dal.endsWith('-01-01') && al === `${dal.slice(0, 4)}-12-31`) return dal.slice(0, 4);
    if (f >= d) return `dal ${breve(dal, riferimento).slice(4)} al ${breve(al, riferimento).slice(4)}`;
  }
  return dal ? `dal ${breve(dal, riferimento).slice(4)}` : `fino al ${breve(al, riferimento).slice(4)}`;
}

// Mese YYYY-MM: "ottobre 2026"; primo e ultimo giorno.
export function meseDi(g) { return g.slice(0, 7); }
export function estremiMese(mese) {
  const [a, m] = mese.split('-').map(Number);
  return { dal: giornoDi(new Date(a, m - 1, 1)), al: giornoDi(new Date(a, m, 0)) };
}
export function etichettaMese(mese, conAnno = true) {
  const [a, m] = mese.split('-').map(Number);
  const n = MESI_LUNGHI[m - 1].replace(/^./, x => x.toUpperCase());
  return conAnno ? `${n} ${a}` : n;
}
export function mesePrima(mese, n = 1) {
  const [a, m] = mese.split('-').map(Number);
  const d = new Date(a, m - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

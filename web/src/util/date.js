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

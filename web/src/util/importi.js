// Importi in centesimi interi: niente virgola mobile sul denaro. Il server
// manda DECIMAL(15,2) come testo ("1234.50"); si riceve e si invia come testo.

// Tetto di un importo: 10 cifre intere (9.999.999.999,99), sotto DECIMAL(15,2)
// e sotto 2^53 in centesimi.
export const MASSIMO = 999999999999;

// "1234.5" | "-12.30" | 12.3 -> centesimi (intero). null se illeggibile.
export function centesimiDa(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null;
  const m = /^\s*(-)?(\d+)(?:\.(\d{1,2})\d*)?\s*$/.exec(String(v ?? ''));
  if (!m) return null;
  const c = Number(m[2]) * 100 + Number((m[3] || '0').padEnd(2, '0'));
  return m[1] ? -c : c;
}

// 123450 -> "1.234,50" (sempre due decimali, punto per le migliaia).
export function formatta(c) {
  const a = Math.abs(c);
  const intera = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${c < 0 ? '−' : ''}${intera},${String(a % 100).padStart(2, '0')}`;
}

// Con il segno davanti, come nell'Estratto: "+ 1.250,00", "− 184,37".
export function conSegno(c) {
  return `${c < 0 ? '−' : '+'} ${formatta(Math.abs(c))}`;
}

// Centesimi -> testo per l'API ("1234.50").
export function perApi(c) {
  const a = Math.abs(c);
  return `${c < 0 ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

// Testo scritto da una persona -> centesimi. "1.234,50", "1234,5", "-12",
// "1234.50" (un punto con una o due cifre dopo e' la virgola). null se illeggibile.
export function leggi(testo) {
  let t = String(testo ?? '').replace(/[\s€]/g, '').replace('−', '-');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (!/^-?\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '');
  if (!/^-?\d{1,10}(\.\d{1,2})?$/.test(t)) return null;
  return centesimiDa(t);
}

// Centesimi -> testo da modificare in un campo ("1234,50").
export function inCampo(c) {
  return `${c < 0 ? '-' : ''}${Math.floor(Math.abs(c) / 100)},${String(Math.abs(c) % 100).padStart(2, '0')}`;
}

// Importo incollato (U8a): "1.234,56", "1234,56", "1234.56", "€ 12,30",
// "12,30 EUR", "1,234.56". -> { c } in centesimi, o { errore } senza indovinare:
// "1.234" o "1,234" (mille o uno virgola due?), negativi, testo, piu' di 2 decimali.
export function daIncollare(testo) {
  const t = String(testo ?? '').replace(/[\s  ]/g, '').replace(/^(€|eur(o)?)|(€|eur(o)?)$/gi, '');
  if (/^[-−]/.test(t)) return { errore: 'Importo negativo: scegli Uscita e incolla la cifra senza segno' };
  if (!/^\d[\d.,]*$/.test(t)) return { errore: 'Non è un importo' };
  const sep = [...t].filter(x => x === '.' || x === ',');
  let intera = t, dec = '';
  if (sep.length) {
    const ultimo = Math.max(t.lastIndexOf('.'), t.lastIndexOf(','));
    const dopo = t.slice(ultimo + 1);
    const misti = new Set(sep).size > 1;
    const unico = sep.length === 1;
    if (misti || (unico && dopo.length <= 2)) {
      // L'ultimo separatore e' la virgola dei decimali; gli altri, se ci sono, le migliaia.
      if (unico && !dopo.length) return { errore: 'Non è un importo' };
      if (dopo.length > 2) return { errore: 'Più di due decimali' };
      intera = t.slice(0, ultimo); dec = dopo;
      const mil = t[ultimo] === ',' ? '.' : ',';
      if (intera.includes(t[ultimo])) return { errore: 'Non è un importo' };
      if (intera.includes(mil) && !new RegExp(`^\\d{1,3}(\\${mil}\\d{3})+$`).test(intera)) return { errore: 'Non è un importo' };
      intera = intera.split(mil).join('');
    } else if (unico) {
      return { errore: `«${t}»: non si capisce se sono migliaia o decimali. Scrivi la cifra col tastierino` };
    } else {
      // Solo separatori uguali, piu' d'uno: migliaia ("1.234.567").
      if (!/^\d{1,3}([.,]\d{3})+$/.test(t)) return { errore: 'Non è un importo' };
      intera = t.replace(/[.,]/g, '');
    }
  }
  if (intera.replace(/^0+(?=\d)/, '').length > 10) return { errore: 'Importo troppo grande' };
  const c = Number(intera) * 100 + Number((dec || '0').padEnd(2, '0'));
  if (c <= 0) return { errore: 'Inserisci un importo' };
  if (c > MASSIMO) return { errore: 'Importo troppo grande' };
  return { c };
}

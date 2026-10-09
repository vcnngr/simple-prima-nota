// Tastierino del nuovo movimento (decisione del 09/10/2026): cifre, virgola,
// cancella, e + − = per sommare gli scontrini. Stato puro, in centesimi interi.
//
//   stato = { termini: [centesimi con segno], segno: 1 | -1, voce: '12,4' }
import { MASSIMO, formatta } from './importi.js';

export const VUOTO = { termini: [], segno: 1, voce: '' };

// '12,4' -> 1240; '' -> 0.
export function centesimiVoce(voce) {
  if (!voce) return 0;
  const [i, d = ''] = voce.split(',');
  return Number(i || '0') * 100 + Number(d.padEnd(2, '0'));
}

function voceDa(c) {
  const a = Math.abs(c);
  const d = a % 100;
  return `${Math.floor(a / 100)}${d ? `,${String(d).padStart(2, '0').replace(/0$/, '')}` : ''}`;
}

export function totale(s) {
  return s.termini.reduce((a, b) => a + b, 0) + s.segno * centesimiVoce(s.voce);
}

export function premi(s, tasto) {
  if (/^\d$/.test(tasto)) {
    const [i, d] = s.voce.split(',');
    if (d !== undefined) return d.length >= 2 ? s : { ...s, voce: s.voce + tasto };
    if (i === '0') return { ...s, voce: tasto };            // niente zeri iniziali
    if (i.length >= 10) return s;                           // 10 cifre intere
    return { ...s, voce: s.voce + tasto };
  }
  if (tasto === ',') return s.voce.includes(',') ? s : { ...s, voce: (s.voce || '0') + ',' };
  if (tasto === 'canc') {
    if (s.voce) return { ...s, voce: s.voce.slice(0, -1) };
    if (!s.termini.length) return s.segno === 1 ? s : { ...s, segno: 1 };
    // Riprende l'ultimo termine per correggerlo.
    const t = s.termini[s.termini.length - 1];
    return { termini: s.termini.slice(0, -1), segno: t < 0 ? -1 : 1, voce: voceDa(t) };
  }
  if (tasto === '+' || tasto === '-') {
    const segno = tasto === '+' ? 1 : -1;
    if (!s.voce) return { ...s, segno };                    // cambia l'operazione
    return { termini: [...s.termini, s.segno * centesimiVoce(s.voce)], segno, voce: '' };
  }
  if (tasto === '=') {
    const t = totale(s);
    return { termini: [], segno: t < 0 ? -1 : 1, voce: t ? voceDa(t) : '' };
  }
  return s;
}

// Somma in corso, per l'intestazione: "12,40 + 6,50 +".
export function espressione(s) {
  if (!s.termini.length) return '';
  const parti = s.termini.map((t, n) => `${n ? (t < 0 ? '− ' : '+ ') : t < 0 ? '− ' : ''}${formatta(Math.abs(t))}`);
  return `${parti.join(' ')} ${s.segno < 0 ? '−' : '+'}`;
}

// Errore da mostrare, o null se il totale si puo' registrare.
export function problema(s) {
  const t = totale(s);
  if (t <= 0) return t < 0 ? 'Il totale deve essere positivo' : 'Inserisci un importo';
  if (t > MASSIMO) return 'Importo troppo grande';
  return null;
}

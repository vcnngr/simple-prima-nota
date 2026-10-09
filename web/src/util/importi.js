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
  return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
}

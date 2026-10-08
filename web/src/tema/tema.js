// Tema e aspetto: la fonte e' l'account (U2, GET/PUT .../preferenze); il browser
// ne tiene una copia (pn_preferenze) solo per disegnare la prima pagina giusta
// (public/tema-iniziale.js).
export const TEMI = ['registro', 'bottega'];
export const ASPETTI = ['chiaro', 'scuro', 'automatico'];
export const PREDEFINITE = { tema: 'registro', aspetto: 'automatico' };
const CHIAVE = 'pn_preferenze';

export function valide(p) {
  return !!p && TEMI.includes(p.tema) && ASPETTI.includes(p.aspetto);
}

export function copiaLocale() {
  try {
    const p = JSON.parse(localStorage.getItem(CHIAVE) || 'null');
    return valide(p) ? p : null;
  } catch {
    return null;
  }
}

export function applica(p) {
  const v = valide(p) ? p : PREDEFINITE;
  const d = document.documentElement;
  d.dataset.tema = v.tema;
  d.dataset.aspetto = v.aspetto;
  localStorage.setItem(CHIAVE, JSON.stringify({ tema: v.tema, aspetto: v.aspetto }));
  return v;
}

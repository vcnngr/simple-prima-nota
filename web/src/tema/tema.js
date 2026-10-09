// Tema, aspetto (U2) e vista dell'Estratto (U4): la fonte e' l'account
// (GET/PUT .../preferenze); il browser
// ne tiene una copia (pn_preferenze) solo per disegnare la prima pagina giusta
// (public/tema-iniziale.js).
export const TEMI = ['registro', 'bottega'];
export const ASPETTI = ['chiaro', 'scuro', 'automatico'];
export const VISTE = ['due_righe', 'colonne', 'iniziali', 'mastro'];
export const PREDEFINITE = { tema: 'registro', aspetto: 'automatico', vista_estratto: 'due_righe' };
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

// La vista manca se il server e' sotto la 014 o la copia locale e' di U3:
// allora la predefinita, senza buttare tema e aspetto.
export function applica(p) {
  const b = valide(p) ? p : PREDEFINITE;
  const v = { tema: b.tema, aspetto: b.aspetto,
    vista_estratto: VISTE.includes(b.vista_estratto) ? b.vista_estratto : PREDEFINITE.vista_estratto };
  const d = document.documentElement;
  d.dataset.tema = v.tema;
  d.dataset.aspetto = v.aspetto;
  localStorage.setItem(CHIAVE, JSON.stringify(v));
  return v;
}

// Applica tema e aspetto salvati prima del primo disegno (niente lampo del tema
// sbagliato). Copia locale: la fonte e' l'account (GET/PUT .../preferenze).
(function () {
  var t = 'registro', a = 'automatico';
  try {
    var p = JSON.parse(localStorage.getItem('pn_preferenze') || 'null');
    if (p && (p.tema === 'registro' || p.tema === 'bottega')) t = p.tema;
    if (p && (p.aspetto === 'chiaro' || p.aspetto === 'scuro' || p.aspetto === 'automatico')) a = p.aspetto;
  } catch (e) { /* copia illeggibile: predefiniti */ }
  var d = document.documentElement;
  d.dataset.tema = t;
  d.dataset.aspetto = a;
})();

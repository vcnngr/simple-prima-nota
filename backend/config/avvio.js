// config/avvio.js
// Controlli di configurazione prima di aprire la porta (blocco K5).
//
// JWT_SECRET firma e verifica tutti i token (utenti e studi). Con il valore di
// esempio di .env.example o di docker-compose.yml, chiunque abbia letto il
// repository fabbrica un token valido per qualsiasi account. In produzione il
// backend non parte con un segreto mancante, corto o di esempio; fuori
// produzione si avvisa soltanto (sviluppo e smoke usano segreti di prova).
const MINIMO = 32;

// Valori pubblicati nel repository e segnaposto ovvi.
const DI_ESEMPIO = [
  /your-super-secret/i,
  /change[-_ ]?(me|this|in[-_ ]production)/i,
  /^(secret|jwt[-_]?secret|changeme|password\d*)$/i
];

function problemaSegreto(s) {
  if (!s) return 'JWT_SECRET non impostato';
  if (DI_ESEMPIO.some(r => r.test(s))) return 'JWT_SECRET e\' un valore di esempio';
  if (s.length < MINIMO) return `JWT_SECRET troppo corto (${s.length} caratteri, minimo ${MINIMO})`;
  if (new Set(s).size < 8) return 'JWT_SECRET troppo ripetitivo';
  return null;
}

// Restituisce l'elenco dei problemi; in produzione lancia (l'avvio si ferma).
function controllaConfigurazione(env = process.env) {
  const problemi = [];
  const p = problemaSegreto(env.JWT_SECRET);
  if (p) problemi.push(`${p}. Generane uno con: openssl rand -hex 32`);
  if (problemi.length && env.NODE_ENV === 'production') {
    throw new Error(`configurazione non sicura: ${problemi.join('; ')}`);
  }
  for (const x of problemi) console.warn(`ATTENZIONE: ${x} (accettato solo perche' NODE_ENV non e' production)`);
  return problemi;
}

module.exports = { controllaConfigurazione, problemaSegreto };

// Pezzi comuni dei moduli dell'account (U6b): scheda centrata e campo con etichetta.
export function Scheda({ titolo, children, onSubmit, ...resto }) {
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form onSubmit={onSubmit} noValidate={false} className="w-full max-w-sm space-y-4 rounded-2xl border border-bordo bg-superficie p-6 shadow-sm" {...resto}>
        <h1 className="font-importi text-2xl text-secondario">{titolo}</h1>
        {children}
      </form>
    </div>
  );
}

export function Campo({ etichetta, nota, ...input }) {
  return (
    <label className="block text-sm">
      <span className="text-tenue">{etichetta}</span>
      <input {...input} className="mt-1 w-full rounded-lg border border-bordo bg-fondo px-3 py-2 text-base text-testo" />
      {nota && <span className="mt-1 block text-xs text-tenue">{nota}</span>}
    </label>
  );
}

export function Invio({ occupato, testo, testoOccupato, pericolo = false, ...resto }) {
  return (
    <button type="submit" disabled={occupato} {...resto}
      className={`w-full rounded-lg px-4 py-2.5 font-semibold disabled:opacity-60 ${pericolo ? 'bg-uscita text-white' : 'bg-principale text-su-principale'}`}>
      {occupato ? testoOccupato : testo}
    </button>
  );
}

export const Errore = ({ testo }) => (testo ? <p role="alert" className="text-sm text-uscita">{testo}</p> : null);
export const Esito = ({ testo }) => (testo ? <p role="status" data-esito className="rounded-lg bg-entrata/10 p-3 text-sm text-entrata">{testo}</p> : null);

// Messaggio del server se e' un rifiuto scritto da noi (4xx), generico altrimenti.
export const messaggio = (e, generico) => (e?.stato >= 400 && e?.stato < 500 && e.message ? e.message : generico);

// La nuova password: le stesse regole del server (8 caratteri, al massimo 72 byte).
export function problemaPassword(p, conferma) {
  if (p.length < 8) return 'La password deve avere almeno 8 caratteri';
  if (new TextEncoder().encode(p).length > 72) return 'La password è troppo lunga';
  if (conferma !== undefined && p !== conferma) return 'Le due password non coincidono';
  return null;
}

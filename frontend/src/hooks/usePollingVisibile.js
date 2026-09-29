import { useEffect, useRef } from 'react';

// Esegue `fn` subito e poi ogni `ms`, ma SOLO con la scheda visibile.
//
// Prima ogni componente aveva il suo setInterval, attivo anche con la scheda in
// secondo piano: una scheda dimenticata aperta interrogava il server tutto il
// giorno (~150 richieste ogni 15 minuti tra sidebar e chat). Le notifiche email
// (W4) coprono cio' che succede quando l'app non e' davanti agli occhi; qui si
// interroga solo quando qualcuno guarda. Al ritorno sulla scheda si aggiorna
// subito, senza aspettare il giro successivo.
export default function usePollingVisibile(fn, ms, deps = []) {
  const ultimaFn = useRef(fn);
  ultimaFn.current = fn;

  useEffect(() => {
    let timer = null;
    const esegui = () => ultimaFn.current();
    const avvia = () => {
      if (timer === null) timer = setInterval(esegui, ms);
    };
    const ferma = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const alCambioVisibilita = () => {
      if (document.hidden) {
        ferma();
      } else {
        esegui();
        avvia();
      }
    };

    esegui();
    if (!document.hidden) avvia();
    document.addEventListener('visibilitychange', alCambioVisibilita);

    return () => {
      ferma();
      document.removeEventListener('visibilitychange', alCambioVisibilita);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps]);
}

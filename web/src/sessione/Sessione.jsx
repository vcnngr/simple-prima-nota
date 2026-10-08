import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CHIAVI, ErroreApi, eventi, tipoSessione } from '../api/client';
import { accountApi } from '../api/account';
import { applica, copiaLocale, PREDEFINITE } from '../tema/tema';

const Contesto = createContext(null);

function pulisci() {
  for (const k of Object.values(CHIAVI)) {
    localStorage.removeItem(k.token);
    localStorage.removeItem(k.account);
  }
  localStorage.removeItem('user_type');
}

// Il profilo dell'utente e' l'account stesso; quello dello studio sta in
// `commercialista`. Le preferenze arrivano accanto (null se il server non le
// legge: allora la copia locale, poi i predefiniti).
function daProfilo(tipo, r) {
  if (tipo === 'commercialista') return { account: r.commercialista, preferenze: r.preferenze };
  const { preferenze, ...account } = r;
  return { account, preferenze };
}

export function SessioneProvider({ children }) {
  const qc = useQueryClient();
  const [stato, setStato] = useState({ fase: 'caricamento', tipo: null, account: null, preferenze: null });

  const esci = useCallback(() => {
    pulisci();
    qc.clear();
    setStato({ fase: 'anonimo', tipo: null, account: null, preferenze: null });
  }, [qc]);

  // Avvio: chi ha un token ritrova account e preferenze dal server.
  const carica = useCallback(async () => {
    const tipo = tipoSessione();
    if (!tipo) {
      applica(copiaLocale());
      setStato({ fase: 'anonimo', tipo: null, account: null, preferenze: null });
      return;
    }
    setStato(s => ({ ...s, fase: 'caricamento' }));
    try {
      const { account, preferenze } = daProfilo(tipo, await accountApi.profilo(tipo));
      const p = applica(preferenze || copiaLocale() || PREDEFINITE);
      setStato({ fase: 'attiva', tipo, account, preferenze: p });
    } catch (e) {
      if (e instanceof ErroreApi && e.stato === 401) esci();
      else setStato({ fase: 'errore', tipo, account: null, preferenze: null });
    }
  }, [esci]);

  useEffect(() => { carica(); }, [carica]);

  useEffect(() => {
    const scaduta = () => esci();
    eventi.addEventListener('scaduta', scaduta);
    return () => eventi.removeEventListener('scaduta', scaduta);
  }, [esci]);

  const accedi = useCallback(async (tipo, username, password) => {
    const r = await accountApi.login(tipo, username, password);
    pulisci(); // una sola sessione alla volta: il token dell'altro tipo se ne va
    localStorage.setItem(CHIAVI[tipo].token, r.token);
    localStorage.setItem(CHIAVI[tipo].account, JSON.stringify(tipo === 'user' ? r.user : r.commercialista));
    localStorage.setItem('user_type', tipo);
    qc.clear();
    const p = applica(r.preferenze || copiaLocale() || PREDEFINITE);
    setStato({ fase: 'attiva', tipo, account: tipo === 'user' ? r.user : r.commercialista, preferenze: p });
  }, [qc]);

  // Si applica subito, si salva sull'account; se il server rifiuta si torna indietro.
  const cambiaPreferenze = useCallback(async (modifiche) => {
    const prima = stato.preferenze;
    const dopo = applica({ ...prima, ...modifiche });
    setStato(s => ({ ...s, preferenze: dopo }));
    try {
      const salvate = applica(await accountApi.salvaPreferenze(stato.tipo, modifiche));
      setStato(s => ({ ...s, preferenze: salvate }));
    } catch (e) {
      applica(prima);
      setStato(s => ({ ...s, preferenze: prima }));
      throw e;
    }
  }, [stato.preferenze, stato.tipo]);

  const valore = useMemo(() => ({ ...stato, accedi, esci, ricarica: carica, cambiaPreferenze }),
    [stato, accedi, esci, carica, cambiaPreferenze]);
  return <Contesto.Provider value={valore}>{children}</Contesto.Provider>;
}

export function useSessione() {
  const c = useContext(Contesto);
  if (!c) throw new Error('useSessione fuori da SessioneProvider');
  return c;
}

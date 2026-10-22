import { chiama } from './client';

// Conti, controparti, movimenti e report dell'utente (U4, U5).
export const registroApi = {
  conti: () => chiama('/conti-bancari/attivi'),
  // Ricerca sul server con tetto (U1): piu' usate prima, prefisso prima.
  cerca: (q, { tipo, segnale } = {}) =>
    chiama('/anagrafiche/cerca', { params: { q, tipo, limit: 20, solo_attive: true }, segnale }),
  // Pagina di movimenti a cursore (U1). Con il conto arriva il saldo progressivo.
  movimenti: ({ conto, dopo, limite = 30, filtri = {} }) =>
    chiama('/movimenti', { params: { ...filtri, conto_id: conto ?? filtri.conto_id, dopo, limit: limite, order_by: 'data', order_direction: 'DESC' } }),
  movimento: id => chiama(`/movimenti/${id}`),
  registra: movimento => chiama('/movimenti', { metodo: 'POST', corpo: movimento }),
  modifica: (id, movimento) => chiama(`/movimenti/${id}`, { metodo: 'PUT', corpo: movimento }),
  elimina: id => chiama(`/movimenti/${id}`, { metodo: 'DELETE' }),

  // Controparti: pagine con aggregati (U1) e scheda.
  elenco: ({ q, ordina, offset = 0, limite = 30 }) =>
    chiama('/anagrafiche/elenco', { params: { q, ordina, offset, limit: limite } }),
  controparte: id => chiama(`/anagrafiche/${id}`),
  creaControparte: a => chiama('/anagrafiche', { metodo: 'POST', corpo: a }),
  modificaControparte: (id, a) => chiama(`/anagrafiche/${id}`, { metodo: 'PUT', corpo: a }),
  eliminaControparte: id => chiama(`/anagrafiche/${id}`, { metodo: 'DELETE' }),

  // Conti (U6a): tutti, anche disattivati, con saldo e numero di movimenti.
  tuttiConti: () => chiama('/conti-bancari'),
  conto: id => chiama(`/conti-bancari/${id}`),
  creaConto: c => chiama('/conti-bancari', { metodo: 'POST', corpo: c }),
  modificaConto: (id, c) => chiama(`/conti-bancari/${id}`, { metodo: 'PUT', corpo: c }),
  eliminaConto: id => chiama(`/conti-bancari/${id}`, { metodo: 'DELETE' }),

  // Report a flusso (U5): mese per mese e dettaglio di un mese (YYYY-MM).
  mesi: ({ fino, mesi = 12, conto, controparte }) =>
    chiama('/reports/mesi', { params: { fino, mesi, conto_id: conto, anagrafica_id: controparte } }),
  mese: ({ mese, conto }) => chiama('/reports/mese', { params: { mese, conto_id: conto } })
};

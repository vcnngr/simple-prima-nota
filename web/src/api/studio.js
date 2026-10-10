import { chiama } from './client';

// Lo studio visto dall'utente (U5): collegamento, chat di lavoro (W5), richieste
// di chiarimento. La chat vive sul collegamento attivo piu' recente.
export const studioApi = {
  collegamenti: () => chiama('/utenti/collegamenti'),
  messaggi: () => chiama('/messaggi', { params: { limit: 100 } }),
  invia: ({ messaggio, movimento }) =>
    chiama('/messaggi', { metodo: 'POST', corpo: { messaggio, movimento_id: movimento ?? null } }),
  letti: () => chiama('/messaggi/leggi-tutti', { metodo: 'PUT' }),
  chiarimenti: () => chiama('/messaggi/chiarimenti', { params: { stato: 'aperta' } }),
  risolvi: id => chiama(`/messaggi/${id}/chiarimento`, { metodo: 'PUT', corpo: { stato: 'risolta' } })
};

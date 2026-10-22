import { chiama } from './client';

// Lo studio visto dall'utente (U5, U6a): collegamento e ambito, chat di lavoro
// (W5), richieste di chiarimento, documenti. La chat vive sul collegamento
// attivo piu' recente.
const C = id => `/utenti/collegamenti/${id}`;
export const studioApi = {
  collegamenti: () => chiama('/utenti/collegamenti'),
  accetta: (id, ambito) => chiama(`${C(id)}/accetta`, { metodo: 'PUT', corpo: ambito }),
  rifiuta: id => chiama(`${C(id)}/rifiuta`, { metodo: 'PUT', corpo: {} }),
  ambito: (id, ambito) => chiama(`${C(id)}/ambito`, { metodo: 'PUT', corpo: ambito }),
  sospendi: id => chiama(`${C(id)}/sospendi`, { metodo: 'PUT', corpo: {} }),
  riattiva: id => chiama(`${C(id)}/riattiva`, { metodo: 'PUT' }),
  revoca: id => chiama(C(id), { metodo: 'DELETE', corpo: {} }),
  accessi: id => chiama(`${C(id)}/accessi`, { params: { limit: 20 } }),

  messaggi: () => chiama('/messaggi', { params: { limit: 100 } }),
  invia: ({ messaggio, movimento }) =>
    chiama('/messaggi', { metodo: 'POST', corpo: { messaggio, movimento_id: movimento ?? null } }),
  allega: ({ file, messaggio }) => {
    const f = new FormData();
    if (messaggio) f.append('messaggio', messaggio);
    f.append('file', file);
    return chiama('/messaggi/allegati', { metodo: 'POST', corpo: f });
  },
  scarica: id => chiama(`/messaggi/allegati/${id}`, { comeFile: true }),
  documenti: () => chiama('/messaggi/documenti'),
  letti: () => chiama('/messaggi/leggi-tutti', { metodo: 'PUT' }),
  chiarimenti: () => chiama('/messaggi/chiarimenti', { params: { stato: 'aperta' } }),
  risolvi: id => chiama(`/messaggi/${id}/chiarimento`, { metodo: 'PUT', corpo: { stato: 'risolta' } })
};

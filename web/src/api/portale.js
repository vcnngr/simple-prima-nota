import { chiama } from './client';

// Il portale dello studio (U6c): da fare, clienti, scheda del cliente, movimenti
// in sola lettura, export, chat di ogni cliente. Ogni lettura dei dati di un
// cliente e' un accesso registrato dal server (dettaglio_cliente, export, chat).
const CL = id => `/commercialisti/clienti/${id}`;
const conCliente = id => ({ userId: id });

export const portaleApi = {
  daFare: () => chiama('/commercialisti/da-fare'),
  clienti: () => chiama('/commercialisti/dashboard'),
  richieste: () => chiama('/commercialisti/richieste'),
  chiedi: identificativo => chiama('/commercialisti/richieste', { metodo: 'POST', corpo: { identificativo_cliente: identificativo } }),

  riepilogo: (id, mese) => chiama(`${CL(id)}/riepilogo`, { params: { mese } }),
  movimenti: (id, pagina = 1, limite = 50) => chiama(CL(id), { params: { page: pagina, limit: limite } }),
  accessi: id => chiama(`${CL(id)}/accessi`),
  esporta: (id, { formato, dal, al }) => chiama(`${CL(id)}/export`, {
    metodo: 'POST', comeFile: true,
    corpo: { export_type: 'commercialista', formato, data_inizio: dal, data_fine: al, ordina_per: 'data', ordine: 'asc' }
  }),

  messaggi: id => chiama('/messaggi', { params: { ...conCliente(id), limit: 100 } }),
  invia: (id, { messaggio, movimento = null, chiarimento = false }) =>
    chiama('/messaggi', { metodo: 'POST', params: conCliente(id), corpo: { messaggio, movimento_id: movimento, chiarimento } }),
  allega: (id, { file, messaggio }) => {
    const f = new FormData();
    if (messaggio) f.append('messaggio', messaggio);
    f.append('file', file);
    return chiama('/messaggi/allegati', { metodo: 'POST', params: conCliente(id), corpo: f });
  },
  scarica: (id, allegato) => chiama(`/messaggi/allegati/${allegato}`, { params: conCliente(id), comeFile: true }),
  documenti: id => chiama('/messaggi/documenti', { params: conCliente(id) }),
  letti: id => chiama('/messaggi/leggi-tutti', { metodo: 'PUT', params: conCliente(id) }),
  chiarimenti: id => chiama('/messaggi/chiarimenti', { params: { ...conCliente(id), stato: 'aperta' } }),
  risolvi: (id, msg) => chiama(`/messaggi/${msg}/chiarimento`, { metodo: 'PUT', params: conCliente(id), corpo: { stato: 'risolta' } })
};

import { chiama } from './client';

// Percorsi per tipo di account: stessa forma, tabelle diverse sul server.
const P = { user: '/auth', commercialista: '/commercialisti' };

export const accountApi = {
  login: (tipo, username, password) =>
    chiama(`${P[tipo]}/login`, { metodo: 'POST', corpo: { username, password }, anonimo: true }),
  profilo: (tipo) => chiama(`${P[tipo]}/profile`),
  preferenze: (tipo) => chiama(`${P[tipo]}/preferenze`),
  salvaPreferenze: (tipo, modifiche) => chiama(`${P[tipo]}/preferenze`, { metodo: 'PUT', corpo: modifiche })
};

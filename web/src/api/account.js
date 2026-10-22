import { chiama } from './client';

// Percorsi per tipo di account: stessa forma, tabelle diverse sul server.
const P = { user: '/auth', commercialista: '/commercialisti' };

export const accountApi = {
  login: (tipo, username, password) =>
    chiama(`${P[tipo]}/login`, { metodo: 'POST', corpo: { username, password }, anonimo: true }),
  registra: (tipo, dati) => chiama(`${P[tipo]}/register`, { metodo: 'POST', corpo: dati, anonimo: true }),
  profilo: (tipo) => chiama(`${P[tipo]}/profile`),
  preferenze: (tipo) => chiama(`${P[tipo]}/preferenze`),
  salvaPreferenze: (tipo, modifiche) => chiama(`${P[tipo]}/preferenze`, { metodo: 'PUT', corpo: modifiche }),

  // Account (W6): reset, conferma, password, email, eliminazione.
  dimenticata: (tipo, identificativo) =>
    chiama(`${P[tipo]}/password-dimenticata`, { metodo: 'POST', corpo: { identificativo }, anonimo: true }),
  reimposta: (tipo, token, password) =>
    chiama(`${P[tipo]}/password-reimposta`, { metodo: 'POST', corpo: { token, password }, anonimo: true }),
  confermaEmail: (tipo, token) =>
    chiama(`${P[tipo]}/email/conferma`, { metodo: 'POST', corpo: { token }, anonimo: true }),
  // Lo studio cambia la password con PUT /password, l'utente con POST /change-password.
  cambiaPassword: (tipo, currentPassword, newPassword) => tipo === 'commercialista'
    ? chiama('/commercialisti/password', { metodo: 'PUT', corpo: { currentPassword, newPassword } })
    : chiama('/auth/change-password', { metodo: 'POST', corpo: { currentPassword, newPassword } }),
  cambiaEmail: (tipo, password, email) => chiama(`${P[tipo]}/email`, { metodo: 'POST', corpo: { password, email } }),
  elimina: (tipo, password) => chiama(`${P[tipo]}/account`, { metodo: 'DELETE', corpo: { password } }),
  profiloStudio: dati => chiama('/commercialisti/profile', { metodo: 'PUT', corpo: dati }),

  // Inviti per lo studio (W2): il token in chiaro si vede una volta sola.
  inviti: () => chiama('/utenti/token-inviti'),
  generaInvito: giorni => chiama('/utenti/genera-token-invito', { metodo: 'POST', corpo: { giorni_validita: giorni } }),
  revocaInvito: id => chiama(`/utenti/token-inviti/${id}`, { metodo: 'DELETE' })
};

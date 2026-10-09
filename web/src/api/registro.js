import { chiama } from './client';

// Conti, controparti e movimenti dell'utente (U4).
export const registroApi = {
  conti: () => chiama('/conti-bancari/attivi'),
  // Ricerca sul server con tetto (U1): piu' usate prima, prefisso prima.
  cerca: (q, { tipo, segnale } = {}) =>
    chiama('/anagrafiche/cerca', { params: { q, tipo, limit: 20, solo_attive: true }, segnale }),
  // Pagina dell'Estratto: cursore `dopo` (U1), saldo progressivo col conto.
  movimenti: ({ conto, dopo, limite = 30 }) =>
    chiama('/movimenti', { params: { conto_id: conto, dopo, limit: limite, order_by: 'data', order_direction: 'DESC' } }),
  registra: (movimento) => chiama('/movimenti', { metodo: 'POST', corpo: movimento })
};

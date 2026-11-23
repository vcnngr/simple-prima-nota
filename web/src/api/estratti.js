import { chiama } from './client';

// Estratti conto della banca (U9a): anteprima, importazione, elenco.
function modulo({ file, conto, mappa }) {
  const f = new FormData();
  f.append('conto_id', String(conto));
  if (mappa) f.append('mappa', JSON.stringify(mappa));
  f.append('file', file);
  return f;
}

export const estrattiApi = {
  anteprima: x => chiama('/estratti/anteprima', { metodo: 'POST', corpo: modulo(x) }),
  importa: x => chiama('/estratti', { metodo: 'POST', corpo: modulo(x) }),
  elenco: conto => chiama('/estratti', { params: { conto_id: conto } })
};

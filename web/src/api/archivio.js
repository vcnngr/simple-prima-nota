import { chiama } from './client';

// Categorie, tipologie, import ed export dell'utente (U6b).
const CATEGORIE = { movimenti: '/categorie-movimenti', controparti: '/categorie-anagrafiche', tipologie: '/anagrafiche/tipologie' };

export const archivioApi = {
  elenco: genere => chiama(CATEGORIE[genere]),
  crea: (genere, c) => chiama(CATEGORIE[genere], { metodo: 'POST', corpo: c }),
  modifica: (genere, id, c) => chiama(`${CATEGORIE[genere]}/${id}`, { metodo: 'PUT', corpo: c }),
  elimina: (genere, id) => chiama(`${CATEGORIE[genere]}/${id}`, { metodo: 'DELETE' }),

  // Import CSV: prima l'anteprima (stesso lavoro, poi annullato), poi l'import.
  importa: (csvData, anteprima) => chiama('/movimenti/import', { metodo: 'POST', corpo: { csvData }, params: { anteprima: anteprima ? 1 : undefined } }),
  modello: () => chiama('/movimenti/template', { comeFile: true }),
  esporta: config => chiama('/export/generate', { metodo: 'POST', corpo: config, comeFile: true }),
  copia: () => chiama('/auth/backup/export', { comeFile: true }),
  ripristina: (backupData, mode) => chiama('/auth/backup/import', { metodo: 'POST', corpo: { backupData, mode } })
};

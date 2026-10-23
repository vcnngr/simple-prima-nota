// Parte nel browser dello smoke U6b-2 (scripts/smoke/u6b-archivio.sh): Categorie
// (tre schede, nuova, rinomina con avviso, eliminazione bloccata se in uso) e
// Import ed export (anteprima, conferma, export, copia, ripristino rifiutato).
// Ambiente: WEB, CHROME, PROFILO, FOTO, UTENTE, PW, CSV, COPIA.
import { avvia } from './cdp.mjs';

const E = process.env;
let pass = 0, fail = 0;
const eq = (nome, atteso, ottenuto) => {
  if (String(atteso) === String(ottenuto)) { pass++; console.log(`  OK    ${nome}`); }
  else { fail++; console.log(`  FAIL  ${nome}\n         atteso=${atteso} ottenuto=${ottenuto}`); }
};

const b = await avvia({ chrome: E.CHROME, profilo: E.PROFILO });
try {
  const p = await b.pagina();
  await p.schermo(390, 844);
  await p.schemaColori(false);
  // I download restano nella cartella del profilo: interessa che partano.
  await p.invia('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: `${E.PROFILO}/download`, eventsEnabled: true }).catch(() => {});
  const larghezza = () => p.valuta('document.documentElement.scrollWidth');
  const n = sel => p.valuta(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
  const attr = (sel, a) => p.valuta(`document.querySelector(${JSON.stringify(sel)})?.getAttribute(${JSON.stringify(a)}) ?? null`);
  const testo = sel => p.valuta(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
  const foto = async nome => {
    for (const [t, a] of [['registro', 'chiaro'], ['bottega', 'scuro']]) {
      await p.valuta(`(document.documentElement.dataset.tema='${t}', document.documentElement.dataset.aspetto='${a}', true)`);
      await p.foto(`${E.FOTO}/${nome}-${t}-${a}.png`);
    }
    await p.valuta("(document.documentElement.dataset.tema='registro', document.documentElement.dataset.aspetto='chiaro', true)");
  };
  const stretto = async nome => eq(`${nome}: 390 px senza scroll orizzontale`, 390, await larghezza());
  const file = async (sel, percorso) => {
    const o = await p.invia('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(sel)})` });
    await p.invia('DOM.setFileInputFiles', { files: [percorso], objectId: o.result.objectId });
  };
  const voce = nome => p.valuta(`[...document.querySelectorAll('[data-categoria]')].find(e => e.textContent.includes(${JSON.stringify(nome)}))?.dataset.categoria ?? null`);

  await p.vai(E.WEB + '/accedi');
  await p.aspetta("document.querySelector('input[name=username]')");
  await p.scrivi('input[name=username]', E.UTENTE);
  await p.scrivi('input[name=password]', E.PW);
  await p.clic('button[type=submit]');
  await p.aspetta("document.querySelector('[data-estratto]')");

  console.log('=== D1. Categorie ===');
  await p.vai(E.WEB + '/impostazioni');
  await p.aspetta("document.querySelector('a[href=\"/archivio\"]')");
  eq('Impostazioni: Categorie e Import ed export', '1|1', `${await n('a[href="/categorie"]')}|${await n('a[href="/archivio"]')}`);
  await p.clic('a[href="/categorie"]');
  eq('Categorie dei movimenti: Software con 1 movimento', 'true',
    await p.aspetta("[...document.querySelectorAll('[data-categoria]')].some(e => e.textContent.includes('Software') && e.textContent.includes('1 movimento'))"));
  await stretto('Categorie');
  await foto('categorie');
  const sw = await voce('Software');
  await p.clic(`[data-categoria="${sw}"]`);
  await p.aspetta(`document.querySelector('[data-scheda-categoria="${sw}"]')`);
  eq('in uso: «Elimina» spento', 'true', String(await p.valuta("document.querySelector('[data-elimina-categoria]').disabled")));
  await p.scrivi('[data-scheda-categoria] input[name=nome]', 'Software e web');
  eq('rinomina: avviso «passa anche a 1 movimento»', 'true', await p.aspetta("document.querySelector('[data-avviso-rinomina]')?.textContent.includes('1 movimento')"));
  await foto('categoria-rinomina');
  await p.clic('[data-salva-categoria]');
  eq('salvata: la lista mostra il nuovo nome', 'true', await p.aspetta("!document.querySelector('dialog[open]') && [...document.querySelectorAll('[data-categoria]')].some(e => e.textContent.includes('Software e web'))"));
  await p.clic('[data-nuova-categoria]');
  await p.aspetta("document.querySelector('[data-scheda-categoria=nuova]')");
  await p.scrivi('[data-scheda-categoria] input[name=nome]', 'Assicurazioni');
  await p.clic('[data-tipo-categoria="Uscita"]');
  await p.clic('[data-salva-categoria]');
  eq('nuova categoria: Assicurazioni in lista', 'true', await p.aspetta("[...document.querySelectorAll('[data-categoria]')].some(e => e.textContent.includes('Assicurazioni'))"));
  await p.clic('[data-nuova-categoria]');
  await p.aspetta("document.querySelector('[data-scheda-categoria=nuova]')");
  await p.scrivi('[data-scheda-categoria] input[name=nome]', 'Vendite');
  await p.clic('[data-salva-categoria]');
  eq('nome doppio: messaggio, la finestra resta', 'true', await p.aspetta("document.querySelector('dialog[open] [role=alert]')?.textContent.includes('esistente')"));
  await p.valuta("(document.querySelector('dialog[open]').close(), true)");
  await p.clic('[data-genere=controparti]');
  eq('scheda Controparti: Fornitori abituali, 2 controparti, disattivata', 'true',
    await p.aspetta("[...document.querySelectorAll('[data-categoria]')].some(e => e.textContent.includes('Fornitori abituali') && e.textContent.includes('2 controparti') && e.textContent.includes('disattivata'))"));
  await p.clic('[data-genere=tipologie]');
  eq('scheda Tipologie: Cliente, Fornitore, Socio', 'true',
    await p.aspetta("['Cliente','Fornitore','Socio'].every(t => [...document.querySelectorAll('[data-categoria]')].some(e => e.textContent.includes(t)))"));
  await stretto('Tipologie');

  console.log('=== D2. Import ed export ===');
  await p.vai(E.WEB + '/archivio');
  await p.aspetta("document.querySelector('[data-file-import]')");
  await file('[data-file-import]', E.CSV);
  eq('anteprima: 2 movimenti, 1 riga saltata', 'anteprima|2|1',
    (await p.aspetta("document.querySelector('[data-esito-import=anteprima]')"))
    && `${await attr('[data-esito-import]', 'data-esito-import')}|${await attr('[data-esito-import]', 'data-importati')}|${await attr('[data-righe-scartate]', 'data-righe-scartate')}`);
  eq('anteprima: totali 2.000,00 e 850,00', '2000.00|850.00|+ 2.000,00 €|− 850,00 €',
    `${await attr('[data-totale-entrate]', 'data-totale-entrate')}|${await attr('[data-totale-uscite]', 'data-totale-uscite')}|${await testo('[data-totale-entrate]')}|${await testo('[data-totale-uscite]')}`);
  eq('anteprima: il motivo della riga saltata', 'true', String((await testo('[data-righe-scartate]')).includes('Data non valida')));
  eq('singolare: «1 riga verrà saltata»', 'true', String((await testo('[data-righe-scartate]')).startsWith('1 riga verrà saltata:')));
  eq('il bottone dice quanti', 'Importa 2 movimenti', await testo('[data-conferma-import]'));
  await stretto('Import');
  await foto('import-anteprima');
  await p.clic('[data-conferma-import]');
  eq('importati 2', 'fatto|2', (await p.aspetta("document.querySelector('[data-esito-import=fatto]')"))
    && `${await attr('[data-esito-import]', 'data-esito-import')}|${await attr('[data-esito-import]', 'data-importati')}`);
  await p.clic('[data-formato=csv]');
  await p.clic('[data-scarica-export]');
  eq('export: nessun errore', 'true', await p.aspetta("document.querySelector('[data-scarica-export]')?.textContent === 'Scarica' && !document.querySelector('[data-esporta] [role=alert]')"));
  await p.scrivi('[data-esporta] input[name=al]', '2025-01-01');
  eq('export: fine prima dell\'inizio, bottone spento', 'true|true',
    `${await p.aspetta("document.querySelector('[data-esporta] [role=alert]')")}|${await p.valuta("document.querySelector('[data-scarica-export]').disabled")}`);
  await file('[data-file-copia]', E.COPIA);
  eq('copia letta: 3 movimenti', 'true', await p.aspetta("document.querySelector('[data-copia-letta]')?.textContent.includes('3 movimenti')"));
  await p.clic('[data-modo=replace]');
  eq('sostituisci: avviso in rosso', 'true', await p.aspetta("document.querySelector('[data-avviso-sostituisci]')"));
  await foto('copia-sostituisci');
  await p.clic('[data-modo=merge]');
  await p.clic('[data-conferma-ripristino]');
  eq('aggiunta con nomi gia\' presenti: rifiutata, «nessun dato cambiato»', 'true',
    await p.aspetta("document.querySelector('[data-ripristino-ko]')?.textContent.includes('nessun dato')", 15000));
  await stretto('Archivio');
  await foto('archivio');
  eq('zero violazioni CSP', 0, p.violazioni.length);
  if (p.violazioni.length) console.log(p.violazioni.slice(0, 5));
} catch (e) {
  fail++; console.log(`  FAIL  eccezione nel browser\n         ${e.message}`);
} finally {
  b.chiudi();
  console.log(`CONTEGGIO ${pass} ${fail}`);
}

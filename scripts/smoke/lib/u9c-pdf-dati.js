// Dati della prova U9c: due PDF inventati con l'impaginazione dei due formati
// visti (estratto trimestrale Fineco, lista movimenti Banco BPM), scritti con
// pdfkit in carattere a spaziatura fissa: pdftotext -layout ne ritrova le colonne.
// Nessun dato reale. Uso: node u9c-pdf-dati.js <cartella>  -> fineco.pdf, bpm.pdf, scansione.pdf, lungo.pdf
const path = require('path');
const fs = require('fs');
const PDFDocument = require(path.join(__dirname, '../../../backend/node_modules/pdfkit'));
const dir = process.argv[2];

function pdf(nome, pagine, testo = true) {
  return new Promise(ok => {
    const d = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 20 });
    const out = fs.createWriteStream(path.join(dir, nome));
    d.pipe(out);
    pagine.forEach((righe, i) => {
      if (i) d.addPage();
      if (!testo) { d.rect(40, 40, 300, 200).fill('#888'); return; }
      d.font('Courier').fontSize(8);
      righe.forEach((r, k) => d.text(r, 20, 20 + k * 11, { lineBreak: false }));
    });
    d.end(); out.on('finish', ok);
  });
}

const FINECO = [[
  '                                                     Estratto conto',
  'Conto corrente in euro',
  'VALUTA          SALDO INIZIALE EURO          SALDO FINALE EURO          DISPONIBILE EURO',
  'EUR             -1.250,40                    189,40                     +620,00',
  'Movimenti                                                                                   Saldo Cont',
  'DATA          DATA            USCITE                    ENTRATE              DESCRIZIONE OPERAZIONE',
  'OPERAZIONE    VALUTA',
  '                                 -1.250,40                                   Saldo iniziale in euro',
  '  02.01.26      02.01.26              45,30                                   Addebito SDD Enel Energia',
  '                                                                              bolletta dicembre',
  '  10.01.26      10.01.26                                 1.500,00             Bonifico da Bianchi srl',
  // U9c, PDF vero: una data in testa alla riga che continua la descrizione.
  '                                                                              05/01/2026 Fattura 12',
  '  15.01.26      15.01.26               1,20                                   Pagamento POS bar Centrale',
  '  15.01.26      15.01.26               1,20                                   Pagamento POS bar Centrale',
  'Pagina 1 di 2'
], [
  'DATA          DATA            USCITE                    ENTRATE              DESCRIZIONE OPERAZIONE',
  'OPERAZIONE    VALUTA',
  // U9c, PDF vero: su un'altra pagina il testo rientra di 7 colonne rispetto all'intestazione.
  '  31.03.26      31.03.26              12,50                            Imposta di bollo 3,00',
  '                                                                       31/03/2026 trimestre',
  '                                    189,40                                   Saldo finale in euro',
  '',
  // U9c, PDF vero: dopo il saldo finale le carte di credito (gia' addebitate sul conto).
  'Carte di credito e ricaricabili',
  '      DATA            DATA                         DESCRIZIONE                                IMPORTO',
  '   OPERAZIONE     REGISTRAZIONE                    OPERAZIONE                                 IN EURO',
  '   30.03.26        31.03.26       Abbonamento streaming                                          9,99',
  'Riepilogo competenze',
  '  31.03.26      Interessi creditori                       0,00',
  'Pagina 2 di 2'
]];

const BPM = [[
  'Saldo e movimenti C/C - On line',
  '  Intestazione:       ROSSI MARIO                                        Rapporto:            01234 - 000000123456',
  '  Banca:              05034 - Banco BPM S.P.A.                           IBAN:                IT00X0503400000000000123456',
  '  Saldo disponibile: 2.345,67 EUR                                        Saldo contabile:     2.345,67 EUR',
  'Movimenti di periodo',
  '  Periodo:             - Data da: 01/03/2026 - Data a: 27/03/2026',
  '    Data              Data',
  '                                            Importo        Divisa   Causale                        Descrizione',
  '  contabile          valuta',
  '  02/03/2026     02/03/2026                         -23,40 EUR        043     Pagamento POS - Carta*1234-12:30-FARMACIA CENTRALE',
  '                                                                              ITA',
  '  05/03/2026     05/03/2026                       1.800,00 EUR        048     Accr. vs. favore - bon.da ROSSI SRL ft 3 del 01/03/2026',
  '  10/03/2026     10/03/2026                        -150,00 EUR        50C     Addebito diretto SDD - sdd core: 1234567 TIM SPA',
  '                                                                              fattura marzo',
  'Stampato il 27/03/2026 alle ore 10.38.02                                                                 Pagina 1 di 2'
], [
  '    Data            Data',
  '                                          Importo       Divisa   Causale                         Descrizione',
  '  contabile        valuta',
  '  20/03/2026     20/03/2026                         -2,50 EUR      066     Comm. su bonifico - ns rif. 123        Spese e comm.',
  '  27/03/2026     27/03/2026                      -1.000,00 EUR     208     Prelievo Bancomat - ATM 0001'
]];

(async () => {
  fs.mkdirSync(dir, { recursive: true });
  await pdf('fineco.pdf', FINECO);
  await pdf('bpm.pdf', BPM);
  await pdf('scansione.pdf', [[]], false);
  // 61 pagine (tetto 60): si rifiuta, non si importano in silenzio le prime 60.
  await pdf('lungo.pdf', [BPM[0], ...Array(60).fill(BPM[1])]);
  console.log('ok');
})();

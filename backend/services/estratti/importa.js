// services/estratti/importa.js
// Dall'estratto letto (leggi.js) al Registro (blocco U9a).
//
//   prepara(buffer, nomeFile, mappaUtente, cercaModello) -> estratto letto:
//     { formato, movimenti (con impronta), scartate, mappa, firma, intestazione,
//       anteprimaRighe, saldo_iniziale, saldo_finale, dal, al, modello }
//     Se le colonne non si riconoscono e il cliente non ha dato una mappa:
//     ErroreEstratto con .serveMappa e .righe (le prime righe del file, per
//     abbinare le colonne a mano).
//   confronta(client, userId, contoId, movimenti) -> stesso ordine, con .esito:
//     'gia'      la riga della banca e' gia' stata importata (stessa impronta);
//     'abbinata' c'e' gia' nel Registro un movimento dello stesso conto, tipo e
//                importo, a non piu' di 3 giorni, non ancora legato a una riga
//                della banca (il piu' vicino per data, poi il piu' vecchio);
//     'nuova'    diventa un movimento «da descrivere».
//   saldoRegistro(client, userId, contoId, al) -> centesimi al giorno `al`.
const L = require('./leggi');
const P = require('./pdf');

const TOLLERANZA_GIORNI = 3;
const RIGHE_PER_MAPPA = 25;

function errore(msg, extra = {}) {
  return Object.assign(new L.ErroreEstratto(msg), extra);
}

async function prepara(buf, nomeFile, mappaUtente, cercaModello) {
  const camt = /\.xml$/i.test(nomeFile) || /^\s*(<\?xml[^>]*>\s*)?<(\w+:)?Document\b/.test(buf.subarray(0, 400).toString('utf8'));
  const pdf = buf.subarray(0, 1024).indexOf('%PDF-') >= 0;
  let r;
  if (pdf) {
    // U9c: PDF della banca (estratto o lista movimenti), letto per posizione.
    r = { ...(await P.leggiPdf(buf)), mappa: null, firma: null, intestazione: null, modello: null };
  } else if (camt) {
    r = { ...L.leggiCamt(buf), mappa: null, firma: null, intestazione: null, modello: null };
  } else {
    const { formato, righe } = L.leggiTabella(buf, nomeFile);
    const colonne = righe.reduce((n, x) => Math.max(n, x.length), 0);
    let mappa = null, modello = null;
    if (mappaUtente !== undefined && mappaUtente !== null) {
      if (!L.mappaValida(mappaUtente, colonne) || mappaUtente.intestazione >= righe.length) throw errore('Abbinamento delle colonne non valido');
      mappa = mappaUtente;
    } else {
      const h = L.trovaIntestazione(righe);
      // Un modello salvato vale solo se la stessa intestazione c'e' nel file.
      if (h) {
        const salvato = cercaModello ? await cercaModello(L.firmaIntestazione(righe[h.indice])) : null;
        if (salvato && L.mappaValida({ ...salvato.mappa, intestazione: h.indice }, colonne)) {
          mappa = { ...salvato.mappa, intestazione: h.indice }; modello = { id: salvato.id, nome: salvato.nome };
        } else mappa = h.mappa;
      } else if (cercaModello) {
        for (let i = 0; i < Math.min(righe.length, 40) && !mappa; i++) {
          if (righe[i].filter(Boolean).length < 2) continue;
          const salvato = await cercaModello(L.firmaIntestazione(righe[i]));
          if (salvato && L.mappaValida({ ...salvato.mappa, intestazione: i }, colonne)) {
            mappa = { ...salvato.mappa, intestazione: i }; modello = { id: salvato.id, nome: salvato.nome };
          }
        }
      }
    }
    if (!mappa) {
      throw errore('Non riconosco le colonne di questo file: indica quali sono', {
        serveMappa: true, righe: righe.slice(0, RIGHE_PER_MAPPA).map(x => x.slice(0, 20).map(c => String(c).slice(0, 80)))
      });
    }
    const a = L.applicaMappa(righe, mappa);
    r = {
      formato, movimenti: a.movimenti, scartate: a.scartate, mappa, modello,
      firma: L.firmaIntestazione(righe[mappa.intestazione]), intestazione: righe[mappa.intestazione].slice(0, 20),
      saldo_iniziale: null, saldo_finale: L.saldoDichiarato(righe, mappa.intestazione)
    };
  }
  if (!r.movimenti.length) throw errore('Nel file non trovo movimenti contabilizzati');
  r.movimenti = L.impronte(r.movimenti);
  const date = r.movimenti.map(m => m.data).sort();
  r.dal = date[0]; r.al = date[date.length - 1];
  return r;
}

const giorni = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

async function confronta(client, userId, contoId, movimenti) {
  const gia = new Set((await client.query(
    'SELECT impronta FROM righe_estratto WHERE conto_id = $1 AND user_id = $2 AND impronta = ANY($3::char(64)[])',
    [contoId, userId, movimenti.map(m => m.impronta)]
  )).rows.map(x => x.impronta.trim()));
  const date = movimenti.map(m => m.data).sort();
  const candidati = (await client.query(`
    SELECT m.id, to_char(m.data, 'YYYY-MM-DD') AS giorno, m.tipo, round(m.importo * 100)::bigint AS centesimi
    FROM movimenti m
    WHERE m.user_id = $1 AND m.conto_id = $2
      AND m.data BETWEEN $3::date - ${TOLLERANZA_GIORNI} AND $4::date + ${TOLLERANZA_GIORNI}
      AND NOT EXISTS (SELECT 1 FROM righe_estratto r WHERE r.movimento_id = m.id)
    ORDER BY m.data, m.id`, [userId, contoId, date[0], date[date.length - 1]])).rows;
  const presi = new Set();
  return movimenti.map(m => {
    if (gia.has(m.impronta)) return { ...m, esito: 'gia' };
    let meglio = null;
    for (const c of candidati) {
      if (presi.has(c.id) || c.tipo !== m.tipo || Number(c.centesimi) !== m.centesimi) continue;
      const d = Math.abs(giorni(c.giorno, m.data));
      if (d > TOLLERANZA_GIORNI) continue;
      if (!meglio || d < meglio.d) meglio = { c, d };
    }
    if (meglio) { presi.add(meglio.c.id); return { ...m, esito: 'abbinata', movimento_id: meglio.c.id, giorno_registro: meglio.c.giorno }; }
    return { ...m, esito: 'nuova' };
  });
}

async function saldoRegistro(client, userId, contoId, al) {
  const r = (await client.query(`
    SELECT round((coalesce(cc.saldo_iniziale, 0) + coalesce(sum(CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE -m.importo END), 0)) * 100)::bigint AS c
    FROM conti_correnti cc
    LEFT JOIN movimenti m ON m.conto_id = cc.id AND m.user_id = cc.user_id AND m.data <= $3
    WHERE cc.id = $2 AND cc.user_id = $1
    GROUP BY cc.id, cc.saldo_iniziale`, [userId, contoId, al])).rows[0];
  return r ? Number(r.c) : null;
}

// Riepilogo per l'anteprima e per la risposta della conferma.
function riepilogo(righe, saldoPrima, saldoFile) {
  const n = e => righe.filter(r => r.esito === e).length;
  const nuove = righe.filter(r => r.esito === 'nuova');
  const delta = nuove.reduce((s, r) => s + (r.tipo === 'Entrata' ? r.centesimi : -r.centesimi), 0);
  const dopo = saldoPrima === null ? null : saldoPrima + delta;
  return {
    totale: righe.length, gia: n('gia'), abbinate: n('abbinata'), nuove: nuove.length,
    saldo: { file: saldoFile, registro_dopo: dopo, differenza: saldoFile === null || dopo === null ? null : saldoFile - dopo }
  };
}

module.exports = { prepara, confronta, saldoRegistro, riepilogo, TOLLERANZA_GIORNI };

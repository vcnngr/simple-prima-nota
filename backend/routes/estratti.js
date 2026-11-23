// routes/estratti.js
// Estratti conto della banca (blocco U9a, richiesta del commercialista del
// 22/11/2026): il cliente carica il file della banca su un suo conto; ogni riga
// si abbina a un movimento gia' nel Registro o diventa un movimento «da
// descrivere». Solo l'utente (non lo studio) carica e conferma.
//
//   POST /api/estratti/anteprima  multipart: file, conto_id, mappa? (JSON)
//        -> cosa succederebbe, senza scrivere nulla
//   POST /api/estratti            stessi campi, nome_banca? -> importa
//   GET  /api/estratti?conto_id=  estratti caricati, con quante righe da descrivere
//   GET  /api/estratti/:id        righe della banca e il loro movimento
const express = require('express');
const multer = require('multer');
const Joi = require('joi');
const { queryAll, queryOne, withTransaction } = require('../config/database');
const { auth } = require('../middleware/auth');
const { logErrore } = require('../utils/errori');
const L = require('../services/estratti/leggi');
const I = require('../services/estratti/importa');

const router = express.Router();
router.use(auth); // solo token dell'utente: lo studio non carica estratti

const caricamento = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: L.MAX_FILE, files: 1, fields: 4, parts: 5, fieldSize: 16 * 1024 }
}).single('file');

function riceviFile(req, res, next) {
  caricamento(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Il file supera i 10 MB' });
    return res.status(400).json({ error: 'Caricamento non valido' });
  });
}

const campi = Joi.object({
  conto_id: Joi.number().integer().min(1).max(2147483647).required(),
  mappa: Joi.string().max(4000).optional(),
  nome_banca: Joi.string().trim().min(1).max(100).optional()
});

// Campi del modulo + file letto. Risponde lui all'errore e torna null.
async function leggiRichiesta(req, res) {
  if (!req.file) { res.status(400).json({ error: 'Nessun file ricevuto' }); return null; }
  const { error, value } = campi.validate(req.body || {}, { stripUnknown: true });
  if (error) { res.status(400).json({ error: 'Dati non validi' }); return null; }
  let mappa;
  if (value.mappa !== undefined) {
    try { mappa = JSON.parse(value.mappa); } catch { res.status(400).json({ error: 'Abbinamento delle colonne non valido' }); return null; }
  }
  const conto = await queryOne('SELECT id, nome_banca FROM conti_correnti WHERE id = $1 AND user_id = $2', [value.conto_id, req.user.id]);
  if (!conto) { res.status(404).json({ error: 'Conto non trovato' }); return null; }
  const nomeFile = String(req.file.originalname || 'estratto').replace(/[\u0000-\u001f]/g, '').slice(0, 255) || 'estratto';
  try {
    const letto = await I.prepara(req.file.buffer, nomeFile, mappa,
      firma => queryOne('SELECT id, nome, mappa FROM modelli_estratto WHERE firma = $1', [firma]));
    return { conto, nomeFile, letto, nomeBanca: value.nome_banca, mappaUtente: mappa !== undefined };
  } catch (e) {
    if (e.estratto) {
      res.status(422).json({ error: e.message, ...(e.serveMappa ? { serve_mappa: true, righe: e.righe } : {}) });
      return null;
    }
    throw e;
  }
}

const euro = c => (c === null ? null : (c / 100).toFixed(2));
const perRisposta = r => ({
  riga: r.riga, data: r.data, descrizione: r.descrizione, importo: euro(r.centesimi), tipo: r.tipo,
  esito: r.esito, movimento_id: r.movimento_id ?? null, giorno_registro: r.giorno_registro ?? null
});

async function esamina(client, userId, x) {
  const righe = await I.confronta(client, userId, x.conto.id, x.letto.movimenti);
  const saldoPrima = await I.saldoRegistro(client, userId, x.conto.id, x.letto.al);
  return { righe, riepilogo: I.riepilogo(righe, saldoPrima, x.letto.saldo_finale) };
}

function corpo(x, e) {
  const s = e.riepilogo.saldo;
  return {
    formato: x.letto.formato, dal: x.letto.dal, al: x.letto.al,
    mappa: x.letto.mappa, intestazione: x.letto.intestazione, modello: x.letto.modello,
    scartate: x.letto.scartate.length,
    riepilogo: { ...e.riepilogo, saldo: { file: euro(s.file), registro_dopo: euro(s.registro_dopo), differenza: euro(s.differenza) } },
    righe: e.righe.map(perRisposta)
  };
}

router.post('/anteprima', riceviFile, async (req, res) => {
  try {
    const x = await leggiRichiesta(req, res);
    if (!x) return;
    const e = await withTransaction(c => esamina(c, req.user.id, x));
    res.json(corpo(x, e));
  } catch (error) {
    logErrore('Error estratto anteprima', error);
    res.status(500).json({ error: 'Errore durante la lettura dell\'estratto' });
  }
});

router.post('/', riceviFile, async (req, res) => {
  try {
    const x = await leggiRichiesta(req, res);
    if (!x) return;
    const userId = req.user.id;
    const esito = await withTransaction(async (c) => {
      // Due caricamenti dello stesso conto insieme: uno alla volta.
      await c.query("SELECT pg_advisory_xact_lock(hashtext('estratto_conto'), $1)", [x.conto.id]);
      const e = await esamina(c, userId, x);
      // Tutto gia' importato: niente estratto vuoto in elenco.
      if (e.righe.every(r => r.esito === 'gia')) return { gia: true, ...e };
      let modelloId = x.letto.modello?.id ?? null;
      if (x.letto.firma && x.mappaUtente) {
        const { intestazione, ...mappa } = x.letto.mappa; // eslint-disable-line no-unused-vars
        const m = await c.query(`
          INSERT INTO modelli_estratto (firma, nome, mappa, creato_da) VALUES ($1, $2, $3, $4)
          ON CONFLICT (firma) DO UPDATE SET usi = modelli_estratto.usi RETURNING id`,
        [x.letto.firma, (x.nomeBanca || x.conto.nome_banca).slice(0, 100), mappa, userId]);
        modelloId = m.rows[0].id;
      }
      if (modelloId) await c.query('UPDATE modelli_estratto SET usi = usi + 1, updated_at = NOW() WHERE id = $1', [modelloId]);
      const est = (await c.query(`
        INSERT INTO estratti_conto (user_id, conto_id, modello_id, nome_file, formato, dal, al, saldo_iniziale, saldo_finale, righe)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [userId, x.conto.id, modelloId, x.nomeFile, x.letto.formato, x.letto.dal, x.letto.al,
        euro(x.letto.saldo_iniziale), euro(x.letto.saldo_finale), e.righe.filter(r => r.esito !== 'gia').length])).rows[0];
      for (const r of e.righe) {
        if (r.esito === 'gia') continue;
        let movimentoId = r.movimento_id;
        if (r.esito === 'nuova') {
          movimentoId = (await c.query(`
            INSERT INTO movimenti (data, conto_id, descrizione, importo, tipo, user_id, da_descrivere)
            VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id`,
          [r.data, x.conto.id, r.descrizione, euro(r.centesimi), r.tipo, userId])).rows[0].id;
          r.movimento_id = movimentoId;
        }
        await c.query(`
          INSERT INTO righe_estratto (estratto_id, user_id, conto_id, data, data_valuta, descrizione, importo, tipo, impronta, movimento_id, esito)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [est.id, userId, x.conto.id, r.data, r.data_valuta, r.descrizione, euro(r.centesimi), r.tipo, r.impronta, movimentoId,
          r.esito === 'nuova' ? 'creata' : 'abbinata']);
      }
      return { id: est.id, ...e };
    });
    if (esito.gia) return res.status(409).json({ error: 'Questo estratto e\' gia\' stato importato: nessuna riga nuova', ...corpo(x, esito) });
    res.status(201).json({ id: esito.id, ...corpo(x, esito) });
  } catch (error) {
    logErrore('Error estratto import', error);
    res.status(500).json({ error: 'Errore durante l\'importazione dell\'estratto' });
  }
});

const elenco = Joi.object({ conto_id: Joi.number().integer().min(1).max(2147483647).optional() });

router.get('/', async (req, res) => {
  const { error, value } = elenco.validate(req.query, { stripUnknown: true });
  if (error) return res.status(400).json({ error: 'Dati non validi' });
  try {
    const params = [req.user.id];
    const conto = value.conto_id ? `AND e.conto_id = $${params.push(value.conto_id)}` : '';
    res.json(await queryAll(`
      SELECT e.id, e.conto_id, cc.nome_banca, e.nome_file, e.formato, to_char(e.dal, 'YYYY-MM-DD') AS dal,
             to_char(e.al, 'YYYY-MM-DD') AS al, e.saldo_finale, e.righe, e.created_at,
             count(r.id) FILTER (WHERE m.da_descrivere)::int AS da_descrivere,
             count(r.id) FILTER (WHERE r.esito = 'creata')::int AS create,
             count(r.id) FILTER (WHERE r.esito = 'abbinata')::int AS abbinate
      FROM estratti_conto e
      JOIN conti_correnti cc ON cc.id = e.conto_id AND cc.user_id = e.user_id
      LEFT JOIN righe_estratto r ON r.estratto_id = e.id
      LEFT JOIN movimenti m ON m.id = r.movimento_id AND m.user_id = e.user_id
      WHERE e.user_id = $1 ${conto}
      GROUP BY e.id, cc.nome_banca
      ORDER BY e.al DESC, e.id DESC LIMIT 200`, params));
  } catch (error) {
    logErrore('Error estratti list', error);
    res.status(500).json({ error: 'Errore durante il caricamento degli estratti' });
  }
});

router.get('/:id(\\d+)', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id > 2147483647) return res.status(404).json({ error: 'Estratto non trovato' });
  try {
    const e = await queryOne(`
      SELECT e.id, e.conto_id, cc.nome_banca, e.nome_file, e.formato, to_char(e.dal, 'YYYY-MM-DD') AS dal,
             to_char(e.al, 'YYYY-MM-DD') AS al, e.saldo_iniziale, e.saldo_finale, e.righe, e.created_at
      FROM estratti_conto e JOIN conti_correnti cc ON cc.id = e.conto_id AND cc.user_id = e.user_id
      WHERE e.id = $1 AND e.user_id = $2`, [id, req.user.id]);
    if (!e) return res.status(404).json({ error: 'Estratto non trovato' });
    const righe = await queryAll(`
      SELECT r.id, to_char(r.data, 'YYYY-MM-DD') AS data, r.descrizione, r.importo, r.tipo, r.esito, r.movimento_id,
             m.da_descrivere, m.categoria, m.note, a.nome AS anagrafica_nome
      FROM righe_estratto r
      LEFT JOIN movimenti m ON m.id = r.movimento_id AND m.user_id = r.user_id
      LEFT JOIN anagrafiche a ON a.id = m.anagrafica_id AND a.user_id = r.user_id
      WHERE r.estratto_id = $1 AND r.user_id = $2
      ORDER BY r.data, r.id`, [id, req.user.id]);
    res.json({ ...e, righe_banca: righe });
  } catch (error) {
    logErrore('Error estratto detail', error);
    res.status(500).json({ error: 'Errore durante il caricamento dell\'estratto' });
  }
});

module.exports = router;

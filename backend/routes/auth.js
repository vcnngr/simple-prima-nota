// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const { query, queryOne, withTransaction } = require('../config/database');
const { validate, schemas } = require('../middleware/validation');
const { auth } = require('../middleware/auth');
const account = require('../services/AccountService');
const preferenze = require('../services/PreferenzeService');
const { limiteResetPassword, rispondiResetAccolto } = require('../middleware/account');
const { logErrore, motivoRiga } = require('../utils/errori');

const router = express.Router();

// Registrazione utente
router.post('/register', validate(schemas.user), async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    // Verifica se l'utente esiste già
    const existingUser = await queryOne(
      'SELECT id FROM utenti WHERE username = $1 OR lower(email) = lower($2)',
      [username, email]
    );
    
    if (existingUser) {
      return res.status(400).json({ error: 'Username o email già in uso' });
    }
    
    // Hash della password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Inserimento utente
    const result = await query(
      'INSERT INTO utenti (username, password_hash, email) VALUES ($1, $2, $3) RETURNING id, username, email, versione_credenziali',
      [username, hashedPassword, email]
    );
    
    const user = result.rows[0];
    
    const token = account.firmaJwt('user', user);
    
    res.status(201).json({
      success: true,
      message: 'Utente registrato con successo',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      token
    });
  } catch (error) {
    // 23505: username o email presi fra il controllo e l'INSERT (l'indice
    // unico su lower(email) della 008 vale anche per le maiuscole).
    if (error.code === '23505') return res.status(400).json({ error: 'Username o email già in uso' });
    logErrore('Registration error', error);
    res.status(500).json({ error: 'Errore durante la registrazione' });
  }
});

// Login utente
router.post('/login', validate(schemas.login), async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Trova l'utente
    const user = await queryOne(
      'SELECT id, username, email, password_hash, versione_credenziali FROM utenti WHERE username = $1',
      [username]
    );
    
    if (!user) {
      return res.status(400).json({ error: 'Credenziali non valide' });
    }
    
    // Verifica password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Credenziali non valide' });
    }
    
    const token = account.firmaJwt('user', user);
    
    res.json({
      success: true,
      message: 'Login effettuato con successo',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      preferenze: await preferenze.perRisposta('user', user.id),
      token
    });
  } catch (error) {
    logErrore('Login error', error);
    res.status(500).json({ error: 'Errore durante il login' });
  }
});

// Verifica token
router.get('/verify', auth, async (req, res) => {
  try {
    res.json({
      valid: true,
      user: req.user
    });
  } catch (error) {
    logErrore('Token verification error', error);
    res.status(500).json({ error: 'Errore durante la verifica del token' });
  }
});

// Profilo utente
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await queryOne(
      'SELECT id, username, email, created_at FROM utenti WHERE id = $1',
      [req.user.id]
    );
    
    if (!user) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
    
    res.json({ ...user, preferenze: await preferenze.perRisposta('user', user.id) });
  } catch (error) {
    logErrore('Profile error', error);
    res.status(500).json({ error: 'Errore durante il caricamento del profilo' });
  }
});

// Tema e aspetto dell'account (blocco U2).
router.get('/preferenze', auth, async (req, res) => {
  try {
    res.json(await preferenze.leggi('user', req.user.id));
  } catch (error) {
    logErrore('Preferenze error', error);
    res.status(500).json({ error: 'Errore nel caricamento delle preferenze' });
  }
});

router.put('/preferenze', auth, validate(schemas.preferenze), async (req, res) => {
  try {
    res.json(await preferenze.salva('user', req.user.id, req.body));
  } catch (error) {
    logErrore('Preferenze update error', error);
    res.status(500).json({ error: 'Errore nel salvataggio delle preferenze' });
  }
});

// Cambio password. Chiude le altre sessioni (versione delle credenziali) e
// restituisce un token nuovo per questa.
router.post('/change-password', auth, validate(schemas.cambioPassword), async (req, res) => {
  try {
    const r = await account.cambiaPassword('user', req.user.id, req.body.currentPassword, req.body.newPassword);
    if (r.esito === 'password_errata') {
      return res.status(400).json({ error: 'Password corrente non corretta' });
    }
    if (r.esito === 'conflitto') {
      return res.status(409).json({ error: 'La password e\' appena cambiata altrove: accedi di nuovo' });
    }
    res.json({ message: 'Password cambiata con successo', token: r.token });
  } catch (error) {
    logErrore('Change password error', error);
    res.status(500).json({ error: 'Errore durante il cambio password' });
  }
});

// Password dimenticata: risposta identica che l'account esista o no, data
// prima di cercarlo. Il lavoro (token e mail) si fa dopo.
router.post('/password-dimenticata', limiteResetPassword, validate(schemas.passwordDimenticata),
  rispondiResetAccolto('user'));

router.post('/password-reimposta', validate(schemas.passwordReimposta), async (req, res) => {
  try {
    const ok = await account.reimpostaPassword('user', req.body.token, req.body.password);
    if (!ok) return res.status(400).json({ error: 'Link non valido o scaduto' });
    res.json({ success: true, message: 'Password reimpostata: accedi con la nuova password' });
  } catch (error) {
    logErrore('Reset password error', error);
    res.status(500).json({ error: 'Errore durante la reimpostazione della password' });
  }
});

// Cambio email: serve la password; il nuovo indirizzo vale dopo la conferma.
router.post('/email', auth, validate(schemas.cambioEmail), async (req, res) => {
  try {
    const r = await account.richiediCambioEmail('user', req.user.id, req.body.password, req.body.email);
    if (r.esito === 'password_errata') return res.status(400).json({ error: 'Password non corretta' });
    if (r.esito === 'stessa_email') return res.status(400).json({ error: 'E\' gia\' il tuo indirizzo' });
    if (r.esito === 'email_in_uso') return res.status(409).json({ error: 'Indirizzo gia\' in uso' });
    res.status(202).json({ success: true, message: 'Ti abbiamo scritto al nuovo indirizzo: il cambio vale dopo la conferma' });
  } catch (error) {
    logErrore('Change email error', error);
    res.status(500).json({ error: 'Errore durante il cambio email' });
  }
});

router.post('/email/conferma', validate(schemas.confermaEmail), async (req, res) => {
  try {
    const r = await account.confermaEmail('user', req.body.token);
    if (r.esito === 'non_valido') return res.status(400).json({ error: 'Link non valido o scaduto' });
    if (r.esito === 'email_in_uso') return res.status(409).json({ error: 'Indirizzo gia\' in uso' });
    res.json({ success: true, message: 'Indirizzo email aggiornato', email: r.email });
  } catch (error) {
    logErrore('Confirm email error', error);
    res.status(500).json({ error: 'Errore durante la conferma dell\'indirizzo' });
  }
});

// POST /api/auth/backup/import - Import backup senza transazioni manuali
router.post('/backup/import', auth, async (req, res) => {
  const { backupData, mode = 'replace' } = req.body || {};
  const userId = req.user.id;

  if (!backupData || typeof backupData !== 'object' || Array.isArray(backupData)) {
    return res.status(400).json({ error: 'Dati backup richiesti' });
  }
  if (mode !== 'replace' && mode !== 'merge') {
    return res.status(400).json({ error: 'Modalita\' non valida: replace o merge' });
  }

  try {
    console.log(`📥 Inizio import backup per utente ${userId}, modalità: ${mode}`);

    // 1. Validazione backup
    const validation = validateBackup(backupData);
    if (!validation.isValid) {
      return res.status(400).json({ 
        error: 'Backup non valido', 
        details: validation.errors 
      });
    }

    // Tutto o niente (U6b): prima, con «replace», i dati si cancellavano e le
    // righe che non entravano si perdevano in silenzio. Ora una transazione; ogni
    // riga in un savepoint per poter elencare tutti gli errori; se ce n'e' anche
    // uno solo si annulla tutto e i dati di prima restano.
    const results = await withTransaction(async (cl) => {
      const riga = async (sql, params) => {
        await cl.query('SAVEPOINT riga');
        try {
          const r = await cl.query(sql, params);
          await cl.query('RELEASE SAVEPOINT riga');
          return r;
        } catch (e) {
          await cl.query('ROLLBACK TO SAVEPOINT riga');
          throw e;
        }
      };

      const results = {
        mode,
        import_date: new Date().toISOString(),
        imported: {
          conti_correnti: 0,
          tipologie_anagrafiche: 0,
          categorie_anagrafiche: 0,
          categorie_movimenti: 0,
          anagrafiche: 0,
          movimenti: 0,
          alerts: 0
        },
        errors: []
      };

      // 2. Se modalità replace, elimina dati esistenti
      if (mode === 'replace') {
        console.log('🗑️ Modalità replace: eliminazione dati esistenti...');

        try {
          // L'ordine è importante per rispettare le foreign key
          await riga('DELETE FROM movimenti WHERE user_id = $1', [userId]);
          await riga('DELETE FROM anagrafiche WHERE user_id = $1', [userId]);
          await riga('DELETE FROM tipologie_anagrafiche WHERE user_id = $1', [userId]);
          await riga('DELETE FROM categorie_movimenti WHERE user_id = $1', [userId]);
          await riga('DELETE FROM categorie_anagrafiche WHERE user_id = $1', [userId]);
          await riga('DELETE FROM conti_correnti WHERE user_id = $1', [userId]);
          await riga('DELETE FROM alerts WHERE user_id = $1', [userId]);
          console.log('✅ Dati esistenti eliminati');
        } catch (error) {
          logErrore('❌ Errore eliminazione dati esistenti', error);
          throw error;
        }
      }

      // Mappature per ID (vecchio ID → nuovo ID)
      const idMappings = {
        conti: new Map(),
        tipologie: new Map(),
        anagrafiche: new Map()
      };

      // 3. Import conti correnti
      if (backupData.conti_correnti?.length) {
        console.log(`💳 Import ${backupData.conti_correnti.length} conti correnti...`);
        for (const conto of backupData.conti_correnti) {
          try {
            const result = await riga(`
              INSERT INTO conti_correnti (user_id, nome_banca, intestatario, iban, saldo_iniziale, attivo)
              VALUES ($1, $2, $3, $4, $5, $6)
              RETURNING id
            `, [userId, conto.nome_banca, conto.intestatario, conto.iban, conto.saldo_iniziale, conto.attivo]);

            idMappings.conti.set(conto.id, result.rows[0].id);
            results.imported.conti_correnti++;
          } catch (error) {
            results.errors.push(`Conto ${conto.nome_banca}: ${motivoRiga(error)}`);
          }
        }
      }

      // 4. Import tipologie anagrafiche
      if (backupData.tipologie_anagrafiche?.length) {
        console.log(`🏷️ Import ${backupData.tipologie_anagrafiche.length} tipologie anagrafiche...`);
        for (const tipologia of backupData.tipologie_anagrafiche) {
          try {
            const result = await riga(`
              INSERT INTO tipologie_anagrafiche (user_id, nome, descrizione, tipo_movimento_default, colore, icona, attiva)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              RETURNING id
            `, [userId, tipologia.nome, tipologia.descrizione, tipologia.tipo_movimento_default, 
                tipologia.colore, tipologia.icona, tipologia.attiva]);

            idMappings.tipologie.set(tipologia.id, result.rows[0].id);
            results.imported.tipologie_anagrafiche++;
          } catch (error) {
            results.errors.push(`Tipologia ${tipologia.nome}: ${motivoRiga(error)}`);
          }
        }
      }

      // 5. Import categorie anagrafiche
      if (backupData.categorie_anagrafiche?.length) {
        console.log(`📂 Import ${backupData.categorie_anagrafiche.length} categorie anagrafiche...`);
        for (const categoria of backupData.categorie_anagrafiche) {
          try {
            await riga(`
              INSERT INTO categorie_anagrafiche (user_id, nome, descrizione, colore, attiva)
              VALUES ($1, $2, $3, $4, $5)
            `, [userId, categoria.nome, categoria.descrizione, categoria.colore, categoria.attiva]);

            results.imported.categorie_anagrafiche++;
          } catch (error) {
            results.errors.push(`Categoria anagrafica ${categoria.nome}: ${motivoRiga(error)}`);
          }
        }
      }

      // 6. Import categorie movimenti
      if (backupData.categorie_movimenti?.length) {
        console.log(`📂 Import ${backupData.categorie_movimenti.length} categorie movimenti...`);
        for (const categoria of backupData.categorie_movimenti) {
          try {
            await riga(`
              INSERT INTO categorie_movimenti (user_id, nome, tipo, descrizione, colore, attiva)
              VALUES ($1, $2, $3, $4, $5, $6)
            `, [userId, categoria.nome, categoria.tipo, categoria.descrizione, categoria.colore, categoria.attiva]);

            results.imported.categorie_movimenti++;
          } catch (error) {
            results.errors.push(`Categoria movimento ${categoria.nome}: ${motivoRiga(error)}`);
          }
        }
      }

      // 7. Import anagrafiche
      if (backupData.anagrafiche?.length) {
        console.log(`👥 Import ${backupData.anagrafiche.length} anagrafiche...`);
        for (const anagrafica of backupData.anagrafiche) {
          try {
            const tipologiaId = anagrafica.tipologia_id ? idMappings.tipologie.get(anagrafica.tipologia_id) : null;

            const result = await riga(`
              INSERT INTO anagrafiche (user_id, nome, tipologia_id, tipo_movimento_preferito, categoria, email, telefono, piva, indirizzo, attivo)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              RETURNING id
            `, [userId, anagrafica.nome, tipologiaId, anagrafica.tipo_movimento_preferito, 
                anagrafica.categoria, anagrafica.email, anagrafica.telefono, anagrafica.piva, 
                anagrafica.indirizzo, anagrafica.attivo]);

            idMappings.anagrafiche.set(anagrafica.id, result.rows[0].id);
            results.imported.anagrafiche++;
          } catch (error) {
            results.errors.push(`Anagrafica ${anagrafica.nome}: ${motivoRiga(error)}`);
          }
        }
      }

      // 8. Import movimenti
      if (backupData.movimenti?.length) {
        console.log(`📊 Import ${backupData.movimenti.length} movimenti...`);
        for (const movimento of backupData.movimenti) {
          try {
            const anagraficaId = movimento.anagrafica_id ? idMappings.anagrafiche.get(movimento.anagrafica_id) : null;
            const contoId = idMappings.conti.get(movimento.conto_id);

            if (!contoId) {
              results.errors.push(`Movimento ${movimento.descrizione}: conto non trovato`);
              continue;
            }

            await riga(`
              INSERT INTO movimenti (user_id, data, anagrafica_id, conto_id, descrizione, categoria, importo, tipo, note)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [userId, movimento.data, anagraficaId, contoId, movimento.descrizione, 
                movimento.categoria, movimento.importo, movimento.tipo, movimento.note]);

            results.imported.movimenti++;
          } catch (error) {
            results.errors.push(`Movimento ${movimento.descrizione}: ${motivoRiga(error)}`);
          }
        }
      }

      // 9. Import alerts (opzionale)
      if (backupData.alerts?.length) {
        console.log(`🔔 Import ${backupData.alerts.length} alerts...`);
        for (const alert of backupData.alerts) {
          try {
            await riga(`
              INSERT INTO alerts (user_id, titolo, messaggio, tipo, priorita, letto, data_creazione, azione_link, azione_testo)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [userId, alert.titolo, alert.messaggio, alert.tipo, alert.priorita, alert.letto, 
                alert.data_creazione, alert.azione_link, alert.azione_testo]);

            results.imported.alerts++;
          } catch (error) {
            // Anche un avviso che non entra annulla tutto: con «sostituisci» quelli
            // di prima sono gia' cancellati e andrebbero persi (review U6b).
            results.errors.push(`Avviso ${alert.titolo ?? ''}: ${motivoRiga(error)}`);
          }
        }
      }

      if (results.errors.length > 0) {
        throw Object.assign(new Error('backup non importato'), { risultati: results });
      }
      return results;
    });

    console.log('✅ Import backup completato:', results.imported);
    res.json({
      success: true,
      message: 'Import backup completato con successo',
      results
    });

  } catch (error) {
    if (error.risultati) {
      return res.status(400).json({
        error: 'Backup non importato: nessun dato e\' stato cambiato',
        errori: error.risultati.errors.slice(0, 50),
        numero_errori: error.risultati.errors.length
      });
    }
    logErrore('❌ Errore import backup', error);
    res.status(500).json({ 
      error: 'Errore durante l\'import del backup'
    });
  }
});

// Funzione validazione backup (stessa di prima)
function validateBackup(backupData) {
  const errors = [];

  if (!backupData.metadata) {
    errors.push('Metadata mancanti');
  }

  if (!backupData.user) {
    errors.push('Dati utente mancanti');
  }

  if (backupData.metadata?.version && backupData.metadata.version !== '1.0') {
    errors.push('Versione backup non supportata');
  }

  if (backupData.metadata?.app_name && !backupData.metadata.app_name.includes('Prima Nota')) {
    errors.push('Backup non compatibile con Prima Nota');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// GET /api/auth/backup/export - Export completo dati utente
router.get('/backup/export', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`📦 Creazione backup completo per utente ${userId}`);

    // Struttura backup con metadata
    const backup = {
      metadata: {
        export_date: new Date().toISOString(),
        user_id: userId,
        version: '1.0',
        app_name: 'Prima Nota Contabile',
        format: 'JSON'
      },
      user: null,
      conti_correnti: [],
      tipologie_anagrafiche: [],
      categorie_anagrafiche: [],
      categorie_movimenti: [],
      anagrafiche: [],
      movimenti: [],
      alerts: []
    };

    // 1. Dati utente (senza password)
    const userResult = await query(`
      SELECT id, username, email, created_at, updated_at
      FROM utenti WHERE id = $1
    `, [userId]);
    backup.user = userResult.rows[0];

    // 2. Conti correnti
    const contiResult = await query(`
      SELECT id, nome_banca, intestatario, iban, saldo_iniziale, attivo, created_at, updated_at
      FROM conti_correnti WHERE user_id = $1
      ORDER BY created_at
    `, [userId]);
    backup.conti_correnti = contiResult.rows;

    // 3. Tipologie anagrafiche
    const tipologieResult = await query(`
      SELECT id, nome, descrizione, tipo_movimento_default, colore, icona, attiva, created_at, updated_at
      FROM tipologie_anagrafiche WHERE user_id = $1
      ORDER BY created_at
    `, [userId]);
    backup.tipologie_anagrafiche = tipologieResult.rows;

    // 4. Categorie anagrafiche
    const catAnagraficheResult = await query(`
      SELECT id, nome, descrizione, colore, attiva, created_at, updated_at
      FROM categorie_anagrafiche WHERE user_id = $1
      ORDER BY created_at
    `, [userId]);
    backup.categorie_anagrafiche = catAnagraficheResult.rows;

    // 5. Categorie movimenti
    const catMovimentiResult = await query(`
      SELECT id, nome, tipo, descrizione, colore, attiva, created_at, updated_at
      FROM categorie_movimenti WHERE user_id = $1
      ORDER BY created_at
    `, [userId]);
    backup.categorie_movimenti = catMovimentiResult.rows;

    // 6. Anagrafiche
    const anagraficheResult = await query(`
      SELECT id, nome, tipologia_id, tipo_movimento_preferito, categoria, 
             email, telefono, piva, indirizzo, attivo, created_at, updated_at
      FROM anagrafiche WHERE user_id = $1
      ORDER BY created_at
    `, [userId]);
    backup.anagrafiche = anagraficheResult.rows;

    // 7. Movimenti
    const movimentiResult = await query(`
      SELECT id, data, anagrafica_id, conto_id, descrizione, categoria, 
             importo, tipo, note, created_at, updated_at
      FROM movimenti WHERE user_id = $1
      ORDER BY data, created_at
    `, [userId]);
    backup.movimenti = movimentiResult.rows;

    // 8. Alerts (opzionali)
    try {
      const alertsResult = await query(`
        SELECT id, titolo, messaggio, tipo, priorita, letto, 
               data_creazione, data_lettura, azione_link, azione_testo
        FROM alerts WHERE user_id = $1
        ORDER BY data_creazione
      `, [userId]);
      backup.alerts = alertsResult.rows;
    } catch (error) {
      backup.alerts = [];
    }

    // Statistiche per log e response headers
    const stats = {
      conti: backup.conti_correnti.length,
      tipologie: backup.tipologie_anagrafiche.length,
      anagrafiche: backup.anagrafiche.length,
      movimenti: backup.movimenti.length,
      categorie_anagrafiche: backup.categorie_anagrafiche.length,
      categorie_movimenti: backup.categorie_movimenti.length,
      alerts: backup.alerts.length
    };

    console.log(`✅ Backup creato con successo:`, stats);

    // Calcola dimensione
    const backupString = JSON.stringify(backup, null, 2);
    const sizeInBytes = Buffer.byteLength(backupString, 'utf8');
    const sizeInMB = (sizeInBytes / 1024 / 1024).toFixed(2);

    // Headers per download e statistiche
    const filename = `prima_nota_backup_${backup.user.username}_${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Backup-Size', sizeInMB);
    res.setHeader('X-Backup-Stats', JSON.stringify(stats));
    res.setHeader('X-Backup-Username', backup.user.username);

    // Invia il backup
    res.json(backup);

  } catch (error) {
    logErrore('❌ Errore export backup', error);
    res.status(500).json({ 
      error: 'Errore durante l\'export del backup'
    });
  }
});

// DELETE /api/auth/account - Elimina account utente (USA CASCADE DB)
router.delete('/account', auth, async (req, res) => {
  const { password } = req.body;
  const userId = req.user.id;

  console.log(`🗑️ Richiesta eliminazione account per utente ${userId}`);

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ 
      error: 'Password richiesta per confermare l\'eliminazione' 
    });
  }

  try {
    // 1. Verifica password corrente
    const user = await queryOne(
      'SELECT id, password_hash, username FROM utenti WHERE id = $1',
      [userId]
    );

    if (!user) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }


    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Password non corretta' });
    }

    // 2. Conta i dati prima dell'eliminazione (per statistiche)
    const conteggi = {};
    
    try {
      conteggi.movimenti = (await queryOne('SELECT COUNT(*) as count FROM movimenti WHERE user_id = $1', [userId]))?.count || 0;
      conteggi.anagrafiche = (await queryOne('SELECT COUNT(*) as count FROM anagrafiche WHERE user_id = $1', [userId]))?.count || 0;
      conteggi.conti = (await queryOne('SELECT COUNT(*) as count FROM conti_correnti WHERE user_id = $1', [userId]))?.count || 0;
      conteggi.tipologie = (await queryOne('SELECT COUNT(*) as count FROM tipologie_anagrafiche WHERE user_id = $1', [userId]))?.count || 0;
      conteggi.categorie_movimenti = (await queryOne('SELECT COUNT(*) as count FROM categorie_movimenti WHERE user_id = $1', [userId]))?.count || 0;
      conteggi.categorie_anagrafiche = (await queryOne('SELECT COUNT(*) as count FROM categorie_anagrafiche WHERE user_id = $1', [userId]))?.count || 0;
    } catch (error) {
      logErrore('⚠️ Errore nel conteggio dati (continuo comunque)', error);
    }


    // 3. Elimina SOLO l'utente - il DB eliminerà tutto il resto via CASCADE
    console.log(`🗑️ Eliminazione utente ${userId} - CASCADE eliminerà tutti i dati collegati...`);
    
    const userResult = await query(
      'DELETE FROM utenti WHERE id = $1',
      [userId]
    );

    if (userResult.rowCount === 0) {
      throw new Error('Errore nell\'eliminazione dell\'utente');
    }

    console.log(`✅ Account ${userId} eliminato con successo (+ CASCADE)`);
    
    res.json({
      success: true,
      message: 'Account eliminato con successo',
      deleted_at: new Date().toISOString(),
      username: user.username,
      data_eliminati: conteggi,
      note: 'Eliminazione automatica via CASCADE del database'
    });

  } catch (error) {
    logErrore('❌ Errore eliminazione account', error);
    res.status(500).json({ 
      error: 'Errore durante l\'eliminazione dell\'account'
    });
  }
});

// GET /api/auth/account/stats - Statistiche per preview eliminazione
router.get('/account/stats', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    console.log(`📊 Richiesta statistiche account per utente ${userId}`);

    const stats = await queryOne(`
      SELECT 
        (SELECT COUNT(*) FROM movimenti WHERE user_id = $1) as movimenti,
        (SELECT COUNT(*) FROM anagrafiche WHERE user_id = $1) as anagrafiche,
        (SELECT COUNT(*) FROM conti_correnti WHERE user_id = $1) as conti,
        (SELECT COUNT(*) FROM tipologie_anagrafiche WHERE user_id = $1) as tipologie,
        (SELECT COUNT(*) FROM categorie_movimenti WHERE user_id = $1) as categorie_movimenti,
        (SELECT COUNT(*) FROM categorie_anagrafiche WHERE user_id = $1) as categorie_anagrafiche,
        (SELECT created_at FROM utenti WHERE id = $1) as account_created,
        (SELECT username FROM utenti WHERE id = $1) as username
    `, [userId]);

    // Calcola totale categorie
    stats.categorie_totali = parseInt(stats.categorie_movimenti || 0) + parseInt(stats.categorie_anagrafiche || 0);

    console.log(`📊 Statistiche inviate per utente ${userId}`);
    res.json(stats);
    
  } catch (error) {
    logErrore('❌ Errore nel recupero statistiche', error);
    res.status(500).json({ error: 'Errore nel recupero delle statistiche' });
  }
});

module.exports = router;

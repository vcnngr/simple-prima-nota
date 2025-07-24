// Aggiungi questi endpoint a routes/auth.js o crea routes/backup.js

// GET /api/auth/backup/export - Export completo dati utente
router.get('/backup/export', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`📦 Creazione backup completo per utente ${userId}`);

    // Recupera tutti i dati dell'utente
    const backup = {
      metadata: {
        export_date: new Date().toISOString(),
        user_id: userId,
        version: '1.0',
        app_name: 'Prima Nota Contabile'
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
    backup.user = await queryOne(`
      SELECT id, username, email, created_at, updated_at
      FROM utenti WHERE id = $1
    `, [userId]);

    // 2. Conti correnti
    backup.conti_correnti = await queryAll(`
      SELECT id, nome_banca, intestatario, iban, saldo_iniziale, attivo, created_at, updated_at
      FROM conti_correnti WHERE user_id = $1
      ORDER BY created_at
    `, [userId]);

    // 3. Tipologie anagrafiche
    backup.tipologie_anagrafiche = await queryAll(`
      SELECT id, nome, descrizione, tipo_movimento_default, colore, icona, attiva, created_at, updated_at
      FROM tipologie_anagrafiche WHERE user_id = $1
      ORDER BY created_at
    `, [userId]);

    // 4. Categorie anagrafiche
    backup.categorie_anagrafiche = await queryAll(`
      SELECT id, nome, descrizione, colore, attiva, created_at, updated_at
      FROM categorie_anagrafiche WHERE user_id = $1
      ORDER BY created_at
    `, [userId]);

    // 5. Categorie movimenti
    backup.categorie_movimenti = await queryAll(`
      SELECT id, nome, tipo, descrizione, colore, attiva, created_at, updated_at
      FROM categorie_movimenti WHERE user_id = $1
      ORDER BY created_at
    `, [userId]);

    // 6. Anagrafiche
    backup.anagrafiche = await queryAll(`
      SELECT id, nome, tipologia_id, tipo_movimento_preferito, categoria, email, telefono, piva, indirizzo, attivo, created_at, updated_at
      FROM anagrafiche WHERE user_id = $1
      ORDER BY created_at
    `, [userId]);

    // 7. Movimenti
    backup.movimenti = await queryAll(`
      SELECT id, data, anagrafica_id, conto_id, descrizione, categoria, importo, tipo, note, created_at, updated_at
      FROM movimenti WHERE user_id = $1
      ORDER BY data, created_at
    `, [userId]);

    // 8. Alerts (se esistono)
    try {
      backup.alerts = await queryAll(`
        SELECT id, titolo, messaggio, tipo, priorita, letto, data_creazione, data_lettura, azione_link, azione_testo
        FROM alerts WHERE user_id = $1
        ORDER BY data_creazione
      `, [userId]);
    } catch (error) {
      console.log('📝 Tabella alerts non presente, saltata');
      backup.alerts = [];
    }

    // Statistiche per log
    const stats = {
      conti: backup.conti_correnti.length,
      tipologie: backup.tipologie_anagrafiche.length,
      anagrafiche: backup.anagrafiche.length,
      movimenti: backup.movimenti.length,
      categorie_totali: backup.categorie_anagrafiche.length + backup.categorie_movimenti.length
    };

    console.log(`✅ Backup creato:`, stats);

    // Calcola dimensione stimata
    const backupString = JSON.stringify(backup);
    const sizeInBytes = Buffer.byteLength(backupString, 'utf8');
    const sizeInMB = (sizeInBytes / 1024 / 1024).toFixed(2);

    // Headers per download
    const filename = `prima_nota_backup_${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Backup-Size', sizeInMB);
    res.setHeader('X-Backup-Stats', JSON.stringify(stats));

    res.json(backup);

  } catch (error) {
    console.error('❌ Errore export backup:', error);
    res.status(500).json({ 
      error: 'Errore durante l\'export del backup',
      details: error.message 
    });
  }
});

// POST /api/auth/backup/import - Import backup completo
router.post('/backup/import', auth, async (req, res) => {
  const { backupData, mode = 'replace' } = req.body; // mode: 'replace' | 'merge'
  const userId = req.user.id;

  if (!backupData) {
    return res.status(400).json({ error: 'Dati backup richiesti' });
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
      skipped: {
        duplicates: 0,
        invalid: 0
      },
      errors: []
    };

    // 2. Import in transazione
    await withTransaction(async (client) => {
      
      // Se modalità replace, elimina dati esistenti
      if (mode === 'replace') {
        console.log('🗑️ Modalità replace: eliminazione dati esistenti...');
        
        await client.query('DELETE FROM movimenti WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM anagrafiche WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM tipologie_anagrafiche WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM categorie_movimenti WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM categorie_anagrafiche WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM conti_correnti WHERE user_id = $1', [userId]);
        
        try {
          await client.query('DELETE FROM alerts WHERE user_id = $1', [userId]);
        } catch (e) {
          console.log('📝 Tabella alerts non presente, saltata');
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
        for (const conto of backupData.conti_correnti) {
          try {
            const result = await client.query(`
              INSERT INTO conti_correnti (user_id, nome_banca, intestatario, iban, saldo_iniziale, attivo)
              VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT (user_id, nome_banca) DO UPDATE SET
                intestatario = EXCLUDED.intestatario,
                iban = EXCLUDED.iban,
                saldo_iniziale = EXCLUDED.saldo_iniziale,
                attivo = EXCLUDED.attivo
              RETURNING id
            `, [userId, conto.nome_banca, conto.intestatario, conto.iban, conto.saldo_iniziale, conto.attivo]);
            
            idMappings.conti.set(conto.id, result.rows[0].id);
            results.imported.conti_correnti++;
          } catch (error) {
            results.errors.push(`Conto ${conto.nome_banca}: ${error.message}`);
          }
        }
      }

      // 4. Import tipologie anagrafiche
      if (backupData.tipologie_anagrafiche?.length) {
        for (const tipologia of backupData.tipologie_anagrafiche) {
          try {
            const result = await client.query(`
              INSERT INTO tipologie_anagrafiche (user_id, nome, descrizione, tipo_movimento_default, colore, icona, attiva)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              ON CONFLICT (user_id, nome) DO UPDATE SET
                descrizione = EXCLUDED.descrizione,
                tipo_movimento_default = EXCLUDED.tipo_movimento_default,
                colore = EXCLUDED.colore,
                icona = EXCLUDED.icona,
                attiva = EXCLUDED.attiva
              RETURNING id
            `, [userId, tipologia.nome, tipologia.descrizione, tipologia.tipo_movimento_default, 
                tipologia.colore, tipologia.icona, tipologia.attiva]);
            
            idMappings.tipologie.set(tipologia.id, result.rows[0].id);
            results.imported.tipologie_anagrafiche++;
          } catch (error) {
            results.errors.push(`Tipologia ${tipologia.nome}: ${error.message}`);
          }
        }
      }

      // 5. Import categorie
      if (backupData.categorie_anagrafiche?.length) {
        for (const categoria of backupData.categorie_anagrafiche) {
          try {
            await client.query(`
              INSERT INTO categorie_anagrafiche (user_id, nome, descrizione, colore, attiva)
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (user_id, nome) DO UPDATE SET
                descrizione = EXCLUDED.descrizione,
                colore = EXCLUDED.colore,
                attiva = EXCLUDED.attiva
            `, [userId, categoria.nome, categoria.descrizione, categoria.colore, categoria.attiva]);
            
            results.imported.categorie_anagrafiche++;
          } catch (error) {
            results.errors.push(`Categoria anagrafica ${categoria.nome}: ${error.message}`);
          }
        }
      }

      if (backupData.categorie_movimenti?.length) {
        for (const categoria of backupData.categorie_movimenti) {
          try {
            await client.query(`
              INSERT INTO categorie_movimenti (user_id, nome, tipo, descrizione, colore, attiva)
              VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT (user_id, nome) DO UPDATE SET
                tipo = EXCLUDED.tipo,
                descrizione = EXCLUDED.descrizione,
                colore = EXCLUDED.colore,
                attiva = EXCLUDED.attiva
            `, [userId, categoria.nome, categoria.tipo, categoria.descrizione, categoria.colore, categoria.attiva]);
            
            results.imported.categorie_movimenti++;
          } catch (error) {
            results.errors.push(`Categoria movimento ${categoria.nome}: ${error.message}`);
          }
        }
      }

      // 6. Import anagrafiche
      if (backupData.anagrafiche?.length) {
        for (const anagrafica of backupData.anagrafiche) {
          try {
            const tipologiaId = anagrafica.tipologia_id ? idMappings.tipologie.get(anagrafica.tipologia_id) : null;
            
            const result = await client.query(`
              INSERT INTO anagrafiche (user_id, nome, tipologia_id, tipo_movimento_preferito, categoria, email, telefono, piva, indirizzo, attivo)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              ON CONFLICT (user_id, nome) DO UPDATE SET
                tipologia_id = EXCLUDED.tipologia_id,
                tipo_movimento_preferito = EXCLUDED.tipo_movimento_preferito,
                categoria = EXCLUDED.categoria,
                email = EXCLUDED.email,
                telefono = EXCLUDED.telefono,
                piva = EXCLUDED.piva,
                indirizzo = EXCLUDED.indirizzo,
                attivo = EXCLUDED.attivo
              RETURNING id
            `, [userId, anagrafica.nome, tipologiaId, anagrafica.tipo_movimento_preferito, 
                anagrafica.categoria, anagrafica.email, anagrafica.telefono, anagrafica.piva, 
                anagrafica.indirizzo, anagrafica.attivo]);
            
            idMappings.anagrafiche.set(anagrafica.id, result.rows[0].id);
            results.imported.anagrafiche++;
          } catch (error) {
            results.errors.push(`Anagrafica ${anagrafica.nome}: ${error.message}`);
          }
        }
      }

      // 7. Import movimenti
      if (backupData.movimenti?.length) {
        for (const movimento of backupData.movimenti) {
          try {
            const anagraficaId = movimento.anagrafica_id ? idMappings.anagrafiche.get(movimento.anagrafica_id) : null;
            const contoId = idMappings.conti.get(movimento.conto_id);
            
            if (!contoId) {
              results.errors.push(`Movimento ${movimento.descrizione}: conto non trovato`);
              continue;
            }
            
            await client.query(`
              INSERT INTO movimenti (user_id, data, anagrafica_id, conto_id, descrizione, categoria, importo, tipo, note)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [userId, movimento.data, anagraficaId, contoId, movimento.descrizione, 
                movimento.categoria, movimento.importo, movimento.tipo, movimento.note]);
            
            results.imported.movimenti++;
          } catch (error) {
            results.errors.push(`Movimento ${movimento.descrizione}: ${error.message}`);
          }
        }
      }

      // 8. Import alerts (opzionale)
      if (backupData.alerts?.length) {
        for (const alert of backupData.alerts) {
          try {
            await client.query(`
              INSERT INTO alerts (user_id, titolo, messaggio, tipo, priorita, letto, data_creazione, azione_link, azione_testo)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [userId, alert.titolo, alert.messaggio, alert.tipo, alert.priorita, alert.letto, 
                alert.data_creazione, alert.azione_link, alert.azione_testo]);
            
            results.imported.alerts++;
          } catch (error) {
            console.log('Alert import error (ignorato):', error.message);
          }
        }
      }
    });

    console.log('✅ Import backup completato:', results.imported);
    res.json({
      success: true,
      message: 'Import backup completato con successo',
      results
    });

  } catch (error) {
    console.error('❌ Errore import backup:', error);
    res.status(500).json({ 
      error: 'Errore durante l\'import del backup',
      details: error.message 
    });
  }
});

// Funzione validazione backup
function validateBackup(backupData) {
  const errors = [];

  // Verifica struttura base
  if (!backupData.metadata) {
    errors.push('Metadata mancanti');
  }

  if (!backupData.user) {
    errors.push('Dati utente mancanti');
  }

  // Verifica versione
  if (backupData.metadata?.version && backupData.metadata.version !== '1.0') {
    errors.push('Versione backup non supportata');
  }

  // Verifica app
  if (backupData.metadata?.app_name && !backupData.metadata.app_name.includes('Prima Nota')) {
    errors.push('Backup non compatibile con Prima Nota');
  }

  // Verifica coerenza dati
  if (backupData.movimenti?.length) {
    const contiIds = new Set(backupData.conti_correnti?.map(c => c.id) || []);
    const anagraficheIds = new Set(backupData.anagrafiche?.map(a => a.id) || []);
    
    for (const movimento of backupData.movimenti) {
      if (!contiIds.has(movimento.conto_id)) {
        errors.push(`Movimento fa riferimento a conto inesistente: ${movimento.conto_id}`);
        break; // Stop dopo primo errore per evitare spam
      }
      
      if (movimento.anagrafica_id && !anagraficheIds.has(movimento.anagrafica_id)) {
        errors.push(`Movimento fa riferimento ad anagrafica inesistente: ${movimento.anagrafica_id}`);
        break;
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

module.exports = router;
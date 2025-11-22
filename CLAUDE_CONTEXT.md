# Context Document per Claude Code

Questo documento fornisce il contesto completo del progetto per continuare lo sviluppo con Claude Code su un nuovo ambiente.

## Panoramica Progetto

**Nome**: Simple Prima Nota
**Tipo**: Sistema di contabilità con gestione commercialisti
**Stack**: React + Express + PostgreSQL + Podman/Docker
**Stato**: In sviluppo attivo - sistema funzionante

## Architettura

```
simple-prima-nota/
├── frontend/          # React app (porta 3000)
├── backend/           # Express API (porta 3001)
├── database/          # Script PostgreSQL
├── docker-compose.yml # Orchestrazione Podman/Docker
└── database_export.sql # Dump completo del database
```

## Utenti del Sistema

Il sistema ha DUE tipi di utenti con autenticazioni separate:

### 1. Utenti Normali (tabella: `utenti`)
- Gestiscono la propria prima nota (movimenti contabili)
- Possono collegarsi a un commercialista
- Token JWT salvato come: `token` in localStorage
- **Test account**: `demo` / `password`

### 2. Commercialisti (tabella: `commercialisti`)
- Vedono i dati di tutti i clienti collegati
- Dashboard aggregata
- Chat con i clienti
- Token JWT salvato come: `commercialista_token` in localStorage
- **Test account**: `mario.rossi` / `password`

## Database Schema Principale

### Tabelle Core
- `utenti` - Utenti normali del sistema
- `commercialisti` - Account commercialisti
- `movimenti` - Movimenti contabili (entrate/uscite)
- `categorie` - Categorie per classificare movimenti
- `collegamenti_commercialista` - Relazione N:N tra utenti e commercialisti
- `messaggi_commercialista` - Sistema di messaggistica

### Relazioni Importanti
```sql
collegamenti_commercialista (
  id,
  user_id -> utenti(id),
  commercialista_id -> commercialisti(id),
  attivo BOOLEAN
)

messaggi_commercialista (
  id,
  collegamento_id -> collegamenti_commercialista(id),
  mittente_tipo ENUM('user', 'commercialista'),
  messaggio TEXT,
  letto BOOLEAN
)
```

## Funzionalità Implementate

### Per Utenti
✅ Dashboard con saldo corrente
✅ Gestione movimenti (CRUD)
✅ Gestione categorie
✅ Export dati (CSV, Excel, PDF)
✅ Collegamento a commercialista
✅ Chat con il proprio commercialista
✅ Badge messaggi non letti in sidebar

### Per Commercialisti
✅ Dashboard con tutti i clienti
✅ Vista dettagliata per singolo cliente
✅ Accesso ai movimenti dei clienti
✅ Chat list (elenco clienti)
✅ Chat individuale con ogni cliente
✅ Badge messaggi non letti in sidebar

## Ultime Modifiche Implementate

### Fix Critici (Ultima Sessione)

1. **Bug autenticazione commercialisti** (`backend/middleware/auth.js`)
   - Problema: JWT commercialisti venivano interpretati come utenti
   - Fix: Controllo campo `tipo` nel token per distinguere user/commercialista
   - Codice chiave:
   ```javascript
   if (decoded.tipo === 'commercialista') {
     // Cerca solo in commercialisti
     const commercialista = await queryOne(...);
   } else {
     // Cerca in utenti
     const user = await queryOne(...);
   }
   ```

2. **Chat commercialisti - userId in POST/PUT**
   - Problema: POST/PUT non passavano parametro userId
   - Fix: Passare userId come query parameter in tutti i metodi
   - File modificati:
     - `frontend/src/services/api.js` - aggiunti params a send/markAsRead/markAllAsRead
     - `frontend/src/pages/Messaggi/ChatPage.js` - passare `{userId}` in tutte le chiamate

3. **Notifiche messaggi non letti**
   - Nuovo endpoint: `GET /api/messaggi/unread-count`
   - Badge rosso in sidebar (aggiornamento ogni 30s)
   - File modificati:
     - `backend/routes/messaggi.js` - nuovo endpoint
     - `frontend/src/components/Layout/CommercialistaSidebar.js` - stato unreadCount + polling
     - `frontend/src/components/Layout/Sidebar.js` - stato unreadCount + polling
   - Implementazione badge:
   ```javascript
   useEffect(() => {
     loadUnreadCount();
     const interval = setInterval(loadUnreadCount, 30000);
     return () => clearInterval(interval);
   }, []);
   ```

4. **UI Chat più compatta**
   - Textarea ridotto: rows da 3 a 2
   - Padding form ridotto: py-4 a py-3
   - File: `frontend/src/pages/Messaggi/ChatPage.js`

### Commit Recenti
- `84b6a75` - feat(messaging): add unread message counter and improve auth routing
- `ff5da47` - fix(db): Improve connection pool configuration for stability
- `472e70b` - feat(chat): Add chat list page for commercialista

## Configurazione Ambiente

### Backend `.env` Required
```env
DB_HOST=db
DB_PORT=5432
DB_NAME=prima_nota
DB_USER=postgres
DB_PASSWORD=password123
JWT_SECRET=your_super_secret_key_change_in_production_123456789
PORT=3001
```

### Frontend `.env` (opzionale)
```env
REACT_APP_API_URL=/api
```

## Comandi Utili

### Sviluppo Locale (Podman/Docker)
```bash
# Avvia tutti i servizi
podman-compose up -d

# Rebuild frontend dopo modifiche
podman-compose up -d --build frontend

# Rebuild backend dopo modifiche
podman-compose up -d --build backend

# Logs
podman logs -f prima_nota_backend
podman logs -f prima_nota_frontend

# Accesso container
podman exec -it prima_nota_backend sh
```

### Database
```bash
# Export database
podman exec prima_nota_db pg_dump -U postgres prima_nota > database_export.sql

# Import database
podman exec -i prima_nota_db psql -U postgres prima_nota < database_export.sql

# Accesso psql
podman exec -it prima_nota_db psql -U postgres prima_nota
```

## Problemi Risolti da Ricordare

### 1. Build Cache Docker
**Sintomo**: Modifiche al codice non si vedono dopo rebuild
**Causa**: Docker usa cache delle layer
**Soluzione**:
```bash
podman rmi -f localhost/simple-prima-nota_frontend:latest
podman-compose up -d --build --no-cache frontend
```

### 2. Spazio Disco
**Sintomo**: "no space left on device" durante build
**Soluzione**:
```bash
podman system prune -a -f --volumes
```

### 3. Token JWT Collision
**Sintomo**: Commercialista vede errori come se fosse user
**Causa**: Middleware non distingueva tipo utente
**Fix**: Controllo `decoded.tipo` prima di query database

### 4. Parametri POST/PUT con Axios
**Sintomo**: GET funziona, POST/PUT no
**Causa**: Axios gestisce params diversamente per metodi diversi
**Fix**: Passare esplicitamente `{ params }` come terzo argomento
```javascript
api.post('/messaggi', { messaggio }, { params: { userId } })
```

## Testing Rapido

Per verificare che tutto funzioni:

1. **Login utente**: http://localhost:3000 - `demo` / `password`
2. **Login commercialista**: http://localhost:3000/commercialista/login - `mario.rossi` / `password`
3. **Adminer DB**: http://localhost:8080 - postgres / password123
4. **API Backend**: http://localhost:3001 (dovrebbe rispondere)

## Note Importanti per Claude

1. **Deployment**: Quando modifichi codice frontend/backend, devi sempre fare rebuild del container Docker
2. **File .env**: Non sono committati su Git, vanno ricreati manualmente
3. **Database**: Usa il file `database_export.sql` per ripristinare i dati
4. **Port Conflicts**: Se porte 3000/3001/5432/8080 sono occupate, modifica `docker-compose.yml`
5. **Podman vs Docker**: Il progetto usa `podman-compose` ma funziona anche con `docker-compose`

## File Chiave Modificati Recentemente

1. `backend/middleware/auth.js` - Fix autenticazione tipo utente
2. `backend/routes/messaggi.js` - Endpoint unread-count + logging
3. `frontend/src/services/api.js` - API con params per POST/PUT
4. `frontend/src/pages/Messaggi/ChatPage.js` - Form compatto + params
5. `frontend/src/components/Layout/CommercialistaSidebar.js` - Badge unread
6. `frontend/src/components/Layout/Sidebar.js` - Badge unread
7. `frontend/src/pages/Commercialista/ChatListPage.js` - Lista clienti per chat

## Branch Git Attuale

**Branch**: `feature/commercialisti-system`
**Remote**: origin (GitHub)
**Stato**: Tutti i commit pushati

## Prossimi Sviluppi Possibili

- [ ] Reset password / recupero credenziali
- [ ] Notifiche real-time (WebSocket)
- [ ] Report avanzati per commercialisti
- [ ] Multi-commercialista per singolo utente
- [ ] Backup automatico database
- [ ] Logging avanzato e monitoring
- [ ] Test automatizzati (Jest/Cypress)
- [ ] Paginazione movimenti
- [ ] Filtri avanzati dashboard

## Contatti Repository

- **GitHub**: https://github.com/vcnngr/simple-prima-nota
- **Branch**: feature/commercialisti-system

---

**Ultimo aggiornamento**: 2025-11-14
**Versione documento**: 1.0

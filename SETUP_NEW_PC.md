# Setup su Nuovo PC - Guida Completa

Questa guida ti permette di ricreare l'intero ambiente di sviluppo su un nuovo computer.

## Prerequisiti

### Software Richiesto
- **Git**: Per clonare il repository
- **Podman** o **Docker**: Per i container
  - Con Podman: installa anche `podman-compose`
  - Con Docker: installa anche `docker-compose`
- **Claude Code**: CLI di Anthropic (opzionale ma consigliato)

### Verifica Installazione
```bash
git --version
podman --version  # oppure docker --version
podman-compose --version  # oppure docker-compose --version
```

## Passo 1: Clonare il Repository

```bash
# Clona il repository
git clone https://github.com/vcnngr/simple-prima-nota.git
cd simple-prima-nota

# Passa al branch di sviluppo
git checkout feature/commercialisti-system

# Verifica i file
ls -la
# Dovresti vedere: backend/ frontend/ database/ docker-compose.yml
```

## Passo 2: Configurare File .env

### Backend Environment
Crea il file `backend/.env`:

```bash
cat > backend/.env << 'EOF'
DB_HOST=db
DB_PORT=5432
DB_NAME=prima_nota
DB_USER=postgres
DB_PASSWORD=password123
JWT_SECRET=your_super_secret_key_change_in_production_123456789
PORT=3001
EOF
```

### Frontend Environment (opzionale)
Crea il file `frontend/.env`:

```bash
cat > frontend/.env << 'EOF'
REACT_APP_API_URL=/api
EOF
```

## Passo 3: Avviare i Container

### Con Podman
```bash
# Avvia tutti i servizi
podman-compose up -d

# Verifica che tutti i container siano running
podman ps
# Dovresti vedere: prima_nota_db, prima_nota_backend, prima_nota_frontend, prima_nota_adminer
```

### Con Docker
```bash
# Sostituisci "podman" con "docker" in tutti i comandi
docker-compose up -d
docker ps
```

### Tempo di Attesa
Il primo avvio richiede tempo per:
- Download immagini Docker (postgres, node, nginx)
- Build backend e frontend (~5-10 minuti)
- Inizializzazione database

## Passo 4: Importare il Database

### Opzione A: Se hai database_export.sql nel repository

```bash
# Attendi che il database sia healthy (circa 30 secondi)
podman ps | grep prima_nota_db
# Dovresti vedere "healthy" nello status

# Importa i dati
podman exec -i prima_nota_db psql -U postgres prima_nota < database_export.sql
```

### Opzione B: Esportare dal PC vecchio

**Sul PC vecchio:**
```bash
cd simple-prima-nota
podman exec prima_nota_db pg_dump -U postgres prima_nota > database_export.sql

# Copia questo file sul nuovo PC (USB, email, cloud, etc.)
```

**Sul PC nuovo:**
```bash
# Dopo aver copiato database_export.sql nella directory del progetto
podman exec -i prima_nota_db psql -U postgres prima_nota < database_export.sql
```

### Opzione C: Usare script database/init.sql

Se non hai il dump, usa gli script di inizializzazione:

```bash
# Gli script in database/ verranno eseguiti automaticamente
# al primo avvio del container PostgreSQL

# Però NON avrai i dati di test, solo le tabelle vuote
# Dovrai creare manualmente utenti e commercialisti
```

## Passo 5: Verificare il Funzionamento

### Test Accessibilità
Apri nel browser:

1. **Frontend**: http://localhost:3000
   - Dovresti vedere la pagina di login

2. **Backend API**: http://localhost:3001
   - Dovrebbe rispondere (anche con errore 404 è ok, significa che è up)

3. **Adminer** (gestione DB): http://localhost:8080
   - Server: `db`
   - Username: `postgres`
   - Password: `password123`
   - Database: `prima_nota`

### Test Login (se hai importato il database)

#### Utente Normale
- URL: http://localhost:3000
- Username: `demo`
- Password: `password`
- Dovresti accedere alla dashboard con saldo e movimenti

#### Commercialista
- URL: http://localhost:3000/commercialista/login
- Username: `mario.rossi`
- Password: `password`
- Dovresti accedere alla dashboard commercialista con elenco clienti

### Test Chat e Badge
1. Login come utente `demo`
2. Guarda la sidebar a sinistra - dovresti vedere la voce "Chat"
3. Se ci sono messaggi non letti, vedrai un badge rosso con il numero
4. Login come commercialista `mario.rossi`
5. Vai su "Chat" - dovresti vedere l'elenco clienti
6. Clicca su un cliente per aprire la chat

## Passo 6: Continuare con Claude Code

### Fornire Contesto a Claude
Quando apri una nuova sessione di Claude Code:

```bash
# Nella directory del progetto
cd simple-prima-nota

# Avvia Claude Code
claude

# Poi invia a Claude:
"Ho clonato il progetto simple-prima-nota sul nuovo PC.
Leggi il file CLAUDE_CONTEXT.md per avere tutto il contesto del progetto."
```

Claude leggerà automaticamente il documento e avrà tutte le informazioni necessarie su:
- Architettura del sistema
- Ultime modifiche implementate
- Problemi risolti
- Comandi utili

### Comandi Utili per lo Sviluppo

```bash
# Vedere i log in real-time
podman logs -f prima_nota_backend
podman logs -f prima_nota_frontend

# Restart dopo modifiche backend
podman restart prima_nota_backend

# Rebuild frontend dopo modifiche
podman-compose up -d --build frontend

# Rebuild backend dopo modifiche
podman-compose up -d --build backend

# Accedere al container per debug
podman exec -it prima_nota_backend sh
podman exec -it prima_nota_frontend sh

# Vedere tutti i container
podman ps -a

# Stop tutti i servizi
podman-compose down

# Stop e rimuovi volumi (ATTENZIONE: cancella DB!)
podman-compose down -v
```

## Troubleshooting

### Problema: Porte già in uso
**Sintomo**: Errore "address already in use"

**Soluzione**: Modifica le porte in `docker-compose.yml`
```yaml
# Esempio: cambia 3000 -> 3100
ports:
  - "3100:80"  # invece di "3000:80"
```

### Problema: Build fallisce per spazio disco
**Sintomo**: "no space left on device"

**Soluzione**:
```bash
# Pulisci immagini e container vecchi
podman system prune -a -f --volumes
# oppure
docker system prune -a -f --volumes

# Libera spazio (può rimuovere GB di dati!)
```

### Problema: Container non parte
**Sintomo**: Container in stato "Exited"

**Soluzione**:
```bash
# Vedi i log per capire l'errore
podman logs prima_nota_backend
podman logs prima_nota_frontend

# Controlla che i file .env esistano
ls -la backend/.env
ls -la frontend/.env

# Ricostruisci da zero
podman-compose down
podman-compose up -d --build
```

### Problema: Database vuoto dopo import
**Sintomo**: Login non funziona, nessun dato

**Soluzione**:
```bash
# Verifica che l'import sia andato a buon fine
podman exec -it prima_nota_db psql -U postgres prima_nota

# In psql:
\dt  -- Lista tabelle (dovresti vederne molte)
SELECT COUNT(*) FROM utenti;  -- Dovrebbe essere > 0
SELECT COUNT(*) FROM commercialisti;  -- Dovrebbe essere > 0
\q  -- Esci

# Se le tabelle sono vuote, reimporta:
podman exec -i prima_nota_db psql -U postgres prima_nota < database_export.sql
```

### Problema: Modifiche al codice non si vedono
**Sintomo**: Cambi un file ma nel browser non cambia nulla

**Soluzione**:
```bash
# Frontend: rebuild completo
podman rmi -f localhost/simple-prima-nota_frontend:latest
podman-compose up -d --build --no-cache frontend

# Backend: restart container
podman restart prima_nota_backend

# Browser: Hard refresh
# Chrome/Firefox: Ctrl+F5 (Windows/Linux) o Cmd+Shift+R (Mac)
```

### Problema: No space left in /run/user/1000
**Sintomo**: Errore sui permessi di Podman

**Soluzione**:
```bash
# Aumenta limite tmpfs
sudo loginctl enable-linger $USER

# Oppure usa Docker invece di Podman
# Sostituisci podman-compose con docker-compose
```

## Riferimenti Rapidi

### URL Applicazione
- **Frontend Utente**: http://localhost:3000
- **Frontend Commercialista**: http://localhost:3000/commercialista/login
- **Backend API**: http://localhost:3001
- **Adminer**: http://localhost:8080

### Credenziali Test (se hai importato il database)
| Tipo | Username | Password | Note |
|------|----------|----------|------|
| Utente | demo | password | Utente con movimenti di test |
| Commercialista | mario.rossi | password | Ha 2-3 clienti collegati |
| Database | postgres | password123 | Per Adminer |

### Porte Utilizzate
- 3000: Frontend (Nginx)
- 3001: Backend (Express)
- 5432: PostgreSQL
- 8080: Adminer

### File Importanti
- `backend/.env` - Configurazione backend (DA CREARE MANUALMENTE)
- `frontend/.env` - Configurazione frontend (opzionale)
- `database_export.sql` - Dump completo database (se disponibile)
- `CLAUDE_CONTEXT.md` - Contesto per Claude Code
- `docker-compose.yml` - Orchestrazione container

## Metodi Alternativi di Trasferimento

### 1. Solo Git (no database)
```bash
git clone https://github.com/vcnggr/simple-prima-nota.git
# Pro: Veloce
# Contro: Database vuoto, devi creare utenti manualmente
```

### 2. Git + Database separato
```bash
git clone https://github.com/vcnngr/simple-prima-nota.git
# Copia database_export.sql tramite USB/cloud/email
# Pro: Hai tutto
# Contro: Due step separati
```

### 3. Tar.gz completo
```bash
# Sul PC vecchio
cd /home/vcnngr
tar -czf prima-nota-backup.tar.gz simple-prima-nota --exclude=node_modules --exclude=.git

# Sul PC nuovo
tar -xzf prima-nota-backup.tar.gz
cd simple-prima-nota
git pull origin feature/commercialisti-system  # Risincronizza con Git
```

## Risorse

- **Repository GitHub**: https://github.com/vcnngr/simple-prima-nota
- **Branch di Sviluppo**: feature/commercialisti-system
- **Documentazione Podman**: https://podman.io/
- **Documentazione Docker**: https://docs.docker.com/

---

## Checklist Setup Completo

- [ ] Git clonato e branch corretto
- [ ] File `backend/.env` creato
- [ ] File `frontend/.env` creato (opzionale)
- [ ] Container avviati con `podman-compose up -d`
- [ ] Tutti i container sono "Up" (verifica con `podman ps`)
- [ ] Database importato (opzionale)
- [ ] Frontend raggiungibile su http://localhost:3000
- [ ] Login funziona (se hai importato il database)
- [ ] Chat visibile (se hai importato il database)

Se tutti i punti sono ✅, sei pronto per sviluppare!

---

**Ultimo aggiornamento**: 2025-11-14
**Tempo stimato setup**: 15-30 minuti (prima volta)

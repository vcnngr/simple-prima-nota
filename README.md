# Prima Nota - Sistema di Gestione Contabile

![Prima Nota Logo](https://img.shields.io/badge/Prima%20Nota-v1.0.0-blue)
![Docker](https://img.shields.io/badge/Docker-Ready-green)
![React](https://img.shields.io/badge/React-18.2.0-blue)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)

Un sistema semplificato per la gestione della prima nota contabile personale/aziendale, progettato per essere **SEMPLICE** e **PRATICO**.

## 🚀 Caratteristiche Principali

### ✅ Funzionalità Core
- **Gestione Conti Correnti** - Crea e gestisci multipli conti bancari
- **Anagrafica Clienti/Fornitori** - CRUD completo con categorizzazione
- **Movimenti Semplificati** - Registrazione veloce entrate/uscite (NO partita doppia)
- **Dashboard Intuitiva** - Panoramica saldi, movimenti recenti, statistiche
- **Reports Avanzati** - Estratti conto, analisi per periodo, export CSV/Excel/PDF
- **Sistema Utenti** - Autenticazione JWT sicura

### 🎯 Target Workflow
**"3 click per registrare un movimento"**
1. Login → Dashboard con panoramica
2. "Nuovo Movimento" → Selezioni cliente, inserisci importo → Fatto
3. Report → Filtri semplici → Export diretto

## 📋 Requisiti Sistema

- **Docker** e **Docker Compose**
- **Node.js 18+** (per sviluppo locale)
- **PostgreSQL 16** (incluso nel setup Docker)

## 🏗️ Architettura

```
prima-nota/
├── web/               # Frontend: Vite + React 19 (servito da nginx)
├── backend/           # Node.js + Express API
├── database/          # PostgreSQL Schema & Data
├── docker-compose.yml # Orchestrazione servizi
└── README.md         # Questa documentazione
```

### Stack Tecnologico
- **Frontend**: React 19, Vite, Tailwind CSS 4, TanStack Query, React Router 7
- **Backend**: Node.js, Express.js, PostgreSQL, JWT Auth
- **Database**: PostgreSQL 16 con funzioni custom
- **DevOps**: Docker, Docker Compose, Nginx

## 🚀 Quick Start

### 1. Clona il Repository
```bash
git clone <repository-url>
cd prima-nota
```

### 2. Setup con Docker (Raccomandato)
```bash
# Avvia tutti i servizi
docker-compose up -d

# Verifica che tutto sia running
docker-compose ps
```

### 3. Accesso all'Applicazione
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001/api
- **Database Admin**: http://localhost:8080 (Adminer)

### 4. Primo accesso
Registra un account da http://localhost:3000/register. Gli account `admin` e `demo`
creati da `init.sql` vengono bloccati dalla migrazione 011 (password casuale): le loro
password sono pubbliche nel repository.

## 🛠️ Sviluppo Locale

### Setup Backend
```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

### Setup Frontend
```bash
cd web
npm install
npm run dev   # /api va al backend su localhost:3001 (BACKEND=... per cambiarlo)
```

### Setup Database
```bash
# Crea database PostgreSQL locale
createdb prima_nota
# schema e migrazioni: crea tutto su un database vuoto, aggiorna uno esistente
PGDATABASE=prima_nota ./database/migra.sh
```

## 📊 Schema Database

### Tabelle Principali
- **utenti** - Gestione account utente
- **conti_correnti** - Conti bancari dell'utente
- **anagrafiche** - Clienti e fornitori
- **movimenti** - Entrate e uscite semplificate

### Funzioni Custom
- `calcola_saldo_conto(id)` - Calcola saldo corrente dinamicamente
- `update_updated_at_column()` - Trigger per timestamp automatici

## 🔧 API Endpoints

### Autenticazione
- `POST /api/auth/login` - Login utente
- `POST /api/auth/register` - Registrazione
- `GET /api/auth/verify` - Verifica token

### Conti Bancari
- `GET /api/conti-bancari` - Lista conti
- `POST /api/conti-bancari` - Crea nuovo conto
- `PUT /api/conti-bancari/:id` - Aggiorna conto
- `DELETE /api/conti-bancari/:id` - Elimina conto

### Anagrafiche
- `GET /api/anagrafiche` - Lista clienti/fornitori
- `GET /api/anagrafiche/categorie` - Lista categorie
- `POST /api/anagrafiche` - Crea anagrafica
- `PUT /api/anagrafiche/:id` - Aggiorna anagrafica

### Movimenti
- `GET /api/movimenti` - Lista movimenti (con filtri)
- `POST /api/movimenti` - Crea movimento
- `POST /api/movimenti/bulk` - Creazione multipla
- `PUT /api/movimenti/:id` - Aggiorna movimento

### Dashboard & Reports
- `GET /api/dashboard` - Dashboard completa
- `GET /api/dashboard/kpi` - KPI principali
- `GET /api/reports/estratto-conto` - Estratto conto
- `GET /api/reports/entrate-vs-uscite` - Report comparativo

## 📈 Funzionalità Avanzate

### Import/Export
- **Template CSV** - Download template per import movimenti
- **Export CSV** - Esportazione dati in formato CSV
- **Export Excel** - Esportazione avanzata in XLSX
- **Export PDF** - Report formattati per stampa

### Dashboard Analytics
- **Saldi in tempo reale** - Calcolo dinamico saldi conti
- **Grafici interattivi** - Andamento mensile entrate/uscite
- **Top clienti/fornitori** - Classifiche per volume movimenti
- **Alerts intelligenti** - Notifiche per saldi negativi, conti inattivi

### Mobile Responsive
- **Design mobile-first** - Interfaccia ottimizzata per smartphone
- **Touch-friendly** - Controlli ottimizzati per touch
- **Offline-ready** - Cache intelligente per dati critici

## 🔒 Sicurezza

### Backend Security
- **JWT Authentication** - Token sicuri con scadenza
- **Rate Limiting** - Protezione contro spam/bruteforce
- **Input Validation** - Validazione Joi per tutti i dati
- **SQL Injection Protection** - Query parametrizzate
- **CORS Configuration** - Accesso controllato alle API

### Frontend Security
- **XSS Protection** - Sanitizzazione input utente
- **CSRF Protection** - Token anti-forgery
- **Secure Headers** - Headers di sicurezza HTTP
- **Environment Variables** - Configurazione sicura

## 🐳 Deploy con Docker

### Produzione
```bash
# Build e avvio
docker-compose -f docker-compose.prod.yml up -d

# Scaling
docker-compose scale backend=3

# Logs
docker-compose logs -f backend
```

### Backup Database
```bash
# Backup automatico
docker-compose exec db pg_dump -U postgres prima_nota > backup.sql

# Restore
docker-compose exec -T db psql -U postgres prima_nota < backup.sql
```

## 🧪 Testing

### Backend Tests
```bash
cd backend
npm test
npm run test:coverage
```

### Frontend
Nessuna suite di test: le prove sono gli smoke in `scripts/smoke/` (browser Chrome headless con
`scripts/smoke/lib/cdp.mjs`).

## 📝 Licenza

Questo progetto è rilasciato sotto licenza MIT. Vedi il file `LICENSE` per i dettagli.

## 🤝 Contribuire

1. Fork del progetto
2. Crea feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit delle modifiche (`git commit -m 'Add some AmazingFeature'`)
4. Push del branch (`git push origin feature/AmazingFeature`)
5. Apri una Pull Request

## 📞 Supporto

Per supporto e domande:
- 📧 Email: support@prima-nota.com
- 📖 Wiki: [Documentazione completa](docs/)
- 🐛 Issues: [GitHub Issues](issues/)

## 🔄 Changelog

### v1.0.0 (2024-01-15)
- ✅ Release iniziale
- ✅ Sistema completo di gestione movimenti
- ✅ Dashboard con analytics
- ✅ Export/Import CSV/Excel/PDF
- ✅ Responsive design
- ✅ Docker deployment ready

---

**Made with ❤️ per semplificare la contabilità di piccole imprese e professionisti**

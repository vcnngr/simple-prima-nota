# Prima Nota - Sistema di Gestione Contabile

![Prima Nota Logo](https://img.shields.io/badge/Prima%20Nota-v1.0.0-blue)
![Docker](https://img.shields.io/badge/Docker-Ready-green)
![React](https://img.shields.io/badge/React-18.2.0-blue)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)

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
- **PostgreSQL 15** (incluso nel setup Docker)

## 🏗️ Architettura

```
prima-nota/
├── frontend/          # React.js App
├── backend/           # Node.js + Express API
├── database/          # PostgreSQL Schema & Data
├── docker-compose.yml # Orchestrazione servizi
└── README.md         # Questa documentazione
```

### Stack Tecnologico
- **Frontend**: React.js 18, Tailwind CSS, React Query, Framer Motion
- **Backend**: Node.js, Express.js, PostgreSQL, JWT Auth
- **Database**: PostgreSQL 15 con funzioni custom
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

### 4. Credenziali Demo
```
Username: demo
Password: password
```

## 📁 Struttura Dettagliata del Progetto

```
prima-nota/
│
├── docker-compose.yml              # Orchestrazione Docker
├── README.md                       # Documentazione
│
├── database/
│   ├── init.sql                   # Schema database + dati di esempio
│   └── backup/                    # Scripts di backup
│
├── backend/
│   ├── package.json               # Dipendenze Node.js
│   ├── server.js                  # Entry point applicazione
│   ├── Dockerfile                 # Container setup
│   ├── .env.example              # Variabili ambiente
│   │
│   ├── config/
│   │   └── database.js           # Configurazione PostgreSQL
│   │
│   ├── middleware/
│   │   ├── auth.js               # Autenticazione JWT
│   │   └── validation.js         # Validazione dati Joi
│   │
│   ├── routes/
│   │   ├── auth.js               # Login/Register/Profile
│   │   ├── contiBancari.js       # Gestione conti correnti
│   │   ├── anagrafiche.js        # Clienti/Fornitori
│   │   ├── movimenti.js          # Entrate/Uscite
│   │   ├── dashboard.js          # KPI e statistiche
│   │   └── reports.js            # Estratti e export
│   │
│   └── utils/
│       ├── helpers.js            # Funzioni di utilità
│       └── constants.js          # Costanti applicazione
│
├── frontend/
│   ├── package.json              # Dipendenze React
│   ├── Dockerfile                # Container setup
│   ├── nginx.conf                # Configurazione Nginx
│   ├── tailwind.config.js        # Setup Tailwind CSS
│   │
│   ├── public/
│   │   ├── index.html
│   │   └── favicon.ico
│   │
│   └── src/
│       ├── App.js                # Componente principale
│       ├── index.js              # Entry point React
│       ├── index.css             # Stili globali
│       │
│       ├── components/
│       │   ├── Layout/
│       │   │   ├── Layout.js     # Layout principale
│       │   │   ├── Sidebar.js    # Navigazione laterale
│       │   │   └── Header.js     # Header con notifiche
│       │   │
│       │   ├── UI/               # Componenti riutilizzabili
│       │   │   ├── Button.js
│       │   │   ├── Card.js
│       │   │   ├── Modal.js
│       │   │   ├── Table.js
│       │   │   ├── LoadingSpinner.js
│       │   │   ├── Alert.js
│       │   │   └── Badge.js
│       │   │
│       │   ├── Forms/            # Form components
│       │   │   ├── MovimentoForm.js
│       │   │   ├── ContoForm.js
│       │   │   └── AnagraficaForm.js
│       │   │
│       │   └── Charts/           # Grafici dashboard
│       │       ├── SaldoChart.js
│       │       └── MovimentiChart.js
│       │
│       ├── pages/
│       │   ├── Auth/
│       │   │   ├── LoginPage.js
│       │   │   └── RegisterPage.js
│       │   │
│       │   ├── Dashboard/
│       │   │   └── DashboardPage.js
│       │   │
│       │   ├── ContiBancari/
│       │   │   └── ContiBancariPage.js
│       │   │
│       │   ├── Anagrafiche/
│       │   │   └── AnagrafichePage.js
│       │   │
│       │   ├── Movimenti/
│       │   │   └── MovimentiPage.js
│       │   │
│       │   ├── Reports/
│       │   │   └── ReportsPage.js
│       │   │
│       │   └── Profile/
│       │       └── ProfilePage.js
│       │
│       ├── contexts/
│       │   └── AuthContext.js    # Gestione autenticazione
│       │
│       ├── services/
│       │   └── api.js            # Chiamate API axios
│       │
│       ├── hooks/                # Custom React hooks
│       │   ├── useMovimenti.js
│       │   ├── useConti.js
│       │   └── useAnagrafiche.js
│       │
│       └── utils/
│           ├── formatters.js     # Formattazione dati
│           ├── constants.js      # Costanti frontend
│           └── helpers.js        # Funzioni utility
│
└── docs/                         # Documentazione aggiuntiva
    ├── api-documentation.md      # Documentazione API
    ├── user-guide.md            # Guida utente
    └── deployment.md            # Deploy in produzione
```

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
cd frontend
npm install
npm start
```

### Setup Database
```bash
# Crea database PostgreSQL locale
createdb prima_nota
psql prima_nota < database/init.sql
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

### Frontend Tests
```bash
cd frontend
npm test
npm run test:coverage
```

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

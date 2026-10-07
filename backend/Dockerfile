# Backend Dockerfile
FROM docker.io/library/node:24-alpine

# Imposta la directory di lavoro
WORKDIR /app

RUN apk add curl

# Copia package.json e package-lock.json
COPY package*.json ./

# Installa le sole dipendenze di produzione: jest, nodemon e supertest non
# servono a runtime e portano avvisi npm audit senza correzione a monte.
RUN npm install --omit=dev --no-fund --no-audit

# Copia il codice sorgente
COPY . .

# Crea un utente non-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Cartella degli allegati: esiste nell'immagine cosi' il volume nasce del
# proprietario giusto (un volume vuoto copia i permessi dalla cartella)
RUN mkdir -p /app/uploads/allegati

# Cambia proprietario dei file
RUN chown -R nodejs:nodejs /app
USER nodejs

# Esponi la porta
EXPOSE 3001

# Comando per avviare l'applicazione
CMD ["npm", "start"]

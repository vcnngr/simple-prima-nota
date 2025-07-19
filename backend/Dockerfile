# Backend Dockerfile
FROM node:18-alpine

# Imposta la directory di lavoro
WORKDIR /app

# Copia package.json e package-lock.json
COPY package*.json ./

# Installa le dipendenze
RUN npm ci

# Copia il codice sorgente
COPY . .

# Crea un utente non-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Cambia proprietario dei file
RUN chown -R nodejs:nodejs /app
USER nodejs

# Esponi la porta
EXPOSE 3001

# Comando per avviare l'applicazione
CMD ["npm", "start"]

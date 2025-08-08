# Frontend Dockerfile per produzione
FROM node:18-alpine AS build

# Imposta la directory di lavoro
WORKDIR /app

# Copia package.json e package-lock.json
COPY package*.json ./

# Installa le dipendenze
RUN npm install

# Copia il codice sorgente
COPY . .

# Build dell'applicazione
RUN npm run build

# Stage di produzione con Nginx
FROM nginx:alpine

# Rimuovi la configurazione di default
RUN rm /etc/nginx/conf.d/default.conf

# Copia i file di build
COPY --from=build /app/build /usr/share/nginx/html

# Copia configurazione Nginx con proxy API
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Esponi la porta 80
EXPOSE 80

# Comando per avviare Nginx
CMD ["nginx", "-g", "daemon off;"]

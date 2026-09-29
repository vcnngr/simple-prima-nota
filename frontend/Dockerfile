# Frontend Dockerfile per produzione
FROM docker.io/library/node:18-alpine AS build

# Imposta la directory di lavoro
WORKDIR /app

# Copia package.json e package-lock.json
COPY package*.json ./

# Installa le dipendenze
RUN npm install

# Copia il codice sorgente
COPY . .

# Build dell'applicazione con più memoria
ENV NODE_OPTIONS="--max-old-space-size=8192"
RUN npm run build

# Stage di produzione con Nginx
FROM docker.io/library/nginx:1.30-alpine

# Rimuovi la configurazione di default
RUN rm /etc/nginx/conf.d/default.conf

# Copia i file di build
COPY --from=build /app/build /usr/share/nginx/html

# Configurazione nginx: modello trasformato all'avvio dall'entrypoint dell'immagine
# (vedi l'intestazione di nginx/default.conf.template). Compose e Helm cambiano
# solo le variabili d'ambiente.
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
ENV BACKEND_UPSTREAM=backend:3001 \
    CLIENT_MAX_BODY_SIZE=11m \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

# Esponi la porta 80
EXPOSE 80

# Comando per avviare Nginx
CMD ["nginx", "-g", "daemon off;"]

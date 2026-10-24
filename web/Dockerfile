# Frontend (web/, dal blocco U6d): build di Vite servita da nginx.
FROM docker.io/library/node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# vite.config.js: file con hash in /static/, niente mappe dei sorgenti, niente
# script in linea (CSP script-src 'self').
RUN npm run build

FROM docker.io/library/nginx:1.30-alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Configurazione nginx: modello trasformato all'avvio dall'entrypoint dell'immagine
# (vedi l'intestazione di nginx/default.conf.template). Compose e Helm cambiano
# solo le variabili d'ambiente.
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
ENV BACKEND_UPSTREAM=backend:3001 \
    CLIENT_MAX_BODY_SIZE=11m \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

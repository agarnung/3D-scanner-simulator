# ====================
# Etapa 1: Compilación
# ====================

# Bajarnos la imagen Docker de Node.js (opciones: default, alpine, slim...) (ver https://hub.docker.com/_/node)
FROM node:latest AS builder

# Establecer el directorio de trabajo para cualquier comando RUN, CMD, ENTRYPOINT, COPY y ADD posterior
WORKDIR /app

# Copiar los archivos del proyecto, de su raíz al directorio de trabajo (CPOY foo /app == COPY foo ./)
COPY package*.json ./
COPY vite.config.js ./
COPY index.html ./
COPY ./src ./src
COPY ./scripts ./scripts
COPY ./public ./public
COPY ./assets ./assets

# Instalar las dependencias del proyecto (especificadas en package.json) 
# (ver https://stackoverflow.com/questions/43664200/what-is-the-difference-between-npm-install-and-npm-run-build)
RUN npm install 

# Ejecutar la construcción de Vite para generar la carpeta /app/dist
RUN npm run build

# ===================
# Etapa 2: Producción
# ===================

# Se podría servir la app web en una versión más liviana de Node.js (opciones: default, alpine, slim...) (ver https://hub.docker.com/_/node)
FROM node:alpine AS runner

WORKDIR /app

# Copiar a esta nueva imagen solo los archivos de producción
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/public ./public

# Instalar las dependencias de producción (express ya está en dependencies)
RUN npm install --omit=dev

# Exponer el puerto en el que se ejecutará nuestra app web
EXPOSE 8123

# Cuando el contenedor arranque, ejecutar el servidor personalizado
CMD ["node", "scripts/server.js"]
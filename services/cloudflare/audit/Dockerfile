FROM node:22-bookworm-slim
WORKDIR /app
ENV GEOCHECK_SERVER_NO_LISTEN=true
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY apps ./apps
COPY packages ./packages
COPY services ./services
COPY mock-api ./mock-api
EXPOSE 8080
CMD ["node", "services/cloudflare/audit/container-server.cjs"]

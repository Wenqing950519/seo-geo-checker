FROM node:22-bookworm-slim
WORKDIR /app
ENV GEOCHECK_SERVER_NO_LISTEN=true
ENV PLAYWRIGHT_BROWSERS_PATH=/app/node_modules/playwright-core/.local-browsers
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
RUN npx playwright install --with-deps chromium --only-shell
COPY apps ./apps
COPY packages ./packages
COPY services ./services
EXPOSE 8080
CMD ["node", "services/cloudflare/audit/container-server.cjs"]

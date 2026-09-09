FROM node:22-bookworm-slim
WORKDIR /app
ENV GEOCHECK_SERVER_NO_LISTEN=true
ENV PLAYWRIGHT_BROWSERS_PATH=/app/node_modules/playwright-core/.local-browsers
COPY package.json package-lock.json requirements.txt ./
RUN npm ci --ignore-scripts
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv \
  && rm -rf /var/lib/apt/lists/*
RUN npx playwright install --with-deps chromium --only-shell
RUN python3 -m venv .scrapling-runtime \
  && .scrapling-runtime/bin/pip install --disable-pip-version-check --no-cache-dir -r requirements.txt
COPY apps ./apps
COPY packages ./packages
COPY services ./services
EXPOSE 8080
CMD ["node", "services/cloudflare/audit/container-server.cjs"]

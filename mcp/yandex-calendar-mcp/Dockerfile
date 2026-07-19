FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force
COPY . .
RUN npx esbuild server.ts \
  --bundle \
  --platform=node \
  --target=node24 \
  --format=esm \
  --outfile=dist/server.mjs \
  --packages=external
RUN npm prune --omit=dev && npm cache clean --force

FROM node:24-alpine
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY package.json package-lock.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist/server.mjs ./dist/server.mjs
COPY --chown=node:node certs ./certs
COPY --chown=node:node accounts.csv ./accounts.csv
ENV NODE_ENV=production \
    MCP_TRANSPORT=http \
    CALENDAR_OBFUSCATION=true \
    NODE_EXTRA_CA_CERTS=/app/certs/corp-ca.pem
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["node", "dist/server.mjs"]

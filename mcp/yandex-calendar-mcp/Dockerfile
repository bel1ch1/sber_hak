FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force
COPY . .
# Bundle local ../_shared into the outfile; npm packages stay external.
RUN npx esbuild server.ts \
  --bundle \
  --platform=node \
  --target=node24 \
  --format=esm \
  --outfile=dist/server.mjs \
  --packages=external

FROM node:24-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder --chown=node:node /app/dist/server.mjs ./dist/server.mjs
ENV NODE_ENV=production \
    MCP_TRANSPORT=http
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["node", "dist/server.mjs"]

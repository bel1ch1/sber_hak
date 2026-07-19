# Build from repo root:
#   docker build -f mcp/stepik-mcp/Dockerfile .
FROM node:24-alpine AS builder
WORKDIR /app
COPY mcp/stepik-mcp/package.json mcp/stepik-mcp/package-lock.json ./
RUN npm ci && npm cache clean --force
COPY mcp/stepik-mcp/ ./
RUN npx esbuild server.ts \
  --bundle \
  --platform=node \
  --target=node24 \
  --format=esm \
  --outfile=dist/server.mjs \
  --packages=external

FROM node:24-alpine
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY mcp/stepik-mcp/package.json mcp/stepik-mcp/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder --chown=node:node /app/dist/server.mjs ./dist/server.mjs
COPY --chown=node:node stepik_courses_by_role.xlsx /data/stepik_courses_by_role.xlsx
ENV NODE_ENV=production \
    MCP_TRANSPORT=http \
    MCP_HTTP_PORT=3000 \
    STEPIK_CATALOG_PATH=/data/stepik_courses_by_role.xlsx \
    STEPIK_ENROLLMENTS_PATH=/tmp/stepik-enrollments.json
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["node", "dist/server.mjs"]

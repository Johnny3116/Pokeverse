# syntax=docker/dockerfile:1

# ---- build: install everything, vendor EmulatorJS, build the SPA ----
FROM oven/bun:1.4.2-alpine AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun scripts/vendor-emulator.ts && bun --bun vite build \
 && bun run build:server

# ---- runtime: server + built assets only ----
FROM oven/bun:1.4.2-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    DATA_DIR=/data
# The server is bundled into one file (zod included), so no node_modules are needed.
COPY --from=build /app/build/server ./server
COPY --from=build /app/dist ./dist
COPY checklists ./checklists
COPY scripts/backup.sh ./backup.sh
# Strip CRLF in case the repo was checked out on Windows without .gitattributes.
RUN sed -i 's/\r$//' backup.sh && chmod +x backup.sh \
 && mkdir -p /data /backups && chown bun:bun /data /backups
USER bun
VOLUME ["/data", "/backups"]
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "server/index.js"]

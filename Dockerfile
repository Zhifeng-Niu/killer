# Odysseus Agent Framework - Production Dockerfile
# Multi-stage build for minimal image size

# === Build Stage ===
FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc* ./
COPY packages/odysseus-core/package.json packages/odysseus-core/
COPY packages/odysseus-app/package.json packages/odysseus-app/

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source
COPY packages/odysseus-core/ packages/odysseus-core/
COPY packages/odysseus-app/ packages/odysseus-app/

# Build
RUN pnpm run build

# === Runtime Stage ===
FROM node:20-slim AS runtime

# Security: run as non-root user
RUN groupadd -r odysseus && useradd -r -g odysseus -d /app -s /sbin/nologin odysseus

WORKDIR /app

# Copy built artifacts and dependencies only
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/pnpm-lock.yaml* ./
COPY --from=builder /app/.npmrc* ./
COPY --from=builder /app/node_modules/ node_modules/
COPY --from=builder /app/packages/ packages/

# Create data directory with correct ownership
RUN mkdir -p /app/.odysseus/sessions /app/.odysseus/workflows && \
    chown -R odysseus:odysseus /app

# Default environment
ENV NODE_ENV=production

# API server port
EXPOSE 3000

# Graceful shutdown: SIGTERM handled by Node.js process
STOPSIGNAL SIGTERM

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Switch to non-root user
USER odysseus

# Run the agent with API server
ENTRYPOINT ["node", "packages/odysseus-app/dist/main.js"]
CMD ["--api", "--port", "3000"]

# Killer Agent Framework - Production Dockerfile
# Multi-stage build for minimal image size

# === Build Stage ===
FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/killer-core/package.json packages/killer-core/
COPY packages/killer-app/package.json packages/killer-app/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/killer-core/ packages/killer-core/
COPY packages/killer-app/ packages/killer-app/

# Build
RUN pnpm run build

# === Runtime Stage ===
FROM node:20-slim AS runtime

WORKDIR /app

# Copy built artifacts and dependencies only
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/.npmrc ./
COPY --from=builder /app/node_modules/ node_modules/
COPY --from=builder /app/packages/ packages/

# Create .killer directory for runtime data
RUN mkdir -p /app/.killer/sessions

# Default environment — auto-detect provider from available API keys
ENV NODE_ENV=production

# API server port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Run the agent with API server
ENTRYPOINT ["node", "packages/killer-app/dist/main.js"]
CMD ["--api", "--port", "3000"]

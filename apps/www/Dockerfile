FROM oven/bun:1.3.1 AS builder

WORKDIR /usr/src/app

# Install system dependencies for building
RUN apt-get -y update && \
    apt-get -y install curl && \
    rm -rf /var/lib/apt/lists/*

# Install Node.js and pnpm
ARG NODE_VERSION=24.8.0
RUN curl -L https://raw.githubusercontent.com/tj/n/master/bin/n -o n && \
    bash n $NODE_VERSION && \
    rm n && \
    npm install -g n && \
    npm install -g pnpm

# Copy package configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy all source code (monorepo structure requires all packages for dependency resolution)
COPY packages ./packages
COPY tools ./tools
COPY apps/www ./apps/www

# Install dependencies (handle lockfile config mismatch)
RUN pnpm install --no-frozen-lockfile

# Build the www application
RUN pnpm --filter @deadlock-mods/www build

# Runtime stage - Minimal image with only runtime dependencies
FROM oven/bun:1.3.1-slim AS runtime

# Create non-root user first
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Create app directory and pnpm directories with correct ownership from the start
RUN mkdir -p /usr/src/app && chown appuser:appuser /usr/src/app && \
    mkdir -p /home/appuser/.local/share/pnpm && \
    chown -R appuser:appuser /home/appuser

WORKDIR /usr/src/app

# Install only runtime system dependencies
RUN apt-get -y update && \
    apt-get -y install curl && \
    rm -rf /var/lib/apt/lists/*

# Install Node.js and pnpm (needed for runtime)
ARG NODE_VERSION=24.8.0
RUN curl -L https://raw.githubusercontent.com/tj/n/master/bin/n -o n && \
    bash n $NODE_VERSION && \
    rm n && \
    npm install -g n && \
    npm install -g pnpm

# Switch to non-root user before copying files
USER appuser

# Set pnpm home directory to ensure proper permissions
ENV PNPM_HOME="/home/appuser/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Copy package files with correct ownership
COPY --chown=appuser:appuser package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy built application and dependencies from builder stage with correct ownership
COPY --chown=appuser:appuser --from=builder /usr/src/app/packages ./packages
COPY --chown=appuser:appuser --from=builder /usr/src/app/tools ./tools
COPY --chown=appuser:appuser --from=builder /usr/src/app/apps/www ./apps/www

# Install only production dependencies (as non-root user)
RUN pnpm install --prod

# Environment variables for Vite
ENV VITE_SERVER_URL="https://api.deadlockmods.app"
ENV VITE_GA_MEASUREMENT_ID="G-EN5J1SBZ10"
ENV VITE_SENTRY_DSN=""
ENV PORT=3000

EXPOSE 3000

WORKDIR /usr/src/app/apps/www

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000 || exit 1

ENTRYPOINT [ "pnpm", "start" ]


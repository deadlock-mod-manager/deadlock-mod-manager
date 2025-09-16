FROM oven/bun:1.1.38

WORKDIR /usr/src/app

# Install system dependencies
RUN apt-get -y update && apt-get -y install curl && rm -rf /var/lib/apt/lists/*

# Install Node.js and pnpm
ARG NODE_VERSION=22.11.0
RUN curl -L https://raw.githubusercontent.com/tj/n/master/bin/n -o n && \
    bash n $NODE_VERSION && \
    rm n && \
    npm install -g n && \
    npm install -g pnpm

# Copy workspace configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy packages, tools, and API source
COPY packages ./packages
COPY tools ./tools
COPY apps/lockdex ./apps/lockdex

# Install dependencies
RUN pnpm install

WORKDIR /usr/src/app/apps/lockdex

ENTRYPOINT [ "pnpm",  "start" ]

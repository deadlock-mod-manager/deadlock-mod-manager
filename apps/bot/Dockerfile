FROM oven/bun:1.3.1

WORKDIR /usr/src/app

RUN apt-get -y update && \
    apt-get -y install curl \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/*

ARG NODE_VERSION=24.8.0
RUN curl -L https://raw.githubusercontent.com/tj/n/master/bin/n -o n && \
    bash n $NODE_VERSION && \
    rm n && \
    npm install -g n && \
    npm install -g pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

COPY packages ./packages
COPY tools ./tools
COPY apps/bot ./apps/bot

RUN pnpm install

WORKDIR /usr/src/app/apps/bot

ENTRYPOINT [ "pnpm",  "start" ]

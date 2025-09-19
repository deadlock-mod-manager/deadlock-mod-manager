FROM oven/bun:1.1.38

WORKDIR /usr/src/app

RUN apt-get -y update && apt-get -y install curl && rm -rf /var/lib/apt/lists/*

ARG NODE_VERSION=24.8.0
RUN curl -L https://raw.githubusercontent.com/tj/n/master/bin/n -o n && \
    bash n $NODE_VERSION && \
    rm n && \
    npm install -g n && \
    npm install -g pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

COPY packages ./packages
COPY tools ./tools
COPY apps/api ./apps/api

RUN pnpm install

EXPOSE 9000

WORKDIR /usr/src/app/apps/api

ENTRYPOINT [ "pnpm",  "start" ]

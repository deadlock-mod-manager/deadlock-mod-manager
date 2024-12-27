FROM oven/bun:1.1.38

WORKDIR /usr/src/app

RUN apt-get -y update; apt-get -y install curl
ARG NODE_VERSION=22.11.0
RUN curl -L https://raw.githubusercontent.com/tj/n/master/bin/n -o n
RUN bash n $NODE_VERSION
RUN rm n
RUN npm install -g n
RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api ./apps/api
COPY packages ./packages

RUN pnpm install
RUN pnpm generate

EXPOSE 9000

WORKDIR /usr/src/app/apps/api

ENTRYPOINT [ "pnpm",  "start" ]

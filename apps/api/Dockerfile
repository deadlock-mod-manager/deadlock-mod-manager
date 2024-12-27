FROM oven/bun:1.1.38

WORKDIR /usr/src/app

RUN apt-get -y update; apt-get -y install curl
ARG NODE_VERSION=22.11.0
RUN curl -L https://raw.githubusercontent.com/tj/n/master/bin/n -o n
RUN bash n $NODE_VERSION
RUN rm n
RUN npm install -g n

COPY apps/api .

RUN bun install
RUN bunx prisma generate

EXPOSE 9000

ENTRYPOINT [ "bun",  "start" ]

FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    ffmpeg \
    ca-certificates \
    fonts-dejavu-core \
    fonts-liberation \
    fonts-noto-color-emoji \
    unzip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.mjs ./
COPY upstream.json ./

ENV NODE_ENV=production
ENV PORT=8080
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV HYPERFRAMES_BROWSER_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CONTAINER=true
ENV HYPERFRAMES_PROJECTS_DIR=/data/projects
ENV HYPERFRAMES_NO_UPDATE_CHECK=1

RUN mkdir -p /data/projects && chown -R node:node /app /data
USER node

EXPOSE 8080
CMD ["node", "server.mjs"]

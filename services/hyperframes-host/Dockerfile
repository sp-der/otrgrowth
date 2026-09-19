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
    gosu \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.mjs ./
COPY generator.mjs ./
COPY upstream.json ./
COPY entrypoint.sh /usr/local/bin/otr-hyperframes-entrypoint

ENV NODE_ENV=production
ENV PORT=8080
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV HYPERFRAMES_BROWSER_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CONTAINER=true
ENV HYPERFRAMES_PROJECTS_DIR=/data/projects
ENV HYPERFRAMES_NO_UPDATE_CHECK=1

RUN chmod +x /usr/local/bin/otr-hyperframes-entrypoint \
  && mkdir -p /data/projects \
  && chown -R node:node /app /data

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/otr-hyperframes-entrypoint"]

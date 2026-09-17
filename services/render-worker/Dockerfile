FROM node:22-bookworm-slim
ENV ONNXRUNTIME_NODE_INSTALL_CUDA=skip HYPERFRAMES_BROWSER_PATH=/usr/bin/chromium DO_NOT_TRACK=1
RUN apt-get update && apt-get install -y --no-install-recommends chromium ffmpeg fonts-liberation ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY services/render-worker/package.json services/render-worker/package-lock.json ./services/render-worker/
RUN npm ci --prefix services/render-worker
COPY --chown=node:node src/lib/creative ./src/lib/creative
COPY --chown=node:node src/lib/domain ./src/lib/domain
COPY --chown=node:node services/render-worker/*.ts ./services/render-worker/
USER node
WORKDIR /app/services/render-worker
CMD ["npm", "start"]

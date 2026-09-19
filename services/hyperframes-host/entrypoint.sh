#!/bin/sh
set -eu

mkdir -p "${HYPERFRAMES_PROJECTS_DIR:-/data/projects}"
chown -R node:node /data

exec gosu node node /app/server.mjs

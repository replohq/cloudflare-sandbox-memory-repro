#!/bin/bash

set -e

CONTAINER_NAME="sandbox-repro-minio"
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001

if curl -sf "http://localhost:$MINIO_PORT/minio/health/ready" >/dev/null 2>&1; then
  echo "[MinIO] Using existing MinIO on localhost:$MINIO_PORT"
else
  if docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    docker start "$CONTAINER_NAME" >/dev/null 2>&1 || true
  else
    echo "[MinIO] Creating container..."
    docker run -d --name "$CONTAINER_NAME" \
      -p "$MINIO_PORT:9000" \
      -p "$MINIO_CONSOLE_PORT:9001" \
      -v sandbox-repro-minio-data:/data \
      minio/minio server /data >/dev/null
  fi

  echo "[MinIO] Waiting for readiness..."
  until curl -sf "http://localhost:$MINIO_PORT/minio/health/ready" >/dev/null 2>&1; do
    sleep 0.5
  done
fi

docker run --rm --network host --entrypoint sh minio/mc -c \
  "mc alias set local http://localhost:$MINIO_PORT minioadmin minioadmin >/dev/null 2>&1 && mc mb --ignore-existing local/agent-repos >/dev/null 2>&1 && mc mb --ignore-existing local/agent-repos-dev >/dev/null 2>&1" \
  >/dev/null 2>&1 || true

echo "[MinIO] Ready (buckets: agent-repos, agent-repos-dev; console: http://localhost:$MINIO_CONSOLE_PORT)"

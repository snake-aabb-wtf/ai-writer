#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f ".env" ]]; then
  echo "[AI Writer] 未找到 .env"
  echo "请先复制 .env.example 为 .env，并填写 OPENAI_BASE_URL、OPENAI_API_KEY、OPENAI_MODEL。"
  exit 1
fi

if [[ ! -f "dist/src/server.js" ]]; then
  echo "[AI Writer] 未找到生产构建，正在执行 npm run build..."
  npm run build
fi

echo "[AI Writer] 正在启动 http://localhost:4317/"
exec node --env-file=.env dist/src/server.js

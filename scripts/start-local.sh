#!/usr/bin/env bash
# Start the existing Vivarium with an available modern Node runtime.
set -euo pipefail
VIV_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$VIV_ROOT"
VIV_NODE="${VIV_NODE_BIN:-}"
if [[ -z "$VIV_NODE" ]]; then
  VIV_NODE="$(command -v node || true)"
fi
if [[ -z "$VIV_NODE" && -x /tmp/vivrun/node-v22.17.1-linux-x64/bin/node ]]; then
  VIV_NODE=/tmp/vivrun/node-v22.17.1-linux-x64/bin/node
fi
if [[ -z "$VIV_NODE" || ! -x "$VIV_NODE" ]]; then
  echo 'Node fehlt. Node 20.12+ installieren oder VIV_NODE_BIN auf eine Node-Binary setzen.' >&2
  exit 1
fi
"$VIV_NODE" -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<20 || (a===20 && b<12)){console.error("Node 20.12+ erforderlich");process.exit(1)}'
export PATH="$(dirname -- "$VIV_NODE"):$PATH"
if [[ -f .env ]]; then
  exec "$VIV_NODE" --env-file=.env scripts/start.mjs
fi
exec "$VIV_NODE" scripts/start.mjs

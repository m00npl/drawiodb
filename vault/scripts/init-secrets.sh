#!/bin/bash

# Vault secrets initialization script
set -euo pipefail

echo "Waiting for Vault to be ready..."
while ! vault status >/dev/null 2>&1; do
    sleep 2
done

echo "Initializing Vault secrets for DrawIO DB..."

# Enable KV secrets engine
vault secrets enable -version=2 kv || echo "KV engine already enabled"

# Create policies
vault policy write drawio-app - <<EOF
path "kv/data/drawio/*" {
  capabilities = ["read"]
}
path "kv/data/shared/*" {
  capabilities = ["read"]
}
EOF

# Store secrets (replace with actual secure values)
vault kv put kv/drawio/golem \
    private_key="REPLACE_WITH_NEW_SECURE_PRIVATE_KEY" \
    chain_id="60138453025" \
    rpc_url="https://kaolin.holesky.golemdb.io/rpc" \
    ws_url="wss://kaolin.holesky.golemdb.io/rpc/ws"

vault kv put kv/drawio/database \
    redis_password="$(openssl rand -base64 32)" \
    session_secret="$(openssl rand -base64 64)"

vault kv put kv/shared/monitoring \
    grafana_password="$(openssl rand -base64 16)" \
    webhook_url="YOUR_WEBHOOK_URL_HERE"

# Create app token
vault token create -policy=drawio-app -period=24h -format=json | jq -r .auth.client_token > /vault/data/app-token

echo "Secrets initialized successfully"
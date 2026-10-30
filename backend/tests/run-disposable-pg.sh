#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
# Never source .env. Export both URLs so the runner cannot select application DBs.
export DATABASE_URL='postgresql://top4_test:Top4_Local_Test_Only_18@localhost:5433/top4_financial_test?sslmode=require'
export DIRECT_URL="$DATABASE_URL"
export TOP4_PG_TEST_ALLOW_RESET=YES_DISPOSABLE_LOCAL_PG18
IMAGE='docker.io/library/postgres@sha256:41a369edc91d9bdd7a58be6bc71ea0f8f7a3f49e82818a9f0829021ea7840b7c'
TEMP=$(mktemp -d /tmp/top4-pg-foundation.XXXXXX)
NAME="top4-pg-foundation-$$"
cleanup() { podman rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf -- "$TEMP"; }
trap cleanup EXIT
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$TEMP/ca.key" -out "$TEMP/ca.crt" -days 2 -subj '/CN=Top4 disposable test CA' >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -keyout "$TEMP/server.key" -out "$TEMP/server.csr" -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' -addext 'extendedKeyUsage=serverAuth' >/dev/null 2>&1
openssl x509 -req -in "$TEMP/server.csr" -CA "$TEMP/ca.crt" -CAkey "$TEMP/ca.key" -CAcreateserial -out "$TEMP/server.crt" -days 2 -copy_extensions copy >/dev/null 2>&1
# Mount only server material; never mount the CA private key in PostgreSQL.
mkdir "$TEMP/server"; cp "$TEMP/server.key" "$TEMP/server.crt" "$TEMP/server/"
chmod 755 "$TEMP/server"; chmod 644 "$TEMP/server/"*
export NODE_EXTRA_CA_CERTS="$TEMP/ca.crt"
podman run -d --pull=never --name "$NAME" -p 127.0.0.1:5433:5432 --tmpfs /var/lib/postgresql:rw,mode=1777 \
  -v "$TEMP/server:/certs:ro,Z" -e POSTGRES_USER=top4_test -e POSTGRES_PASSWORD=Top4_Local_Test_Only_18 -e POSTGRES_DB=top4_financial_test \
  "$IMAGE" sh -c 'cp /certs/server.key /certs/server.crt /tmp/; chown postgres:postgres /tmp/server.key /tmp/server.crt; chmod 600 /tmp/server.key; exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/server.crt -c ssl_key_file=/tmp/server.key' >/dev/null
READY=0
for i in $(seq 1 60); do
  if podman exec "$NAME" pg_isready -h 127.0.0.1 -U top4_test -d top4_financial_test >/dev/null 2>&1; then READY=1; break; fi
  sleep 1
done
if [ "$READY" != 1 ]; then podman logs "$NAME"; exit 1; fi
# The strict runner verifies TLS against this CA and applies only to this URL.
node backend/db/migrate.js --apply
if [ "$#" -eq 0 ]; then
  npm test -- --runInBand
else
  npm test -- --runInBand "$@"
fi

#!/bin/sh
set -eu

: "${POSTGRES_HOST:?POSTGRES_HOST not set}"
: "${POSTGRES_PORT:?POSTGRES_PORT not set}"
: "${POSTGRES_USER:?POSTGRES_USER not set}"

echo "Looking for the database ..."
attempts=0
max_attempts=60
until pg_isready -q -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER"; do
  attempts=$((attempts + 1))
  if [ "$attempts" -ge "$max_attempts" ]; then
    echo "Database not ready after $((max_attempts * 2))s; giving up." >&2
    exit 1
  fi
  echo "Waiting for database ($attempts/$max_attempts)..."
  sleep 2
done
echo "Found database."

echo "Starting the application..."
pnpm run prod:typeorm:migrate
exec pnpm run start:prod

#!/bin/sh
set -e

echo "Looking for the database ..."
while ! pg_isready -q -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER
do
  echo "Waiting for database."
  sleep 2
done
echo "Found database."
echo "Starting the application..."

pnpm run prod:typeorm:migrate
exec pnpm run start:prod

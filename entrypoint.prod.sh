#!/bin/sh

echo "Looking for the database ..."
while ! pg_isready -q -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER
do
  echo "Waiting for database."
  sleep 2
done
echo "Found database."
echo "Starting the application..."

npm --prefix teammapper-backend run prod:typeorm:migrate
npm run start:prod
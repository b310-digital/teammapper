#!/bin/bash
# Runs once on first Postgres init (empty data dir). Creates the test database
# alongside the dev database so backend integration/e2e tests have somewhere to run.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE DATABASE "teammapper-backend-test";
	GRANT ALL PRIVILEGES ON DATABASE "teammapper-backend-test" TO "$POSTGRES_USER";
EOSQL

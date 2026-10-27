import { TypeOrmModuleOptions } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions'

require('dotenv').config() // eslint-disable-line @typescript-eslint/no-require-imports

// we create a database for each worker:
const setupWorkerDatabase = async (workerId: string): Promise<string> => {
  const connection = await mainTestDataSource()
  const databaseName = buildDatabaseName(workerId)
  await dropDatabase(connection, databaseName)
  await connection.query(`CREATE DATABASE "${databaseName}"`)
  await connection.destroy()

  return databaseName
}

const createDataSourceConfig: PostgresConnectionOptions = {
  type: 'postgres',
  host: process.env.POSTGRES_TEST_HOST,
  port: parseInt(process.env.POSTGRES_TEST_PORT || '3000', 10),
  username: process.env.POSTGRES_TEST_USER,
  password: process.env.POSTGRES_TEST_PASSWORD,
  database: process.env.POSTGRES_TEST_DATABASE,
  synchronize: false,
}

// this is the configuration for the main test database. this database is not used for actual tests.
// it is the entrypoint for each worker to be able to create their own worker database
const mainTestDataSource = async () => {
  // we don't need to synchronise the tables for the main test database - #
  // we cannot use CREATE DATABASE ... TEMPLATE ...;, since this method does
  // not work when multiple connections are accessing the template database.
  // However, as soon as we have more than one worker, there are multiple
  // connections to the main database, concurrently trying to create their worker databases.
  const connection = new DataSource(createDataSourceConfig)
  await connection.initialize()

  return connection
}

const workerDataSourceConfig = (databaseName: string): TypeOrmModuleOptions => {
  return {
    ...createDataSourceConfig,
    database: databaseName,
    synchronize: true,
    autoLoadEntities: true,
    dropSchema: true,
    // Parallel workers create and drop databases at the same time, and
    // Postgres runs those one after another, so a TRUNCATE can wait seconds
    // for its lock on a busy CI runner.
    extra: {
      query_timeout: 10000,
      statement_timeout: 10000,
    },
  }
}

export const destroyWorkerDatabase = async (
  workerDataSource: DataSource,
  workerId: string
): Promise<void> => {
  // first, drop connection to test database  - we cannot use the connection from the worker, since the worker is connected to the database we want to delete.
  await workerDataSource.destroy()

  // get a connection to the main test database
  const databaseName = buildDatabaseName(workerId)
  // delete worker database:
  const connection = await mainTestDataSource()
  await dropDatabase(connection, databaseName)
  await connection.destroy()
}

// FORCE terminates sessions still connected to the database. A suite that
// imports AppModule opens a second pool on it, and a plain DROP DATABASE
// waits for that pool until the jest hook times out.
const dropDatabase = async (
  connection: DataSource,
  databaseName: string
): Promise<void> => {
  await connection.query(
    `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`
  )
}

const buildDatabaseName = (workerId: string): string => {
  return `${process.env.POSTGRES_TEST_DATABASE}-${workerId}`
}

export const createTestConfiguration = async (
  workerId: string
): Promise<TypeOrmModuleOptions> => {
  const databaseName = await setupWorkerDatabase(workerId)
  return workerDataSourceConfig(databaseName)
}

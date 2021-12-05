import { TypeOrmModuleOptions } from '@nestjs/typeorm';

require('dotenv').config();

export const createTestConfiguration = (): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT),
  username: process.env.POSTGRES_TEST_USER,
  password: process.env.POSTGRES_TEST_PASSWORD,
  database: process.env.POSTGRES_TEST_DATABASE,
  synchronize: true,
  autoLoadEntities: true,
  dropSchema: true,
});

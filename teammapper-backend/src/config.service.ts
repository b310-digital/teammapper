// Taken from https://github.com/GauSim/nestjs-typeorm

import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';

interface EnvProps {
  [k: string]: string | undefined
}

require('dotenv').config();

class ConfigService {
  private env: EnvProps;

  constructor(env: EnvProps) {
    this.env = env;
  }

  private getValue(key: string, throwOnMissing = true): string {
    const value = this.env[key];
    if (!value && throwOnMissing) {
      throw new Error(`config error - missing env.${key}`);
    }

    return value;
  }

  public ensureValues(keys: string[]) {
    keys.forEach((k) => this.getValue(k, true));
    return this;
  }

  public getPort() {
    return this.getValue('PORT', true);
  }

  public isProduction() {
    const mode = this.getValue('MODE', false);
    return mode !== 'DEV';
  }

  public deleteAfterDays() {
    return parseInt(this.getValue('DELETE_AFTER_DAYS', false) || '30');
  }

  public getTypeOrmConfig(): TypeOrmModuleOptions {
    return {
      type: 'postgres',
      host: this.getValue('POSTGRES_HOST'),
      port: Number(this.getValue('POSTGRES_PORT')),
      username: this.getValue('POSTGRES_USER'),
      password: this.getValue('POSTGRES_PASSWORD'),
      database: this.getValue('POSTGRES_DATABASE'),

      entities: [join(__dirname, '**', '*.entity.{ts,js}')],

      migrationsTableName: 'migration',
      migrations: [join(__dirname, 'migrations', '*.{ts,js}')],

      cli: {
        migrationsDir: 'migrations',
      },

      extra: {
        query_timeout: 20000,
        statement_timeout: 20000,
      },

      synchronize: !this.isProduction(),

      // As reported in https://github.com/brianc/node-postgres/issues/2009, implicit disabling of unauthorized certificates has been deprecated.
      // You either need to configure a custom certificate provided by yourself that is signed by an official certification authority, or connections will be refused.
      // This behaviour may be disabled by changing rejectUnauthorized: false in the ssl configuration.
      //
      // See https://www.andronio.me/2020/08/20/connecting-typeorm-to-a-postgres-database-on-heroku/
      // See https://github.com/typeorm/typeorm/issues/278
      ssl: this.getValue('POSTGRES_SSL') !== 'false' && { rejectUnauthorized: this.getValue('POSTGRES_SSL_REJECT_UNAUTHORIZED') !== 'false' },
    };
  }
}

const configService = new ConfigService(process.env).ensureValues([
  'POSTGRES_DATABASE',
  'POSTGRES_HOST',
  'POSTGRES_PASSWORD',
  'POSTGRES_PORT',
  'POSTGRES_USER',
]);

export default configService;

// Taken from https://github.com/GauSim/nestjs-typeorm

import { DataSourceOptions } from 'typeorm'
import { join } from 'path'

interface EnvProps {
  [k: string]: string | undefined
}

export interface LLMProps {
  url?: string
  token?: string
  provider?: string
  model?: string
  tpm?: string
  tpd?: string
  rpm?: string
}

class ConfigService {
  private env: EnvProps

  constructor(env: EnvProps) {
    this.env = env
  }

  private getValue(key: string, throwOnMissing = true): string | undefined {
    const value = this.env[key]
    if (!value && throwOnMissing) {
      throw new Error(`config error - missing env.${key}`)
    }

    return value
  }

  public ensureValues(keys: string[]) {
    keys.forEach((k) => this.getValue(k, true))
    return this
  }

  public getPort(): number {
    return parseInt(this.getValue('PORT', false) || '3000', 10)
  }

  public isProduction() {
    const mode = this.getValue('MODE', false)
    return mode !== 'DEV'
  }

  public deleteAfterDays() {
    return parseInt(this.getValue('DELETE_AFTER_DAYS', false) || '30')
  }

  public isYjsEnabled(): boolean {
    const value = this.getValue('YJS_ENABLED', false)
    return value?.toLowerCase() === 'true'
  }

  public getLLMConfig(): LLMProps {
    return {
      url: this.getValue('AI_LLM_URL', false),
      token: this.getValue('AI_LLM_TOKEN', false),
      provider: this.getValue('AI_LLM_PROVIDER', false) ?? 'openai',
      model: this.getValue('AI_LLM_MODEL', false),
      tpm: this.getValue('AI_LLM_TPM', false),
      tpd: this.getValue('AI_LLM_TPD', false),
      rpm: this.getValue('AI_LLM_RPM', false),
    }
  }

  public getTypeOrmConfig(): DataSourceOptions {
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

      extra: {
        query_timeout: this.getValue('POSTGRES_QUERY_TIMEOUT') || 100000,
        statement_timeout:
          this.getValue('POSTGRES_STATEMENT_TIMEOUT') || 100000,
      },

      synchronize: !this.isProduction(),

      // As reported in https://github.com/brianc/node-postgres/issues/2009, implicit disabling of unauthorized certificates has been deprecated.
      // You either need to configure a custom certificate provided by yourself that is signed by an official certification authority, or connections will be refused.
      // This behaviour may be disabled by changing rejectUnauthorized: false in the ssl configuration.
      //
      // See https://www.andronio.me/2020/08/20/connecting-typeorm-to-a-postgres-database-on-heroku/
      // See https://github.com/typeorm/typeorm/issues/278
      ssl: this.getValue('POSTGRES_SSL') !== 'false' && {
        rejectUnauthorized:
          this.getValue('POSTGRES_SSL_REJECT_UNAUTHORIZED') !== 'false',
      },
    }
  }
}

const configService = new ConfigService(process.env).ensureValues([
  'POSTGRES_DATABASE',
  'POSTGRES_HOST',
  'POSTGRES_PASSWORD',
  'POSTGRES_PORT',
  'POSTGRES_USER',
])

export default configService

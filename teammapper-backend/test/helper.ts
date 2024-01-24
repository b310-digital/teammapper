import { DataSource } from 'typeorm'

export async function truncateDatabase(dataSource: DataSource) {
  // loosely based on https://blog.tooljet.com/clearing-tables-before-each-test-nestjs-typeorm/
  const entities = dataSource.entityMetadatas
  for (const entity of entities) {
    const repository = dataSource.getRepository(entity.name)
    await repository.query(
      `TRUNCATE TABLE ${entity.tableName} RESTART IDENTITY CASCADE;`
    )
  }
}

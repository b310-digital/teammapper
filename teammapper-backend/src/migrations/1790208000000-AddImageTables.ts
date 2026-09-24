import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Creates the tables for node images stored by reference: metadata in
 * `mmp_image`, bytes in `mmp_image_data`. Both key on (mapId, id) and cascade
 * on map delete. The check constraint limits the stored type to raster types,
 * because the read endpoint sends it as Content-Type. Moves no data.
 */
export class AddImageTables1790208000000 implements MigrationInterface {
  name = 'AddImageTables1790208000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "mmp_image" (
        "mapId" uuid NOT NULL,
        "id" uuid NOT NULL,
        "mimetype" character varying NOT NULL,
        "size" integer NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mmp_image_mapId_id" PRIMARY KEY ("mapId", "id"),
        CONSTRAINT "CHK_mmp_image_mimetype" CHECK ("mimetype" IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp')),
        CONSTRAINT "FK_mmp_image_mapId" FOREIGN KEY ("mapId") REFERENCES "mmp_map"("id") ON DELETE CASCADE
      )`
    )
    await queryRunner.query(
      `CREATE TABLE "mmp_image_data" (
        "mapId" uuid NOT NULL,
        "id" uuid NOT NULL,
        "data" bytea NOT NULL,
        CONSTRAINT "PK_mmp_image_data_mapId_id" PRIMARY KEY ("mapId", "id"),
        CONSTRAINT "FK_mmp_image_data_mapId" FOREIGN KEY ("mapId") REFERENCES "mmp_map"("id") ON DELETE CASCADE
      )`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "mmp_image_data"`)
    await queryRunner.query(`DROP TABLE "mmp_image"`)
  }
}

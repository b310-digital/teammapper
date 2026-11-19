import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Keys `mmp_image_data` on the image id alone, so a map and its copies share
 * one bytes row. `mmp_image` keeps one row per map and image, and each of
 * those rows needs one bytes row with its id.
 *
 * `up`:
 * 1. Deletes bytes that no `mmp_image` row references. No map can read them,
 *    and no later deletion would find them.
 * 2. Keeps one bytes row per id, the one with the smallest `mapId`. A copy
 *    stored the same bytes again under the same id, so the extra rows hold
 *    nothing new, and the new primary key rejects two rows with one id.
 * 3. Drops the foreign key and the primary key on (`mapId`, `id`), then the
 *    `mapId` column, and adds the primary key on `id`.
 * 4. Indexes `mmp_image(id)` for the check whether any map still references
 *    an image.
 *
 * `down` gives every `mmp_image` row its own bytes row again and restores the
 * old keys.
 */
export class ShareImageBytesBetweenMaps1790467200000 implements MigrationInterface {
  name = 'ShareImageBytesBetweenMaps1790467200000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "mmp_image_data" d
       WHERE NOT EXISTS (SELECT 1 FROM "mmp_image" i WHERE i."id" = d."id")`
    )
    await queryRunner.query(
      `DELETE FROM "mmp_image_data" d
       USING "mmp_image_data" other
       WHERE other."id" = d."id" AND other."mapId" < d."mapId"`
    )
    await queryRunner.query(
      `ALTER TABLE "mmp_image_data" DROP CONSTRAINT "FK_mmp_image_data_mapId"`
    )
    await queryRunner.query(
      `ALTER TABLE "mmp_image_data" DROP CONSTRAINT "PK_mmp_image_data_mapId_id"`
    )
    await queryRunner.query(`ALTER TABLE "mmp_image_data" DROP COLUMN "mapId"`)
    await queryRunner.query(
      `ALTER TABLE "mmp_image_data" ADD CONSTRAINT "PK_mmp_image_data_id" PRIMARY KEY ("id")`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_mmp_image_id" ON "mmp_image" ("id")`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_mmp_image_id"`)
    await queryRunner.query(
      `ALTER TABLE "mmp_image_data" DROP CONSTRAINT "PK_mmp_image_data_id"`
    )
    await queryRunner.query(`ALTER TABLE "mmp_image_data" ADD "mapId" uuid`)
    await queryRunner.query(
      `INSERT INTO "mmp_image_data" ("mapId", "id", "data")
       SELECT i."mapId", i."id", d."data"
       FROM "mmp_image" i
       JOIN "mmp_image_data" d ON d."id" = i."id" AND d."mapId" IS NULL`
    )
    await queryRunner.query(
      `DELETE FROM "mmp_image_data" WHERE "mapId" IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "mmp_image_data" ALTER COLUMN "mapId" SET NOT NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "mmp_image_data" ADD CONSTRAINT "PK_mmp_image_data_mapId_id" PRIMARY KEY ("mapId", "id")`
    )
    await queryRunner.query(
      `ALTER TABLE "mmp_image_data" ADD CONSTRAINT "FK_mmp_image_data_mapId" FOREIGN KEY ("mapId") REFERENCES "mmp_map"("id") ON DELETE CASCADE`
    )
  }
}

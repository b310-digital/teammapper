import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateMapsAndNodes1638048135450 implements MigrationInterface {
  name = 'CreateMapsAndNodes1638048135450'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE "mmp_node" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying, "root" boolean NOT NULL DEFAULT false, "coordinatesX" double precision NOT NULL, "coordinatesY" double precision NOT NULL, "colorsName" character varying, "colorsBackground" character varying, "colorsBranch" character varying, "fontSize" integer, "fontStyle" character varying, "fontWeight" character varying, "imageSrc" character varying, "imageSize" integer DEFAULT \'60\', "locked" boolean, "k" double precision, "nodeMapId" uuid, "nodeParentId" uuid, "orderNumber" SERIAL, CONSTRAINT "PK_70f65b529c3e785462fb35c05cf" PRIMARY KEY ("id"))'
    )
    await queryRunner.query(
      'CREATE TABLE "mmp_map" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "lastModified" TIMESTAMP WITH TIME ZONE, "name" character varying, CONSTRAINT "PK_a76c9b36fe9df0143f9870ad139" PRIMARY KEY ("id"))'
    )
    await queryRunner.query(
      'ALTER TABLE "mmp_node" ADD CONSTRAINT "FK_19c5208da416d32ea491315716e" FOREIGN KEY ("nodeMapId") REFERENCES "mmp_map"("id") ON DELETE CASCADE ON UPDATE NO ACTION'
    )
    await queryRunner.query(
      'ALTER TABLE "mmp_node" ADD CONSTRAINT "FK_9919032f542cee8cab97749e1a5" FOREIGN KEY ("nodeParentId") REFERENCES "mmp_node"("id") ON DELETE CASCADE ON UPDATE NO ACTION'
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "mmp_node" DROP CONSTRAINT "FK_9919032f542cee8cab97749e1a5"'
    )
    await queryRunner.query(
      'ALTER TABLE "mmp_node" DROP CONSTRAINT "FK_19c5208da416d32ea491315716e"'
    )
    await queryRunner.query('DROP TABLE "mmp_map"')
    await queryRunner.query('DROP TABLE "mmp_node"')
  }
}

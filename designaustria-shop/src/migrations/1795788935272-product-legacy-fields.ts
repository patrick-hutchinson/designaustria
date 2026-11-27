import {MigrationInterface, QueryRunner} from "typeorm";

export class ProductLegacyFields1795788935272 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsLegacywpid" integer`, undefined);
        await queryRunner.query(`ALTER TABLE "product" ADD CONSTRAINT "UQ_7adb3b16b7eaf836f82c8f32e9d" UNIQUE ("customFieldsLegacywpid")`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsMemberprice" integer`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsLegacydownloadfiles" text`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsLegacydownloadfiles"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsMemberprice"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP CONSTRAINT "UQ_7adb3b16b7eaf836f82c8f32e9d"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsLegacywpid"`, undefined);
   }

}

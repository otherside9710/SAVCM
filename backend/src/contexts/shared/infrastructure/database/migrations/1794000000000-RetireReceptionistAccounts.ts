import { MigrationInterface, QueryRunner } from 'typeorm';

export class RetireReceptionistAccounts1794000000000 implements MigrationInterface {
  name = 'RetireReceptionistAccounts1794000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users"
      SET "active" = false, "role" = 'LEGACY_RECEPTIONIST'
      WHERE "role" = 'RECEPTIONIST'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users"
      SET "role" = 'RECEPTIONIST'
      WHERE "role" = 'LEGACY_RECEPTIONIST'
    `);
  }
}

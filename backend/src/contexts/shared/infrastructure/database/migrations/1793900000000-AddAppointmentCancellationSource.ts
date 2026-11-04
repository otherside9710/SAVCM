import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAppointmentCancellationSource1793900000000 implements MigrationInterface {
  name = 'AddAppointmentCancellationSource1793900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "appointments" ADD "cancellationSource" character varying(20)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "appointments" DROP COLUMN "cancellationSource"');
  }
}

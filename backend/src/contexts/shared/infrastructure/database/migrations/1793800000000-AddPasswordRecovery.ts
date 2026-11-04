import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordRecovery1793800000000 implements MigrationInterface {
  name = 'AddPasswordRecovery1793800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "users" ADD "passwordChangedAt" TIMESTAMP WITH TIME ZONE');
    await queryRunner.query(`CREATE TABLE "password_reset_tokens" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "userId" uuid NOT NULL,
      "tokenHash" character varying(64) NOT NULL,
      "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
      "usedAt" TIMESTAMP WITH TIME ZONE,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_password_reset_tokens_id" PRIMARY KEY ("id"),
      CONSTRAINT "FK_password_reset_tokens_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
    )`);
    await queryRunner.query('CREATE UNIQUE INDEX "uq_password_reset_tokens_user_id" ON "password_reset_tokens" ("userId")');
    await queryRunner.query('CREATE UNIQUE INDEX "uq_password_reset_tokens_token_hash" ON "password_reset_tokens" ("tokenHash")');
    await queryRunner.query('CREATE INDEX "ix_password_reset_tokens_expires_at" ON "password_reset_tokens" ("expiresAt")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "password_reset_tokens"');
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN "passwordChangedAt"');
  }
}

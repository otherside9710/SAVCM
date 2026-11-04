import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSavcmSchema1762250000000 implements MigrationInterface {
  name = 'InitialSavcmSchema1762250000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await queryRunner.query(`CREATE TABLE "users" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "documentType" character varying(10) NOT NULL DEFAULT 'CC',
      "documentId" character varying(20) NOT NULL,
      "email" character varying(254) NOT NULL,
      "passwordHash" character varying(100) NOT NULL,
      "firstName" character varying(100) NOT NULL,
      "lastName" character varying(100) NOT NULL,
      "phone" character varying(30),
      "birthDate" date,
      "role" character varying(20) NOT NULL DEFAULT 'PATIENT',
      "active" boolean NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_users_id" PRIMARY KEY ("id")
    )`);
    await queryRunner.query('CREATE UNIQUE INDEX "uq_users_document_id" ON "users" ("documentId")');
    await queryRunner.query('CREATE UNIQUE INDEX "uq_users_email" ON "users" ("email")');
    await queryRunner.query(`CREATE TABLE "eps_patient_roster" (
      "documentType" character varying(10) NOT NULL DEFAULT 'CC',
      "documentId" character varying(20) NOT NULL,
      "active" boolean NOT NULL DEFAULT true,
      "importedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_eps_patient_roster_document_id" PRIMARY KEY ("documentId")
    )`);
    await queryRunner.query(`CREATE TABLE "doctors" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "userId" uuid NOT NULL,
      "specialty" character varying(80) NOT NULL DEFAULT 'Medicina General',
      "defaultRoom" character varying(30),
      "active" boolean NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_doctors_id" PRIMARY KEY ("id"),
      CONSTRAINT "FK_doctors_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query('CREATE UNIQUE INDEX "uq_doctors_user_id" ON "doctors" ("userId")');
    await queryRunner.query(`CREATE TABLE "schedule_slots" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "doctorId" uuid NOT NULL,
      "workDate" date NOT NULL,
      "startTime" time(0) NOT NULL,
      "endTime" time(0) NOT NULL,
      "room" character varying(30),
      "active" boolean NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_schedule_slots_id" PRIMARY KEY ("id"),
      CONSTRAINT "FK_schedule_slots_doctor" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT,
      CONSTRAINT "CK_schedule_slots_time" CHECK ("endTime" > "startTime")
    )`);
    await queryRunner.query('CREATE UNIQUE INDEX "uq_schedule_doctor_date_time" ON "schedule_slots" ("doctorId", "workDate", "startTime")');
    await queryRunner.query('CREATE INDEX "ix_schedule_date_doctor" ON "schedule_slots" ("workDate", "doctorId")');
    await queryRunner.query(`CREATE TABLE "appointments" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "patientId" uuid NOT NULL,
      "doctorId" uuid NOT NULL,
      "slotId" uuid NOT NULL,
      "workDate" date NOT NULL,
      "startTime" time(0) NOT NULL,
      "endTime" time(0) NOT NULL,
      "status" character varying(20) NOT NULL DEFAULT 'SCHEDULED',
      "reason" character varying(500),
      "cancellationReason" character varying(500),
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_appointments_id" PRIMARY KEY ("id"),
      CONSTRAINT "FK_appointments_patient" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_appointments_doctor" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_appointments_slot" FOREIGN KEY ("slotId") REFERENCES "schedule_slots"("id") ON DELETE RESTRICT,
      CONSTRAINT "CK_appointments_time" CHECK ("endTime" > "startTime")
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_active_appointment_slot" ON "appointments" ("slotId") WHERE "status" = 'SCHEDULED'`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_active_patient_datetime" ON "appointments" ("patientId", "workDate", "startTime") WHERE "status" = 'SCHEDULED'`);
    await queryRunner.query('CREATE INDEX "ix_appointments_date_status" ON "appointments" ("workDate", "status")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "appointments"');
    await queryRunner.query('DROP TABLE "schedule_slots"');
    await queryRunner.query('DROP TABLE "doctors"');
    await queryRunner.query('DROP TABLE "eps_patient_roster"');
    await queryRunner.query('DROP TABLE "users"');
  }
}

import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import {
  AppointmentOrmEntity,
  DoctorOrmEntity,
  EpsPatientOrmEntity,
  PasswordResetTokenOrmEntity,
  ScheduleSlotOrmEntity,
  UserOrmEntity,
} from '../entities';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number.parseInt(process.env.DB_PORT || '55432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'savcm',
  entities: [UserOrmEntity, PasswordResetTokenOrmEntity, EpsPatientOrmEntity, DoctorOrmEntity, ScheduleSlotOrmEntity, AppointmentOrmEntity],
  migrations: ['src/contexts/shared/infrastructure/database/migrations/*.ts'],
  synchronize: false,
});

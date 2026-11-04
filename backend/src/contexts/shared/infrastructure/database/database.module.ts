import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AppointmentOrmEntity,
  DoctorOrmEntity,
  EpsPatientOrmEntity,
  PasswordResetTokenOrmEntity,
  ScheduleSlotOrmEntity,
  UserOrmEntity,
} from './entities';

export const SAVCM_ENTITIES = [
  UserOrmEntity,
  PasswordResetTokenOrmEntity,
  EpsPatientOrmEntity,
  DoctorOrmEntity,
  ScheduleSlotOrmEntity,
  AppointmentOrmEntity,
];

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: Number.parseInt(process.env.DB_PORT || '55432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'savcm',
      entities: SAVCM_ENTITIES,
      synchronize: process.env.DB_SYNCHRONIZE !== 'false',
      retryAttempts: 5,
      retryDelay: 2000,
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}

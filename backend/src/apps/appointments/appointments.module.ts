import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AppointmentOrmEntity, DoctorOrmEntity, ScheduleSlotOrmEntity, UserOrmEntity } from '../../contexts/shared/infrastructure/database/entities';
import { AppointmentsService } from '../../contexts/appointments/application/appointments.service';
import { AppointmentsController } from './http/appointments.controller';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([AppointmentOrmEntity, ScheduleSlotOrmEntity, DoctorOrmEntity, UserOrmEntity])],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AppointmentOrmEntity, DoctorOrmEntity, ScheduleSlotOrmEntity, UserOrmEntity } from '../../contexts/shared/infrastructure/database/entities';
import { AppointmentsService } from '../../contexts/appointments/application/appointments.service';
import { AppointmentsController } from './http/appointments.controller';
import { APPOINTMENT_CANCELLATION_NOTIFIER } from '../../contexts/appointments/application/appointment-cancellation-notifier.port';
import { GmailAppointmentCancellationAdapter } from '../../contexts/appointments/infrastructure/email/gmail-appointment-cancellation.adapter';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([AppointmentOrmEntity, ScheduleSlotOrmEntity, DoctorOrmEntity, UserOrmEntity])],
  controllers: [AppointmentsController],
  providers: [
    AppointmentsService,
    GmailAppointmentCancellationAdapter,
    { provide: APPOINTMENT_CANCELLATION_NOTIFIER, useExisting: GmailAppointmentCancellationAdapter },
  ],
})
export class AppointmentsModule {}

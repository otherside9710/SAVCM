import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AppointmentOrmEntity, DoctorOrmEntity, ScheduleSlotOrmEntity } from '../../contexts/shared/infrastructure/database/entities';
import { SchedulesService } from '../../contexts/agenda/application/schedules.service';
import { SchedulesController } from './http/schedules.controller';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([ScheduleSlotOrmEntity, DoctorOrmEntity, AppointmentOrmEntity])],
  controllers: [SchedulesController],
  providers: [SchedulesService],
})
export class SchedulesModule {}

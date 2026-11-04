import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AppointmentOrmEntity, DoctorOrmEntity, ScheduleSlotOrmEntity } from '../../contexts/shared/infrastructure/database/entities';
import { ReportsService } from '../../contexts/reporting/application/reports.service';
import { ReportsController } from './http/reports.controller';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([AppointmentOrmEntity, ScheduleSlotOrmEntity, DoctorOrmEntity])],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}

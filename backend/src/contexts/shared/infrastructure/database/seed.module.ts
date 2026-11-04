import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseSeedService } from './seed.service';
import { AppointmentOrmEntity, DoctorOrmEntity, EpsPatientOrmEntity, ScheduleSlotOrmEntity, UserOrmEntity } from './entities';

@Module({
  imports: [TypeOrmModule.forFeature([UserOrmEntity, EpsPatientOrmEntity, DoctorOrmEntity, ScheduleSlotOrmEntity, AppointmentOrmEntity])],
  providers: [DatabaseSeedService],
})
export class SeedModule {}

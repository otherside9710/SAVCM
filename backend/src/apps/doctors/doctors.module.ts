import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DoctorOrmEntity, UserOrmEntity } from '../../contexts/shared/infrastructure/database/entities';
import { DoctorsService } from '../../contexts/agenda/application/doctors.service';
import { DoctorsController } from './http/doctors.controller';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([DoctorOrmEntity, UserOrmEntity])],
  controllers: [DoctorsController],
  providers: [DoctorsService],
})
export class DoctorsModule {}

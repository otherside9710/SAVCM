import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DoctorOrmEntity, EpsPatientOrmEntity, UserOrmEntity } from '../../contexts/shared/infrastructure/database/entities';
import { UserManagementService } from '../../contexts/identity/application/user-management.service';
import { AdminController } from './http/admin.controller';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([UserOrmEntity, EpsPatientOrmEntity, DoctorOrmEntity])],
  controllers: [AdminController],
  providers: [UserManagementService],
})
export class AdminModule {}

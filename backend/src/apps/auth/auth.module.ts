import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from '../../contexts/identity/application/auth.service';
import { PASSWORD_RESET_EMAIL } from '../../contexts/identity/application/password-reset-email.port';
import { GmailPasswordResetEmailAdapter } from '../../contexts/identity/infrastructure/email/gmail-password-reset-email.adapter';
import { DoctorOrmEntity, EpsPatientOrmEntity, PasswordResetTokenOrmEntity, UserOrmEntity } from '../../contexts/shared/infrastructure/database/entities';
import { AuthController } from './http/auth.controller';
import { JwtAuthGuard } from '../shared/http/guards/jwt-auth.guard';
import { RolesGuard } from '../shared/http/guards/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserOrmEntity, EpsPatientOrmEntity, DoctorOrmEntity, PasswordResetTokenOrmEntity]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'savcm-development-secret-change-before-deploy'),
        signOptions: { expiresIn: 8 * 60 * 60 },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    GmailPasswordResetEmailAdapter,
    { provide: PASSWORD_RESET_EMAIL, useExisting: GmailPasswordResetEmailAdapter },
  ],
  exports: [JwtModule, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}

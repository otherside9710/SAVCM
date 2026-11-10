import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Inject,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { RegisterDto } from '../../../apps/auth/http/dto/register.dto';
import { LoginDto } from '../../../apps/auth/http/dto/login.dto';
import { RequestPasswordResetDto } from '../../../apps/auth/http/dto/request-password-reset.dto';
import { ResetPasswordDto } from '../../../apps/auth/http/dto/reset-password.dto';
import { DoctorOrmEntity, EpsPatientOrmEntity, PasswordResetTokenOrmEntity, UserOrmEntity } from '../../shared/infrastructure/database/entities';
import { UserRole } from '../domain/role';
import { colombiaDate } from '../../shared/domain/colombia-time';
import { PASSWORD_RESET_EMAIL, PasswordResetEmailPort } from './password-reset-email.port';

const PASSWORD_RESET_RESPONSE = 'Si existe una cuenta activa con ese correo, recibirás instrucciones para cambiar la contraseña.';
const PASSWORD_RESET_EXPIRY_MS = 30 * 60 * 1000;
const PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserOrmEntity) private readonly users: Repository<UserOrmEntity>,
    @InjectRepository(EpsPatientOrmEntity) private readonly epsPatients: Repository<EpsPatientOrmEntity>,
    @InjectRepository(DoctorOrmEntity) private readonly doctors: Repository<DoctorOrmEntity>,
    @InjectRepository(PasswordResetTokenOrmEntity) private readonly passwordResetTokens: Repository<PasswordResetTokenOrmEntity>,
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @Inject(PASSWORD_RESET_EMAIL) private readonly passwordResetEmail: PasswordResetEmailPort,
  ) {}

  async register(input: RegisterDto) {
    const documentId = input.documentId.trim();
    const email = input.email.trim().toLowerCase();
    if (input.birthDate > colombiaDate()) throw new BadRequestException('La fecha de nacimiento no puede estar en el futuro.');
    const eligible = await this.epsPatients.findOneBy({ documentType: input.documentType, documentId, active: true });
    if (!eligible) {
      throw new ForbiddenException('La cédula no aparece en el padrón activo de pacientes de la EPS. Contacta a la IPS para validar tu afiliación.');
    }
    const existing = await this.users.findOne({ where: [{ documentId }, { email }] });
    if (existing) throw new ConflictException('La cédula o el correo ya tienen una cuenta registrada.');
    this.assertPasswordSetupReady();

    let user: UserOrmEntity;
    try {
      user = await this.users.save(this.users.create({
        documentType: input.documentType,
        documentId,
        email,
        passwordHash: await hash(randomBytes(32).toString('base64url'), 12),
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phone: input.phone.trim(),
        birthDate: input.birthDate,
        role: UserRole.PATIENT,
        active: true,
      }));
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new ConflictException('La cédula o el correo ya tienen una cuenta registrada.');
      }
      throw error;
    }
    const emailSent = await this.sendPasswordSetupForUser(user);
    return {
      message: emailSent
        ? 'Cuenta creada. Revisa tu correo y sigue el enlace para establecer tu contraseña; vence en 30 minutos.'
        : 'Cuenta creada, pero no se pudo enviar el enlace. Usa “¿Olvidaste tu contraseña?” para solicitar uno nuevo.',
    };
  }

  async login(input: LoginDto) {
    const identifier = input.identifier.trim();
    const user = await this.users.findOne({
      where: identifier.includes('@')
        ? { email: identifier.toLowerCase() }
        : { documentId: identifier },
    });
    if (!user?.active || !(await compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Cédula/correo o contraseña incorrectos.');
    }
    if (!Object.values(UserRole).includes(user.role)) {
      const legacyPatient = user.role === ('USER' as UserRole) && await this.epsPatients.existsBy({
        documentType: user.documentType,
        documentId: user.documentId,
        active: true,
      });
      if (!legacyPatient) {
        throw new UnauthorizedException('Esta cuenta tiene un perfil anterior y su cédula no está activa en el padrón EPS. Contacta al administrador para validar el acceso.');
      }
      user.role = UserRole.PATIENT;
      await this.users.save(user);
    }
    if (user.role === UserRole.PATIENT && !(await this.epsPatients.existsBy({ documentType: user.documentType, documentId: user.documentId, active: true }))) {
      throw new UnauthorizedException('La cuenta no está habilitada en el padrón activo de la EPS.');
    }
    return this.createSession(user);
  }

  async currentUser(userId: string) {
    const user = await this.users.findOneBy({ id: userId, active: true });
    if (!user) throw new UnauthorizedException('La cuenta no está activa.');
    const doctor = user.role === UserRole.DOCTOR
      ? await this.doctors.findOneBy({ userId: user.id, active: true })
      : null;
    return this.publicUser(user, doctor?.id);
  }

  assertPasswordSetupReady() {
    this.passwordResetEmail.assertReady();
    try {
      new URL(this.config.get<string>('APP_BASE_URL', 'http://localhost:5173'));
    } catch {
      throw new ServiceUnavailableException('La URL pública de la aplicación no está configurada correctamente.');
    }
  }

  async sendPasswordSetup(userId: string) {
    this.assertPasswordSetupReady();
    const user = await this.users.findOneBy({ id: userId, role: UserRole.PATIENT, active: true });
    return user ? this.sendPasswordSetupForUser(user) : false;
  }

  async requestPasswordReset(input: RequestPasswordResetDto) {
    this.assertPasswordSetupReady();
    const user = await this.users.findOneBy({ email: input.email.trim().toLowerCase(), active: true });
    if (!user) return { message: PASSWORD_RESET_RESPONSE };

    const now = new Date();
    const existing = await this.passwordResetTokens.findOneBy({ userId: user.id });
    if (
      existing && !existing.usedAt && existing.expiresAt > now &&
      existing.createdAt.getTime() > now.getTime() - PASSWORD_RESET_COOLDOWN_MS
    ) {
      return { message: PASSWORD_RESET_RESPONSE };
    }

    await this.sendPasswordSetupForUser(user);
    return { message: PASSWORD_RESET_RESPONSE };
  }

  private async sendPasswordSetupForUser(user: UserOrmEntity) {
    let appBaseUrl: URL;
    try {
      appBaseUrl = new URL(this.config.get<string>('APP_BASE_URL', 'http://localhost:5173'));
    } catch {
      throw new ServiceUnavailableException('La URL pública de la aplicación no está configurada correctamente.');
    }
    const now = new Date();
    const existing = await this.passwordResetTokens.findOneBy({ userId: user.id });
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const resetRecord = existing ?? this.passwordResetTokens.create({ userId: user.id });
    resetRecord.tokenHash = tokenHash;
    resetRecord.expiresAt = new Date(now.getTime() + PASSWORD_RESET_EXPIRY_MS);
    resetRecord.usedAt = null;
    resetRecord.createdAt = now;
    try {
      await this.passwordResetTokens.save(resetRecord);
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
        return false;
      }
      throw error;
    }

    const appUrl = new URL('/', appBaseUrl);
    appUrl.hash = `reset-password?token=${encodeURIComponent(token)}`;
    try {
      const sent = await this.passwordResetEmail.sendPasswordReset({
        email: user.email,
        firstName: user.firstName,
        resetUrl: appUrl.toString(),
      });
      if (!sent) await this.passwordResetTokens.delete({ userId: user.id, tokenHash });
      return sent;
    } catch (error) {
      await this.passwordResetTokens.delete({ userId: user.id, tokenHash });
      this.logger.error('No se pudo enviar un correo de recuperación.');
      return false;
    }
  }

  async resetPassword(input: ResetPasswordDto) {
    const tokenHash = createHash('sha256').update(input.token).digest('hex');
    const candidate = await this.passwordResetTokens.findOneBy({ tokenHash });
    const now = new Date();
    if (!candidate || candidate.usedAt || candidate.expiresAt <= now) {
      throw new BadRequestException('El enlace de recuperación no es válido o ya venció. Solicita uno nuevo.');
    }

    await this.dataSource.transaction(async (manager) => {
      const tokenRepository = manager.getRepository(PasswordResetTokenOrmEntity);
      const userRepository = manager.getRepository(UserOrmEntity);
      const resetRecord = await tokenRepository.findOne({
        where: { id: candidate.id },
        lock: { mode: 'pessimistic_write' },
      });
      const transactionNow = new Date();
      if (!resetRecord || resetRecord.usedAt || resetRecord.expiresAt <= transactionNow) {
        throw new BadRequestException('El enlace de recuperación no es válido o ya venció. Solicita uno nuevo.');
      }
      const user = await userRepository.findOne({
        where: { id: resetRecord.userId, active: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new BadRequestException('El enlace de recuperación no es válido o ya venció. Solicita uno nuevo.');

      user.passwordHash = await hash(input.password, 12);
      user.passwordChangedAt = transactionNow;
      await userRepository.save(user);
      resetRecord.usedAt = transactionNow;
      await tokenRepository.save(resetRecord);
    });

    return { message: 'La contraseña fue actualizada. Ya puedes iniciar sesión.' };
  }

  private async createSession(user: UserOrmEntity) {
    const doctor = user.role === UserRole.DOCTOR
      ? await this.doctors.findOneBy({ userId: user.id, active: true })
      : null;
    const publicUser = this.publicUser(user, doctor?.id);
    const accessToken = await this.jwtService.signAsync({
      ...publicUser,
      pwdv: user.passwordChangedAt?.getTime() ?? 0,
    });
    return { accessToken, user: publicUser };
  }

  private publicUser(user: UserOrmEntity, doctorId?: string) {
    return {
      sub: user.id,
      documentType: user.documentType,
      documentId: user.documentId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      ...(doctorId ? { doctorId } : {}),
    };
  }
}

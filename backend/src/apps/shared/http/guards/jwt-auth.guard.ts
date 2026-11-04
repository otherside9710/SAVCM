import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { DataSource } from 'typeorm';
import { AuthenticatedUser, UserRole } from '../../../../contexts/identity/domain/role';
import { EpsPatientOrmEntity, UserOrmEntity } from '../../../../contexts/shared/infrastructure/database/entities';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const authorization = request.headers.authorization;
    const [scheme, token] = authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Inicia sesión para continuar.');

    let tokenUser: AuthenticatedUser;
    try {
      tokenUser = await this.jwtService.verifyAsync<AuthenticatedUser>(token);
    } catch {
      throw new UnauthorizedException('La sesión venció o no es válida. Inicia sesión nuevamente.');
    }
    if (!Object.values(UserRole).includes(tokenUser.role)) {
      throw new UnauthorizedException('La cuenta tiene un perfil no reconocido. Inicia sesión con una cuenta válida o contacta al administrador.');
    }
    const activeUser = await this.dataSource.getRepository(UserOrmEntity)
      .findOneBy({ id: tokenUser.sub, active: true, role: tokenUser.role });
    if (!activeUser) throw new UnauthorizedException('La cuenta no está activa.');
    if ((tokenUser.pwdv ?? 0) !== (activeUser.passwordChangedAt?.getTime() ?? 0)) {
      throw new UnauthorizedException('La contraseña cambió. Inicia sesión nuevamente.');
    }
    if (tokenUser.role === 'PATIENT' && !(await this.dataSource.getRepository(EpsPatientOrmEntity)
      .existsBy({ documentType: activeUser.documentType, documentId: activeUser.documentId, active: true }))) {
      throw new UnauthorizedException('La cédula ya no está habilitada en el padrón activo de la EPS.');
    }
    request.user = tokenUser;
    return true;
  }
}

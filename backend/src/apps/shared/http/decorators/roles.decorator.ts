import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../../../contexts/identity/domain/role';

export const ROLES_KEY = 'savcm:roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { UserManagementService } from '../../../contexts/identity/application/user-management.service';
import { UserRole } from '../../../contexts/identity/domain/role';
import { AuthenticatedUser } from '../../../contexts/identity/domain/role';
import { CurrentUser } from '../../shared/http/decorators/current-user.decorator';
import { Roles } from '../../shared/http/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/http/guards/roles.guard';
import { AddRosterPatientDto, CreateReceptionistDto, SetActiveDto } from './dto/admin.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly management: UserManagementService) {}

  @Get('users') users() { return this.management.listUsers(); }
  @Post('users/receptionists') createReceptionist(@Body() input: CreateReceptionistDto) { return this.management.createReceptionist(input); }
  @Patch('users/:id/active') setUserActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: SetActiveDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.management.setUserActive(id, input.active, actor.sub);
  }
  @Get('eps-roster') roster() { return this.management.listRoster(); }
  @Post('eps-roster') addRosterPatient(@Body() input: AddRosterPatientDto) { return this.management.addRosterPatient(input.documentId.trim()); }
  @Patch('eps-roster/:documentId/active') setRosterActive(
    @Param('documentId') documentId: string,
    @Body() input: SetActiveDto,
  ) { return this.management.setRosterActive(documentId, input.active); }
}

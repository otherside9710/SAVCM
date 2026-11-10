import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserManagementService } from '../../../contexts/identity/application/user-management.service';
import { UserRole } from '../../../contexts/identity/domain/role';
import { AuthenticatedUser } from '../../../contexts/identity/domain/role';
import { CurrentUser } from '../../shared/http/decorators/current-user.decorator';
import { Roles } from '../../shared/http/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/http/guards/roles.guard';
import { AddRosterPatientDto, SetActiveDto } from './dto/admin.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly management: UserManagementService) {}

  @Get('users') users() { return this.management.listUsers(); }
  @Post('patients/import-csv')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  importPatientsCsv(@UploadedFile() file?: { buffer: Buffer }) {
    if (!file) throw new BadRequestException('Adjunta un archivo CSV para importar.');
    return this.management.importPatientsCsv(file.buffer.toString('utf8'));
  }
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

import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { DoctorsService } from '../../../contexts/agenda/application/doctors.service';
import { UserRole } from '../../../contexts/identity/domain/role';
import { Roles } from '../../shared/http/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/http/guards/roles.guard';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { SetActiveDto } from '../../admin/http/dto/admin.dto';

@Controller('doctors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DoctorsController {
  constructor(private readonly doctors: DoctorsService) {}

  @Get() list() { return this.doctors.list(); }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() input: CreateDoctorDto) { return this.doctors.create(input); }

  @Patch(':id/active')
  @Roles(UserRole.ADMIN)
  setActive(@Param('id', ParseUUIDPipe) id: string, @Body() input: SetActiveDto) {
    return this.doctors.setActive(id, input.active);
  }
}

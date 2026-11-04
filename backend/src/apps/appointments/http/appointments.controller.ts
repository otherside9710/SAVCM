import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsDateString, IsOptional } from 'class-validator';
import { AuthenticatedUser, UserRole } from '../../../contexts/identity/domain/role';
import { AppointmentStatus } from '../../../contexts/appointments/domain/appointment-status';
import { AppointmentsService } from '../../../contexts/appointments/application/appointments.service';
import { CurrentUser } from '../../shared/http/decorators/current-user.decorator';
import { Roles } from '../../shared/http/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/http/guards/roles.guard';
import { CancelAppointmentDto, ChangeAppointmentStatusDto, CreateAppointmentDto, RescheduleAppointmentDto } from './dto/create-appointment.dto';

class AppointmentRangeQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsDateString() date?: string;
}

@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: AppointmentRangeQuery) {
    return this.appointments.list(user, query.from, query.to, query.date);
  }

  @Post()
  @Roles(UserRole.PATIENT, UserRole.ADMIN)
  create(@Body() input: CreateAppointmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.appointments.create(input, user);
  }

  @Patch(':id/cancel')
  @Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.ADMIN)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CancelAppointmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) { return this.appointments.cancel(id, input.reason, user); }

  @Patch(':id/reschedule')
  @Roles(UserRole.PATIENT, UserRole.ADMIN)
  reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: RescheduleAppointmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) { return this.appointments.reschedule(id, input.slotId, user); }

  @Patch(':id/status')
  @Roles(UserRole.DOCTOR, UserRole.ADMIN)
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ChangeAppointmentStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) { return this.appointments.changeStatus(id, input.status as AppointmentStatus.COMPLETED | AppointmentStatus.NO_SHOW, user); }
}

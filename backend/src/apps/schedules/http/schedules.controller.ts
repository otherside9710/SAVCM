import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { SchedulesService } from '../../../contexts/agenda/application/schedules.service';
import { AuthenticatedUser, UserRole } from '../../../contexts/identity/domain/role';
import { CurrentUser } from '../../shared/http/decorators/current-user.decorator';
import { Roles } from '../../shared/http/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/http/guards/roles.guard';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { SetActiveDto } from '../../admin/http/dto/admin.dto';

class AvailabilityQuery {
  @IsDateString() date!: string;
  @IsOptional() @IsUUID() doctorId?: string;
}

class AdminAgendaQuery {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
  @IsOptional() @IsUUID() doctorId?: string;
}

@Controller('schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get('available')
  available(@Query() query: AvailabilityQuery) { return this.schedules.available(query.date, query.doctorId); }

  @Get('my')
  @Roles(UserRole.DOCTOR)
  myAgenda(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from: string,
    @Query('to') to: string,
  ) { return this.schedules.myAgenda(user, from, to); }

  @Get('admin')
  @Roles(UserRole.ADMIN)
  adminAgenda(@Query() query: AdminAgendaQuery) {
    return this.schedules.adminAgenda(query.from, query.to, query.doctorId);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() input: CreateScheduleDto) { return this.schedules.create(input); }

  @Patch(':id/active')
  @Roles(UserRole.ADMIN)
  setActive(@Param('id', ParseUUIDPipe) id: string, @Body() input: SetActiveDto) {
    return this.schedules.setSlotActive(id, input.active);
  }
}

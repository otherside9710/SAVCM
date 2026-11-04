import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsDateString } from 'class-validator';
import { ReportsService } from '../../../contexts/reporting/application/reports.service';
import { UserRole } from '../../../contexts/identity/domain/role';
import { Roles } from '../../shared/http/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/http/guards/roles.guard';

class ReportQuery {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
}

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  generate(@Query() query: ReportQuery) {
    if (query.from > query.to) throw new BadRequestException('La fecha inicial debe ser anterior o igual a la fecha final.');
    return this.reports.generate(query.from, query.to);
  }
}

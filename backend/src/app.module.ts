import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './contexts/shared/infrastructure/database/database.module';
import { AuthModule } from './apps/auth/auth.module';
import { DoctorsModule } from './apps/doctors/doctors.module';
import { SchedulesModule } from './apps/schedules/schedules.module';
import { AppointmentsModule } from './apps/appointments/appointments.module';
import { ReportsModule } from './apps/reports/reports.module';
import { SeedModule } from './contexts/shared/infrastructure/database/seed.module';
import { RequestLoggingMiddleware } from './apps/shared/http/middlewares/request-logging.middleware';
import { HealthController } from './apps/shared/http/health.controller';
import { AdminModule } from './apps/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    DoctorsModule,
    SchedulesModule,
    AppointmentsModule,
    ReportsModule,
    AdminModule,
    SeedModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}

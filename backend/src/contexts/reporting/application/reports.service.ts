import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { AppointmentStatus } from '../../appointments/domain/appointment-status';
import { AppointmentOrmEntity, DoctorOrmEntity, ScheduleSlotOrmEntity } from '../../shared/infrastructure/database/entities';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(AppointmentOrmEntity) private readonly appointments: Repository<AppointmentOrmEntity>,
    @InjectRepository(ScheduleSlotOrmEntity) private readonly slots: Repository<ScheduleSlotOrmEntity>,
    @InjectRepository(DoctorOrmEntity) private readonly doctors: Repository<DoctorOrmEntity>,
  ) {}

  async generate(from: string, to: string) {
    const appointments = await this.appointments.find({ where: { workDate: Between(from, to) } });
    const slots = await this.slots.find({ where: { workDate: Between(from, to), active: true } });
    const doctors = await this.doctors.find({ where: { active: true }, relations: { user: true } });
    const total = appointments.length;
    const count = (status: AppointmentStatus) => appointments.filter((item) => item.status === status).length;
    const scheduled = count(AppointmentStatus.SCHEDULED);
    const cancelled = count(AppointmentStatus.CANCELLED);
    const rescheduled = count(AppointmentStatus.RESCHEDULED);
    const completed = count(AppointmentStatus.COMPLETED);
    const noShow = count(AppointmentStatus.NO_SHOW);
    return {
      range: { from, to },
      totals: { total, scheduled, cancelled, rescheduled, completed, noShow },
      absenceRatePercent: total === 0 ? 0 : round((noShow / total) * 100),
      cancellationAndReschedulePercent: total === 0 ? 0 : round(((cancelled + rescheduled) / total) * 100),
      agendaOccupancyPercent: slots.length === 0 ? 0 : round((scheduled / slots.length) * 100),
      doctors: doctors.map((doctor) => {
        const doctorSlots = slots.filter((slot) => slot.doctorId === doctor.id);
        const doctorActive = appointments.filter((item) => item.doctorId === doctor.id && item.status === AppointmentStatus.SCHEDULED);
        return {
          doctorId: doctor.id,
          doctor: doctor.user ? `${doctor.user.firstName} ${doctor.user.lastName}` : 'Médico',
          offeredSlots: doctorSlots.length,
          reservedSlots: doctorActive.length,
          occupancyPercent: doctorSlots.length === 0 ? 0 : round((doctorActive.length / doctorSlots.length) * 100),
        };
      }),
    };
  }
}

function round(value: number): number { return Math.round(value * 10) / 10; }

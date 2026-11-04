import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuthenticatedUser, UserRole } from '../../identity/domain/role';
import { AppointmentStatus } from '../../appointments/domain/appointment-status';
import { AppointmentOrmEntity, DoctorOrmEntity, ScheduleSlotOrmEntity } from '../../shared/infrastructure/database/entities';
import { CreateScheduleDto } from '../../../apps/schedules/http/dto/create-schedule.dto';
import { colombiaDate, colombiaTime } from '../../shared/domain/colombia-time';

@Injectable()
export class SchedulesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ScheduleSlotOrmEntity) private readonly slots: Repository<ScheduleSlotOrmEntity>,
    @InjectRepository(DoctorOrmEntity) private readonly doctors: Repository<DoctorOrmEntity>,
    @InjectRepository(AppointmentOrmEntity) private readonly appointments: Repository<AppointmentOrmEntity>,
  ) {}

  async create(input: CreateScheduleDto) {
    const start = toMinutes(input.startTime);
    const end = toMinutes(input.endTime);
    const duration = input.slotMinutes;
    if (input.date < colombiaDate()) throw new BadRequestException('No se pueden crear horarios en fechas anteriores a hoy.');
    if (end <= start || (end - start) % duration !== 0) {
      throw new BadRequestException('El horario final debe ser posterior al inicial y dividirse exactamente en bloques de la duración indicada.');
    }
    return this.dataSource.transaction(async (manager) => {
      const doctor = await manager.findOne(DoctorOrmEntity, {
        where: { id: input.doctorId, active: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!doctor) throw new NotFoundException('El médico seleccionado no está activo.');
      const overlapping = await manager.createQueryBuilder(ScheduleSlotOrmEntity, 'slot')
        .where('slot.doctorId = :doctorId AND slot.workDate = :date AND slot.active = true', { doctorId: input.doctorId, date: input.date })
        .andWhere('slot.startTime < :endTime AND slot.endTime > :startTime', { startTime: `${input.startTime}:00`, endTime: `${input.endTime}:00` })
        .getCount();
      if (overlapping) throw new ConflictException('Ese rango se cruza con una franja que ya existe para el médico.');

      const room = input.room?.trim() || doctor.defaultRoom;
      const newSlots: Partial<ScheduleSlotOrmEntity>[] = [];
      for (let minute = start; minute < end; minute += duration) {
        newSlots.push({
          doctorId: doctor.id,
          workDate: input.date,
          startTime: toTime(minute),
          endTime: toTime(minute + duration),
          room,
          active: true,
        });
      }
      return manager.save(ScheduleSlotOrmEntity, newSlots);
    });
  }

  async available(date: string, doctorId?: string) {
    if (date < colombiaDate()) return [];
    const query = this.slots.createQueryBuilder('slot')
      .leftJoin('slot.doctor', 'doctor')
      .leftJoin('doctor.user', 'doctorUser')
      .leftJoin(AppointmentOrmEntity, 'appointment', 'appointment.slotId = slot.id AND appointment.status = :scheduled', { scheduled: AppointmentStatus.SCHEDULED })
      .select([
        'slot.id AS "slotId"', 'slot.doctorId AS "doctorId"', 'doctorUser.firstName AS "doctorFirstName"',
        'doctorUser.lastName AS "doctorLastName"', 'doctor.specialty AS specialty', 'slot.workDate AS date',
        'slot.startTime AS "startTime"', 'slot.endTime AS "endTime"', 'slot.room AS room',
      ])
      .addSelect('appointment.id IS NULL', 'available')
      .where('slot.workDate = :date AND slot.active = true AND doctor.active = true', { date })
      .andWhere('appointment.id IS NULL');
    if (date === colombiaDate()) query.andWhere('slot.startTime > :currentTime', { currentTime: `${colombiaTime()}:00` });
    if (doctorId) query.andWhere('slot.doctorId = :doctorId', { doctorId });
    return query.orderBy('slot.startTime', 'ASC').getRawMany();
  }

  async myAgenda(user: AuthenticatedUser, from: string, to: string) {
    if (!user.doctorId) return [];
    const rows = await this.slots.find({
      where: { doctorId: user.doctorId, active: true },
      relations: { doctor: { user: true } },
      order: { workDate: 'ASC', startTime: 'ASC' },
    });
    const selected = rows.filter((slot) => slot.workDate >= from && slot.workDate <= to);
    const occupied = new Set((await this.appointments.find({
      where: { doctorId: user.doctorId, status: AppointmentStatus.SCHEDULED },
      select: { slotId: true },
    })).map((appointment) => appointment.slotId));
    return selected.map(({ doctor, ...slot }) => ({
      ...slot,
      doctor: doctor ? {
        id: doctor.id,
        specialty: doctor.specialty,
        defaultRoom: doctor.defaultRoom,
        user: doctor.user ? { firstName: doctor.user.firstName, lastName: doctor.user.lastName } : null,
      } : null,
      available: !occupied.has(slot.id),
    }));
  }

  async setSlotActive(id: string, active: boolean) {
    const slot = await this.slots.findOneBy({ id });
    if (!slot) throw new NotFoundException('No encontramos el horario solicitado.');
    const hasBooking = await this.appointments.existsBy({ slotId: id, status: AppointmentStatus.SCHEDULED });
    if (!active && hasBooking) throw new ConflictException('No se puede cerrar un horario con una cita agendada; cancela o reprograma la cita primero.');
    await this.slots.update(id, { active });
    return { id, active };
  }
}

function toMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function toTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`;
}

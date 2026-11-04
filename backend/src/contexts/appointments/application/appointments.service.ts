import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm';
import { AuthenticatedUser, UserRole } from '../../identity/domain/role';
import { AppointmentStatus } from '../domain/appointment-status';
import { AppointmentOrmEntity, DoctorOrmEntity, ScheduleSlotOrmEntity, UserOrmEntity } from '../../shared/infrastructure/database/entities';
import { CreateAppointmentDto } from '../../../apps/appointments/http/dto/create-appointment.dto';
import { colombiaDate, colombiaTime } from '../../shared/domain/colombia-time';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(AppointmentOrmEntity) private readonly appointments: Repository<AppointmentOrmEntity>,
    @InjectRepository(UserOrmEntity) private readonly users: Repository<UserOrmEntity>,
  ) {}

  async create(input: CreateAppointmentDto, actor: AuthenticatedUser) {
    const patient = await this.resolvePatient(actor, input.patientDocument);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const slot = await this.lockAvailableSlot(manager, input.slotId);
        await this.assertNoPatientCollision(manager, patient.id, slot);
        const appointment = await manager.save(manager.create(AppointmentOrmEntity, {
          patientId: patient.id,
          doctorId: slot.doctorId,
          slotId: slot.id,
          workDate: slot.workDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: AppointmentStatus.SCHEDULED,
          reason: input.reason?.trim() || null,
          cancellationReason: null,
        }));
        return this.getForResponse(appointment.id, manager);
      });
    } catch (error) {
      this.mapUniqueConflict(error);
    }
  }

  async list(actor: AuthenticatedUser, from?: string, to?: string, date?: string) {
    const query = this.appointments.createQueryBuilder('appointment')
      .innerJoin('appointment.patient', 'patient')
      .innerJoin('appointment.doctor', 'doctor')
      .innerJoin('appointment.slot', 'slot')
      .innerJoin('doctor.user', 'doctorUser')
      .select([
        'appointment.id AS id', 'appointment.patientId AS "patientId"', 'appointment.doctorId AS "doctorId"',
        'appointment.slotId AS "slotId"', 'appointment.workDate AS date', 'appointment.startTime AS "startTime"',
        'appointment.endTime AS "endTime"', 'appointment.status AS status', 'appointment.reason AS reason',
        'appointment.cancellationReason AS "cancellationReason"', 'appointment.createdAt AS "createdAt"',
        'patient.documentId AS "patientDocument"', 'patient.firstName AS "patientFirstName"',
        'patient.lastName AS "patientLastName"', 'doctor.specialty AS specialty', 'slot.room AS "defaultRoom"',
        'doctorUser.firstName AS "doctorFirstName"', 'doctorUser.lastName AS "doctorLastName"',
      ]);
    if (actor.role === UserRole.PATIENT) query.andWhere('appointment.patientId = :patientId', { patientId: actor.sub });
    else if (actor.role === UserRole.DOCTOR) query.andWhere('appointment.doctorId = :doctorId', { doctorId: actor.doctorId });
    if (date) query.andWhere('appointment.workDate = :date', { date });
    else {
      if (from) query.andWhere('appointment.workDate >= :from', { from });
      if (to) query.andWhere('appointment.workDate <= :to', { to });
    }
    return query.orderBy('appointment.workDate', 'ASC').addOrderBy('appointment.startTime', 'ASC').getRawMany();
  }

  async cancel(id: string, reason: string, actor: AuthenticatedUser) {
    return this.dataSource.transaction(async (manager) => {
      const appointment = await manager.findOne(AppointmentOrmEntity, {
        where: { id }, lock: { mode: 'pessimistic_write' },
      });
      if (!appointment) throw new NotFoundException('No encontramos la cita solicitada.');
      this.assertCanManage(appointment, actor);
      if (appointment.status !== AppointmentStatus.SCHEDULED) {
        throw new ConflictException('Solo se pueden cancelar citas que están agendadas.');
      }
      appointment.status = AppointmentStatus.CANCELLED;
      appointment.cancellationReason = reason.trim();
      await manager.save(appointment);
      return this.getForResponse(appointment.id, manager);
    });
  }

  async reschedule(id: string, slotId: string, actor: AuthenticatedUser) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const previous = await manager.findOne(AppointmentOrmEntity, {
          where: { id }, lock: { mode: 'pessimistic_write' },
        });
        if (!previous) throw new NotFoundException('No encontramos la cita solicitada.');
        this.assertCanManage(previous, actor);
        if (previous.status !== AppointmentStatus.SCHEDULED) {
          throw new ConflictException('Solo se pueden reprogramar citas que están agendadas.');
        }
        const slot = await this.lockAvailableSlot(manager, slotId);
        await this.assertNoPatientCollision(manager, previous.patientId, slot, previous.id);
        previous.status = AppointmentStatus.RESCHEDULED;
        previous.cancellationReason = 'Cita reprogramada';
        await manager.save(previous);
        const replacement = await manager.save(manager.create(AppointmentOrmEntity, {
          patientId: previous.patientId,
          doctorId: slot.doctorId,
          slotId: slot.id,
          workDate: slot.workDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: AppointmentStatus.SCHEDULED,
          reason: previous.reason,
          cancellationReason: null,
        }));
        return { previous: await this.getForResponse(previous.id, manager), appointment: await this.getForResponse(replacement.id, manager) };
      });
    } catch (error) {
      this.mapUniqueConflict(error);
    }
  }

  async changeStatus(id: string, status: AppointmentStatus.COMPLETED | AppointmentStatus.NO_SHOW, actor: AuthenticatedUser) {
    return this.dataSource.transaction(async (manager) => {
      const appointment = await manager.findOne(AppointmentOrmEntity, {
        where: { id }, lock: { mode: 'pessimistic_write' },
      });
      if (!appointment) throw new NotFoundException('No encontramos la cita solicitada.');
      if (actor.role === UserRole.DOCTOR && appointment.doctorId !== actor.doctorId) {
        throw new ForbiddenException('Solo puedes actualizar citas de tu agenda.');
      }
      if (![UserRole.DOCTOR, UserRole.ADMIN, UserRole.RECEPTIONIST].includes(actor.role)) {
        throw new ForbiddenException('No tienes permiso para actualizar el estado de esta cita.');
      }
      if (appointment.status !== AppointmentStatus.SCHEDULED) {
        throw new ConflictException('El estado solo se puede actualizar para una cita agendada.');
      }
      appointment.status = status;
      await manager.save(appointment);
      return this.getForResponse(appointment.id, manager);
    });
  }

  private async resolvePatient(actor: AuthenticatedUser, patientDocument?: string): Promise<UserOrmEntity> {
    if (actor.role === UserRole.PATIENT) {
      const patient = await this.users.findOneBy({ id: actor.sub, role: UserRole.PATIENT, active: true });
      if (!patient) throw new ForbiddenException('La cuenta de paciente no está activa.');
      return patient;
    }
    if (![UserRole.RECEPTIONIST, UserRole.ADMIN].includes(actor.role) || !patientDocument) {
      throw new BadRequestException('Recepción debe indicar la cédula del paciente que solicita la cita.');
    }
    const patient = await this.users.findOneBy({ documentId: patientDocument.trim(), role: UserRole.PATIENT, active: true });
    if (!patient) throw new NotFoundException('La cédula no corresponde a un paciente registrado y activo.');
    return patient;
  }

  private async lockAvailableSlot(manager: EntityManager, slotId: string): Promise<ScheduleSlotOrmEntity> {
    const slot = await manager.findOne(ScheduleSlotOrmEntity, {
      where: { id: slotId, active: true },
      lock: { mode: 'pessimistic_write' },
    });
    if (!slot) throw new ConflictException('El horario ya no se encuentra disponible. Actualiza la lista de horarios.');
    if (slot.workDate < colombiaDate() || (slot.workDate === colombiaDate() && slot.startTime.slice(0, 5) <= colombiaTime())) {
      throw new ConflictException('Ese horario ya pasó. Actualiza la fecha y elige una cita futura.');
    }
    const doctor = await manager.findOne(DoctorOrmEntity, { where: { id: slot.doctorId, active: true } });
    if (!doctor) throw new ConflictException('La agenda del médico ya no está disponible. Actualiza los horarios.');
    const occupied = await manager.existsBy(AppointmentOrmEntity, { slotId: slot.id, status: AppointmentStatus.SCHEDULED });
    if (occupied) throw new ConflictException('El horario ya no se encuentra disponible. Actualiza la lista de horarios.');
    return slot;
  }

  private async assertNoPatientCollision(manager: EntityManager, patientId: string, slot: ScheduleSlotOrmEntity, excludeId?: string) {
    const query = manager.createQueryBuilder(AppointmentOrmEntity, 'appointment')
      .where('appointment.patientId = :patientId AND appointment.workDate = :workDate AND appointment.startTime = :startTime AND appointment.status = :status', {
        patientId, workDate: slot.workDate, startTime: slot.startTime, status: AppointmentStatus.SCHEDULED,
      });
    if (excludeId) query.andWhere('appointment.id <> :excludeId', { excludeId });
    if (await query.getExists()) throw new ConflictException('Ya tienes otra cita activa en ese mismo horario.');
  }

  private assertCanManage(appointment: AppointmentOrmEntity, actor: AuthenticatedUser) {
    if (actor.role === UserRole.PATIENT && appointment.patientId !== actor.sub) {
      throw new ForbiddenException('Solo puedes gestionar tus propias citas.');
    }
    if (![UserRole.PATIENT, UserRole.RECEPTIONIST, UserRole.ADMIN].includes(actor.role)) {
      throw new ForbiddenException('No tienes permiso para gestionar esta cita.');
    }
  }

  private async getForResponse(id: string, manager: EntityManager) {
    return manager.createQueryBuilder(AppointmentOrmEntity, 'appointment')
      .innerJoin('appointment.patient', 'patient')
      .innerJoin('appointment.doctor', 'doctor')
      .innerJoin('appointment.slot', 'slot')
      .innerJoin('doctor.user', 'doctorUser')
      .select([
        'appointment.id AS id', 'appointment.workDate AS date', 'appointment.startTime AS "startTime"',
        'appointment.endTime AS "endTime"', 'appointment.status AS status', 'appointment.reason AS reason',
        'appointment.cancellationReason AS "cancellationReason"', 'appointment.slotId AS "slotId"',
        'patient.documentId AS "patientDocument"', 'patient.firstName AS "patientFirstName"',
        'patient.lastName AS "patientLastName"', 'doctor.id AS "doctorId"', 'doctor.specialty AS specialty',
        'doctorUser.firstName AS "doctorFirstName"', 'doctorUser.lastName AS "doctorLastName"', 'slot.room AS "defaultRoom"',
      ])
      .where('appointment.id = :id', { id })
      .getRawOne();
  }

  private mapUniqueConflict(error: unknown): never {
    if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
      throw new ConflictException('El horario ya fue reservado o tienes otra cita activa en ese bloque. Actualiza la disponibilidad.');
    }
    throw error;
  }
}

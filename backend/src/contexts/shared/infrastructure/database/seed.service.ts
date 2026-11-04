import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource, Repository } from 'typeorm';
import { UserRole } from '../../../identity/domain/role';
import { AppointmentOrmEntity, DoctorOrmEntity, EpsPatientOrmEntity, ScheduleSlotOrmEntity, UserOrmEntity } from './entities';

interface RosterFile { patients: Array<{ documentId: string; active?: boolean }>; }

const ADDITIONAL_DEMO_DOCTORS = [
  { firstName: 'Diego', lastName: 'Torres' },
  { firstName: 'Mariana', lastName: 'López' },
  { firstName: 'Andrés', lastName: 'Castro' },
  { firstName: 'Valentina', lastName: 'Rojas' },
  { firstName: 'Camilo', lastName: 'Herrera' },
  { firstName: 'Paula', lastName: 'Mendoza' },
  { firstName: 'Sebastián', lastName: 'Vargas' },
  { firstName: 'Natalia', lastName: 'Gómez' },
  { firstName: 'Mateo', lastName: 'Ramírez' },
  { firstName: 'Laura', lastName: 'Martínez' },
];

@Injectable()
export class DatabaseSeedService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseSeedService.name);
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(UserOrmEntity) private readonly users: Repository<UserOrmEntity>,
    @InjectRepository(EpsPatientOrmEntity) private readonly roster: Repository<EpsPatientOrmEntity>,
    @InjectRepository(DoctorOrmEntity) private readonly doctors: Repository<DoctorOrmEntity>,
    @InjectRepository(ScheduleSlotOrmEntity) private readonly slots: Repository<ScheduleSlotOrmEntity>,
  ) {}

  async onModuleInit() {
    const rosterPath = join(process.cwd(), 'data', 'eps-patient-roster.json');
    const rosterFile = JSON.parse(readFileSync(rosterPath, 'utf8')) as RosterFile;
    if (rosterFile.patients.length) {
      await this.roster.createQueryBuilder().insert()
        .values(rosterFile.patients.map((patient) => ({ documentType: 'CC', documentId: patient.documentId, active: patient.active !== false })))
        .orIgnore()
        .execute();
    }
    if (process.env.DEMO_SEED !== 'true') {
      this.logger.log(`Padrón de EPS cargado (${rosterFile.patients.length} cédulas de demostración/configuración).`);
      return;
    }
    await this.seedDemoAccountsAndAgenda();
  }

  private async seedDemoAccountsAndAgenda() {
    const receptionist = await this.ensureUser({
      documentId: '1000000004', email: 'recepcion@savcm.local', firstName: 'Sofía', lastName: 'Recepción',
      role: UserRole.RECEPTIONIST, password: process.env.DEMO_RECEPTION_PASSWORD || 'Recepcion123!',
    });
    await this.ensureUser({
      documentId: '1000000005', email: 'admin@savcm.local', firstName: 'Alex', lastName: 'Administrador',
      role: UserRole.ADMIN, password: process.env.DEMO_ADMIN_PASSWORD || 'Admin123!',
    });
    const doctorUser = await this.ensureUser({
      documentId: '1000000006', email: 'doctor@savcm.local', firstName: 'Camila', lastName: 'Médica',
      role: UserRole.DOCTOR, password: process.env.DEMO_DOCTOR_PASSWORD || 'Doctor123!',
    });
    let doctor = await this.doctors.findOneBy({ userId: doctorUser.id });
    if (!doctor) doctor = await this.doctors.save(this.doctors.create({ userId: doctorUser.id, specialty: 'Medicina General', defaultRoom: 'Consultorio 1', active: true }));
    await this.seedUpcomingSlots(doctor);

    for (const [index, profile] of ADDITIONAL_DEMO_DOCTORS.entries()) {
      const suffix = String(index + 1).padStart(2, '0');
      const additionalUser = await this.ensureUser({
        documentId: String(2_000_000_000 + index + 1),
        email: `medico${suffix}@savcm.local`,
        firstName: profile.firstName,
        lastName: profile.lastName,
        role: UserRole.DOCTOR,
        password: process.env.DEMO_DOCTOR_PASSWORD || 'Doctor123!',
      });
      let additionalDoctor = await this.doctors.findOneBy({ userId: additionalUser.id });
      if (!additionalDoctor) {
        additionalDoctor = await this.doctors.save(this.doctors.create({
          userId: additionalUser.id,
          specialty: 'Medicina General',
          defaultRoom: `Consultorio ${index + 2}`,
          active: true,
        }));
      }
      await this.seedUpcomingSlots(additionalDoctor);
    }

    this.logger.log(`Datos de demostración listos. Recepción: ${receptionist.email}; médico: ${doctorUser.email}.`);
  }

  private async ensureUser(input: {
    documentId: string; email: string; firstName: string; lastName: string; role: UserRole; password: string;
  }): Promise<UserOrmEntity> {
    const existing = await this.users.findOneBy({ documentId: input.documentId });
    if (existing) return existing;
    return this.users.save(this.users.create({
      documentId: input.documentId,
      email: input.email,
      passwordHash: await hash(input.password, 12),
      firstName: input.firstName,
      lastName: input.lastName,
      phone: null,
      birthDate: null,
      role: input.role,
      active: true,
    }));
  }

  private async seedUpcomingSlots(doctor: DoctorOrmEntity) {
    const slots: Array<Partial<ScheduleSlotOrmEntity>> = [];
    const day = new Date();
    day.setHours(12, 0, 0, 0);
    for (let offset = 1; offset <= 30; offset += 1) {
      day.setDate(day.getDate() + 1);
      if (day.getDay() === 0 || day.getDay() === 6) continue;
      const workDate = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      for (const [fromHour, untilHour] of [[8, 12], [13, 16]]) {
        for (let minute = fromHour * 60; minute + 30 <= untilHour * 60; minute += 30) {
          const startHour = Math.floor(minute / 60);
          const endMinute = minute + 30;
          slots.push({
            doctorId: doctor.id,
            workDate,
            startTime: `${String(startHour).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00`,
            endTime: `${String(Math.floor(endMinute / 60)).padStart(2, '0')}:${String(endMinute % 60).padStart(2, '0')}:00`,
            room: doctor.defaultRoom,
            active: true,
          });
        }
      }
    }
    if (slots.length) {
      await this.dataSource.createQueryBuilder().insert().into(ScheduleSlotOrmEntity).values(slots).orIgnore().execute();
    }
  }
}

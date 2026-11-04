import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcryptjs';
import { Repository } from 'typeorm';
import { DoctorOrmEntity, UserOrmEntity } from '../../shared/infrastructure/database/entities';
import { UserRole } from '../../identity/domain/role';
import { CreateDoctorDto } from '../../../apps/doctors/http/dto/create-doctor.dto';

@Injectable()
export class DoctorsService {
  constructor(
    @InjectRepository(DoctorOrmEntity) private readonly doctors: Repository<DoctorOrmEntity>,
    @InjectRepository(UserOrmEntity) private readonly users: Repository<UserOrmEntity>,
  ) {}

  list() {
    return this.doctors.find({
      where: { active: true },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    }).then((doctors) => doctors.map(({ user, ...doctor }) => ({
      ...doctor,
      name: user ? `${user.firstName} ${user.lastName}` : 'Médico',
      email: user?.email,
    })));
  }

  async create(input: CreateDoctorDto) {
    const documentId = input.documentId.trim();
    const email = input.email.trim().toLowerCase();
    if (await this.users.findOne({ where: [{ documentId }, { email }] })) {
      throw new ConflictException('La cédula o el correo ya están registrados.');
    }
    const user = await this.users.save(this.users.create({
      documentId,
      email,
      passwordHash: await hash(input.password, 12),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: input.phone?.trim() ?? null,
      birthDate: null,
      role: UserRole.DOCTOR,
      active: true,
    }));
    const doctor = await this.doctors.save(this.doctors.create({
      userId: user.id,
      specialty: input.specialty?.trim() || 'Medicina General',
      defaultRoom: input.room?.trim() || null,
      active: true,
    }));
    return { ...doctor, name: `${user.firstName} ${user.lastName}`, email: user.email };
  }

  async setActive(id: string, active: boolean) {
    const doctor = await this.doctors.findOne({ where: { id }, relations: { user: true } });
    if (!doctor) throw new NotFoundException('No encontramos el médico solicitado.');
    await this.doctors.update(id, { active });
    if (doctor.user) await this.users.update(doctor.user.id, { active });
    return { id, active };
  }
}

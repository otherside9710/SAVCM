import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcryptjs';
import { Repository } from 'typeorm';
import { CreateReceptionistDto } from '../../../apps/admin/http/dto/admin.dto';
import { DoctorOrmEntity, EpsPatientOrmEntity, UserOrmEntity } from '../../shared/infrastructure/database/entities';
import { UserRole } from '../domain/role';

@Injectable()
export class UserManagementService {
  constructor(
    @InjectRepository(UserOrmEntity) private readonly users: Repository<UserOrmEntity>,
    @InjectRepository(EpsPatientOrmEntity) private readonly roster: Repository<EpsPatientOrmEntity>,
    @InjectRepository(DoctorOrmEntity) private readonly doctors: Repository<DoctorOrmEntity>,
  ) {}

  async listUsers() {
    const users = await this.users.find({ order: { createdAt: 'DESC' } });
    return users.map(({ passwordHash: _secret, ...user }) => user);
  }

  async createReceptionist(input: CreateReceptionistDto) {
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
      phone: null,
      birthDate: null,
      role: UserRole.RECEPTIONIST,
      active: true,
    }));
    const { passwordHash: _secret, ...publicUser } = user;
    return publicUser;
  }

  async setUserActive(id: string, active: boolean, actorId: string) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException('No encontramos la cuenta solicitada.');
    if (id === actorId && !active) throw new ConflictException('No puedes desactivar tu propia cuenta de administrador.');
    await this.users.update(id, { active });
    if (user.role === UserRole.DOCTOR) {
      const doctor = await this.doctors.findOneBy({ userId: id });
      if (doctor) await this.doctors.update(doctor.id, { active });
    }
    return { id, active };
  }

  listRoster() { return this.roster.find({ order: { documentId: 'ASC' } }); }

  async addRosterPatient(documentId: string) {
    const existing = await this.roster.findOneBy({ documentId });
    if (existing?.active) throw new ConflictException('La cédula ya se encuentra activa en el padrón.');
    if (existing) {
      await this.roster.update(documentId, { active: true });
      return { documentId, active: true };
    }
    return this.roster.save(this.roster.create({ documentId, active: true }));
  }

  async setRosterActive(documentId: string, active: boolean) {
    const patient = await this.roster.findOneBy({ documentId });
    if (!patient) throw new NotFoundException('La cédula no aparece en el padrón.');
    await this.roster.update(documentId, { active });
    if (!active) await this.users.update({ documentId, role: UserRole.PATIENT }, { active: false });
    return { documentId, active };
  }
}

import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { DoctorOrmEntity, EpsPatientOrmEntity, UserOrmEntity } from '../../shared/infrastructure/database/entities';
import { UserRole } from '../domain/role';
import { colombiaDate } from '../../shared/domain/colombia-time';
import { AuthService } from './auth.service';

@Injectable()
export class UserManagementService {
  private readonly logger = new Logger(UserManagementService.name);

  constructor(
    @InjectRepository(UserOrmEntity) private readonly users: Repository<UserOrmEntity>,
    @InjectRepository(EpsPatientOrmEntity) private readonly roster: Repository<EpsPatientOrmEntity>,
    @InjectRepository(DoctorOrmEntity) private readonly doctors: Repository<DoctorOrmEntity>,
    private readonly dataSource: DataSource,
    private readonly authService: AuthService,
  ) {}

  async listUsers() {
    const users = await this.users.find({
      where: [
        { role: UserRole.PATIENT },
        { role: UserRole.DOCTOR },
        { role: UserRole.ADMIN },
      ],
      order: { createdAt: 'DESC' },
    });
    return users.map(({ passwordHash: _secret, ...user }) => user);
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

  async importPatientsCsv(csvText: string) {
    this.authService.assertPasswordSetupReady();
    const records = parseCsv(csvText);
    if (records.length < 2) throw new BadRequestException('El CSV debe incluir la fila de encabezados y al menos un paciente.');
    const headers = records[0].map(normalizeHeader);
    const requiredHeaders = ['cedula', 'nombres', 'apellidos', 'correo', 'telefono', 'fecha_nacimiento'];
    const missing = requiredHeaders.filter((header) => !headers.includes(header));
    if (missing.length) throw new BadRequestException(`Faltan columnas requeridas: ${missing.join(', ')}.`);

    const rows = records.slice(1).map((cells, index) => ({ cells, row: index + 2 })).filter(({ cells }) => cells.some((cell) => cell.trim()));
    if (!rows.length) throw new BadRequestException('El CSV no contiene pacientes para importar.');
    if (rows.length > 500) throw new BadRequestException('Puedes importar hasta 500 pacientes por archivo.');

    const column = Object.fromEntries(headers.map((header, index) => [header, index]));
    const candidates: Array<{ row: number; documentId: string; firstName: string; lastName: string; email: string; phone: string; birthDate: string }> = [];
    const errors: Array<{ row: number; message: string }> = [];
    const seenDocuments = new Set<string>();
    const seenEmails = new Set<string>();
    rows.forEach(({ cells, row }) => {
      const value = (key: string) => (cells[column[key]] ?? '').trim();
      const documentId = value('cedula');
      const firstName = value('nombres');
      const lastName = value('apellidos');
      const email = value('correo').toLowerCase();
      const phone = value('telefono');
      const birthDate = value('fecha_nacimiento');
      const issues: string[] = [];
      if (!/^\d{6,20}$/.test(documentId)) issues.push('la cédula debe tener entre 6 y 20 dígitos');
      if (firstName.length < 2 || firstName.length > 100) issues.push('los nombres deben tener entre 2 y 100 caracteres');
      if (lastName.length < 2 || lastName.length > 100) issues.push('los apellidos deben tener entre 2 y 100 caracteres');
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) issues.push('el correo no es válido');
      if (!/^\+?[0-9 ()-]{7,20}$/.test(phone)) issues.push('el teléfono no es válido');
      if (!isValidDate(birthDate) || birthDate > colombiaDate()) issues.push('la fecha de nacimiento debe usar AAAA-MM-DD y no estar en el futuro');
      if (!issues.length) {
        if (seenDocuments.has(documentId)) issues.push('la cédula está repetida en el archivo');
        if (seenEmails.has(email)) issues.push('el correo está repetido en el archivo');
      }
      if (issues.length) errors.push({ row, message: issues.join('; ') });
      else {
        seenDocuments.add(documentId);
        seenEmails.add(email);
        candidates.push({ row, documentId, firstName, lastName, email, phone, birthDate });
      }
    });

    if (!candidates.length) {
      return { totalRows: rows.length, created: 0, skipped: rows.length, setupLinksSent: 0, setupLinkFailures: [], errors };
    }
    const existingUsers = await this.users.find({
      where: [
        { documentId: In(candidates.map((patient) => patient.documentId)) },
        { email: In(candidates.map((patient) => patient.email)) },
      ],
      select: ['documentId', 'email'],
    });
    const existingDocuments = new Set(existingUsers.map((user) => user.documentId));
    const existingEmails = new Set(existingUsers.map((user) => user.email.toLowerCase()));
    const uniqueCandidates = candidates.filter((patient) => {
      const conflict = existingDocuments.has(patient.documentId) || existingEmails.has(patient.email);
      if (conflict) errors.push({ row: patient.row, message: 'la cédula o el correo ya tienen una cuenta registrada' });
      return !conflict;
    });
    const prepared = await Promise.all(uniqueCandidates.map(async (patient) => ({
      ...patient,
      passwordHash: await hash(randomBytes(32).toString('base64url'), 12),
    })));
    const createdAccounts: Array<{ id: string; row: number }> = [];

    try {
      await this.dataSource.transaction(async (manager) => {
        for (const patient of prepared) {
          const account = await manager.save(manager.create(UserOrmEntity, {
            documentType: 'CC', documentId: patient.documentId, email: patient.email,
            passwordHash: patient.passwordHash, firstName: patient.firstName, lastName: patient.lastName,
            phone: patient.phone, birthDate: patient.birthDate, role: UserRole.PATIENT, active: true,
          }));
          createdAccounts.push({ id: account.id, row: patient.row });
          const epsPatient = await manager.findOne(EpsPatientOrmEntity, { where: { documentType: 'CC', documentId: patient.documentId } });
          if (epsPatient) {
            epsPatient.active = true;
            await manager.save(epsPatient);
          } else {
            await manager.save(manager.create(EpsPatientOrmEntity, { documentType: 'CC', documentId: patient.documentId, active: true }));
          }
        }
      });
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new ConflictException('Una cédula o correo del archivo acaba de registrarse en otra solicitud. Revisa las cuentas existentes e intenta de nuevo.');
      }
      throw error;
    }

    let setupLinksSent = 0;
    const setupLinkFailures: Array<{ row: number }> = [];
    for (let index = 0; index < createdAccounts.length; index += 5) {
      const batch = createdAccounts.slice(index, index + 5);
      const outcomes = await Promise.all(batch.map(async (patient) => {
        try {
          const sent = await this.authService.sendPasswordSetup(patient.id);
          return { row: patient.row, sent };
        } catch (error) {
          this.logger.warn(`No se pudo enviar el acceso del paciente de la fila ${patient.row}: ${error instanceof Error ? error.message : 'error desconocido'}`);
          return { row: patient.row, sent: false };
        }
      }));
      for (const outcome of outcomes) {
        if (outcome.sent) setupLinksSent += 1;
        else setupLinkFailures.push({ row: outcome.row });
      }
    }
    return { totalRows: rows.length, created: prepared.length, skipped: rows.length - prepared.length, setupLinksSent, setupLinkFailures, errors };
  }
}

function normalizeHeader(value: string) {
  return value.trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s-]+/g, '_');
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  if (!source.trim()) throw new BadRequestException('El archivo CSV está vacío.');
  const firstLine = source.split(/\r?\n/, 1)[0];
  let commaCount = 0;
  let semicolonCount = 0;
  let quoted = false;
  for (let index = 0; index < firstLine.length; index += 1) {
    if (firstLine[index] === '"') {
      if (quoted && firstLine[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && firstLine[index] === ',') commaCount += 1;
    else if (!quoted && firstLine[index] === ';') semicolonCount += 1;
  }
  const delimiter = semicolonCount > commaCount ? ';' : ',';
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      record.push(field); field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      record.push(field); records.push(record); record = []; field = '';
    } else field += char;
  }
  if (quoted) throw new BadRequestException('El CSV tiene una comilla sin cerrar.');
  if (field || record.length) { record.push(field); records.push(record); }
  return records;
}

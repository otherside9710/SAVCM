import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
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
    return this.importPatientsRecords(parseCsv(csvText), 'CSV');
  }

  async importPatientsXlsx(fileBuffer: Buffer) {
    return this.importPatientsRecords(parseXlsx(fileBuffer), 'Excel');
  }

  private async importPatientsRecords(records: string[][], fileType: 'CSV' | 'Excel') {
    this.authService.assertPasswordSetupReady();
    if (records.length < 2) throw new BadRequestException(`El archivo ${fileType} debe incluir los encabezados y al menos un paciente.`);
    const headers = records[0].map(normalizeHeader);
    const requiredHeaders = ['cedula', 'nombres', 'apellidos', 'correo', 'telefono', 'fecha_nacimiento'];
    const missing = requiredHeaders.filter((header) => !headers.includes(header));
    if (missing.length) throw new BadRequestException(`Faltan columnas requeridas: ${missing.join(', ')}.`);

    const rows = records.slice(1).map((cells, index) => ({ cells, row: index + 2 })).filter(({ cells }) => cells.some((cell) => cell.trim()));
    if (!rows.length) throw new BadRequestException(`El archivo ${fileType} no contiene pacientes para importar.`);
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

interface XlsxZipEntry {
  name: string;
  flags: number;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  centralDirectoryOffset: number;
}

const MAX_XLSX_ENTRIES = 256;
const MAX_XLSX_ENTRY_BYTES = 4 * 1024 * 1024;
const MAX_XLSX_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_XLSX_ROWS = 501;
const MAX_XLSX_COLUMNS = 64;

function parseXlsx(buffer: Buffer): string[][] {
  const entries = readXlsxZipEntries(buffer);
  const workbookXml = readXlsxEntry(buffer, entries.get('xl/workbook.xml'));
  const relationshipsXml = readXlsxEntry(buffer, entries.get('xl/_rels/workbook.xml.rels'));
  const firstSheet = workbookXml.match(/<(?:[\w.-]+:)?sheet\b([^>]*)\/?\s*>/i)?.[1];
  const relationshipId = firstSheet && getXmlAttribute(firstSheet, 'r:id');
  if (!relationshipId) throw new BadRequestException('El archivo Excel no contiene una hoja de pacientes válida.');

  let target: string | undefined;
  const relationshipPattern = /<(?:[\w.-]+:)?Relationship\b([^>]*)\/?\s*>/gi;
  for (const match of relationshipsXml.matchAll(relationshipPattern)) {
    const attributes = match[1];
    if (getXmlAttribute(attributes, 'Id') === relationshipId) {
      target = getXmlAttribute(attributes, 'Target');
      break;
    }
  }
  if (!target) throw new BadRequestException('No se pudo abrir la primera hoja del archivo Excel.');
  const sheetPath = normalizeWorksheetTarget(target);
  const worksheetXml = readXlsxEntry(buffer, entries.get(sheetPath));
  const sharedStringsEntry = entries.get('xl/sharedStrings.xml');
  const sharedStrings = sharedStringsEntry ? parseSharedStrings(readXlsxEntry(buffer, sharedStringsEntry)) : [];
  const date1904 = /<(?:[\w.-]+:)?workbookPr\b[^>]*\bdate1904=["'](?:1|true)["']/i.test(workbookXml);
  const records: string[][] = [];
  const rowPattern = /<(?:[\w.-]+:)?row\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?row>/gi;

  for (const rowMatch of worksheetXml.matchAll(rowPattern)) {
    const rowNumber = Number(getXmlAttribute(rowMatch[1], 'r'));
    if (!Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > MAX_XLSX_ROWS) {
      throw new BadRequestException(`El archivo Excel debe tener como máximo ${MAX_XLSX_ROWS - 1} filas de datos.`);
    }
    while (records.length < rowNumber) records.push([]);
    const row = records[rowNumber - 1];
    const cellPattern = /<(?:[\w.-]+:)?c\b([^>]*)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?c>)/gi;
    for (const cellMatch of rowMatch[2].matchAll(cellPattern)) {
      const reference = getXmlAttribute(cellMatch[1], 'r');
      const column = reference ? xlsxColumnIndex(reference) : 0;
      if (column < 1 || column > MAX_XLSX_COLUMNS) {
        throw new BadRequestException(`El archivo Excel debe tener como máximo ${MAX_XLSX_COLUMNS} columnas.`);
      }
      const cellXml = cellMatch[2] ?? '';
      if (/<(?:[\w.-]+:)?f\b/i.test(cellXml)) throw new BadRequestException('No uses fórmulas en la plantilla. Ingresa los valores directamente.');
      const type = getXmlAttribute(cellMatch[1], 't');
      const valueMatch = cellXml.match(/<(?:[\w.-]+:)?v\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?v>/i);
      const rawValue = valueMatch ? decodeXml(valueMatch[1]) : '';
      let value = '';
      if (type === 's' && rawValue) {
        value = sharedStrings[Number(rawValue)] ?? '';
      } else if (type === 'inlineStr') {
        value = readXmlText(cellXml.match(/<(?:[\w.-]+:)?is\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?is>/i)?.[1] ?? '');
      } else if (rawValue) {
        value = column === 6 && type !== 'str'
          ? excelSerialDateToIso(rawValue, date1904)
          : rawValue;
      }
      row[column - 1] = value;
    }
  }

  return records;
}

function readXlsxZipEntries(buffer: Buffer): Map<string, XlsxZipEntry> {
  const endOfDirectorySignature = 0x06054b50;
  const searchStart = Math.max(0, buffer.length - 22 - 0xffff);
  let endOfDirectory = -1;
  for (let offset = buffer.length - 22; offset >= searchStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== endOfDirectorySignature) continue;
    if (offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length) {
      endOfDirectory = offset;
      break;
    }
  }
  if (endOfDirectory < 0) throw new BadRequestException('El archivo no es un libro Excel .xlsx válido.');

  const diskNumber = buffer.readUInt16LE(endOfDirectory + 4);
  const directoryDisk = buffer.readUInt16LE(endOfDirectory + 6);
  const entriesOnDisk = buffer.readUInt16LE(endOfDirectory + 8);
  const entryCount = buffer.readUInt16LE(endOfDirectory + 10);
  const directorySize = buffer.readUInt32LE(endOfDirectory + 12);
  const directoryOffset = buffer.readUInt32LE(endOfDirectory + 16);
  if (diskNumber !== 0 || directoryDisk !== 0 || entriesOnDisk !== entryCount || entryCount > MAX_XLSX_ENTRIES
    || entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff
    || directorySize > 1024 * 1024 || directoryOffset + directorySize > endOfDirectory) {
    throw new BadRequestException('El archivo Excel es demasiado grande o usa un formato de compresión no compatible.');
  }

  const entries = new Map<string, XlsxZipEntry>();
  let offset = directoryOffset;
  let totalUncompressedBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > directoryOffset + directorySize || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new BadRequestException('El archivo Excel está dañado.');
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const entryEnd = offset + 46 + nameLength + extraLength + commentLength;
    if (entryEnd > directoryOffset + directorySize || compressedSize === 0xffffffff
      || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff
      || (flags & 0x0001) !== 0 || ![0, 8].includes(method)
      || uncompressedSize > MAX_XLSX_ENTRY_BYTES) {
      throw new BadRequestException('El archivo Excel es demasiado grande o usa un formato de compresión no compatible.');
    }
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (name.includes('..') || name.startsWith('/') || entries.has(name)) {
      throw new BadRequestException('El archivo Excel contiene rutas o elementos no válidos.');
    }
    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > MAX_XLSX_TOTAL_BYTES) {
      throw new BadRequestException('El archivo Excel supera el tamaño permitido después de descomprimirlo.');
    }
    entries.set(name, { name, flags, method, compressedSize, uncompressedSize, localHeaderOffset, centralDirectoryOffset: directoryOffset });
    offset = entryEnd;
  }
  if (offset !== directoryOffset + directorySize) throw new BadRequestException('El archivo Excel está dañado.');
  return entries;
}

function readXlsxEntry(buffer: Buffer, entry?: XlsxZipEntry): string {
  if (!entry) throw new BadRequestException('El archivo Excel no contiene las hojas requeridas. Descarga una plantilla SAVCM nueva.');
  const offset = entry.localHeaderOffset;
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== 0x04034b50) {
    throw new BadRequestException('El archivo Excel está dañado.');
  }
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.length || dataEnd > entry.centralDirectoryOffset) {
    throw new BadRequestException('El archivo Excel está dañado.');
  }
  try {
    const compressed = buffer.subarray(dataStart, dataEnd);
    const output = entry.method === 0
      ? compressed
      : inflateRawSync(compressed, { maxOutputLength: MAX_XLSX_ENTRY_BYTES });
    if (output.length !== entry.uncompressedSize) throw new Error('Unexpected entry size');
    return output.toString('utf8');
  } catch {
    throw new BadRequestException('No se pudo leer una hoja del archivo Excel.');
  }
}

function parseSharedStrings(xml: string): string[] {
  const values: string[] = [];
  for (const match of xml.matchAll(/<(?:[\w.-]+:)?si\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?si>/gi)) values.push(readXmlText(match[1]));
  return values;
}

function readXmlText(xml: string): string {
  return Array.from(xml.matchAll(/<(?:[\w.-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?t>/gi), (match) => decodeXml(match[1])).join('');
}

function decodeXml(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, name: string) => {
    const lower = name.toLowerCase();
    if (lower === 'amp') return '&';
    if (lower === 'lt') return '<';
    if (lower === 'gt') return '>';
    if (lower === 'quot') return '"';
    if (lower === 'apos') return "'";
    const codePoint = lower.startsWith('#x') ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10);
    return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
  });
}

function getXmlAttribute(attributes: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return attributes.match(new RegExp(`(?:^|\\s)${escapedName}=["']([^"']*)["']`, 'i'))?.[1];
}

function normalizeWorksheetTarget(target: string): string {
  const base = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const parts: string[] = [];
  for (const part of base.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) throw new BadRequestException('La ruta de la hoja Excel no es válida.');
      parts.pop();
    } else parts.push(part);
  }
  const normalized = parts.join('/');
  if (!normalized.startsWith('xl/worksheets/') || normalized.includes('..')) {
    throw new BadRequestException('La primera hoja del Excel no es válida. Descarga una plantilla SAVCM nueva.');
  }
  return normalized;
}

function xlsxColumnIndex(reference: string): number {
  const letters = reference.match(/^([A-Z]+)\d+$/i)?.[1]?.toUpperCase();
  if (!letters) return 0;
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return index;
}

function excelSerialDateToIso(serialText: string, date1904: boolean): string {
  const serial = Number(serialText);
  if (!Number.isFinite(serial) || serial < 0 || serial > 2958465) return serialText;
  const wholeDays = Math.floor(serial);
  const adjustedDays = !date1904 && wholeDays >= 60 ? wholeDays - 1 : wholeDays;
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
  return new Date(epoch + adjustedDays * 86_400_000).toISOString().slice(0, 10);
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

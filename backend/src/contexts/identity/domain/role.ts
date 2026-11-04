export enum UserRole {
  PATIENT = 'PATIENT',
  DOCTOR = 'DOCTOR',
  ADMIN = 'ADMIN',
}

export interface AuthenticatedUser {
  sub: string;
  documentType: string;
  documentId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  doctorId?: string;
  pwdv?: number;
}

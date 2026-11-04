import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../../../identity/domain/role';
import { AppointmentStatus } from '../../../appointments/domain/appointment-status';

@Entity('users')
@Index('uq_users_document_id', ['documentId'], { unique: true })
@Index('uq_users_email', ['email'], { unique: true })
export class UserOrmEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 10, default: 'CC' }) documentType!: string;
  @Column({ type: 'varchar', length: 20 }) documentId!: string;
  @Column({ type: 'varchar', length: 254 }) email!: string;
  @Column({ type: 'varchar', length: 100 }) passwordHash!: string;
  @Column({ type: 'varchar', length: 100 }) firstName!: string;
  @Column({ type: 'varchar', length: 100 }) lastName!: string;
  @Column({ type: 'varchar', length: 30, nullable: true }) phone!: string | null;
  @Column({ type: 'date', nullable: true }) birthDate!: string | null;
  @Column({ type: 'varchar', length: 20, default: UserRole.PATIENT }) role!: UserRole;
  @Column({ type: 'boolean', default: true }) active!: boolean;
  @Column({ type: 'timestamptz', nullable: true }) passwordChangedAt!: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}

@Entity('password_reset_tokens')
@Index('uq_password_reset_tokens_user_id', ['userId'], { unique: true })
@Index('uq_password_reset_tokens_token_hash', ['tokenHash'], { unique: true })
@Index('ix_password_reset_tokens_expires_at', ['expiresAt'])
export class PasswordResetTokenOrmEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) userId!: string;
  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId', foreignKeyConstraintName: 'FK_password_reset_tokens_user' }) user?: UserOrmEntity;
  @Column({ type: 'varchar', length: 64 }) tokenHash!: string;
  @Column({ type: 'timestamptz' }) expiresAt!: Date;
  @Column({ type: 'timestamptz', nullable: true }) usedAt!: Date | null;
  @Column({ type: 'timestamptz', default: () => 'now()' }) createdAt!: Date;
}

@Entity('eps_patient_roster')
export class EpsPatientOrmEntity {
  @Column({ type: 'varchar', length: 10, default: 'CC' }) documentType!: string;
  @Column({ type: 'varchar', length: 20, primary: true }) documentId!: string;
  @Column({ type: 'boolean', default: true }) active!: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) importedAt!: Date;
}

@Entity('doctors')
@Index('uq_doctors_user_id', ['userId'], { unique: true })
export class DoctorOrmEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) userId!: string;
  @OneToOne(() => UserOrmEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' }) user?: UserOrmEntity;
  @Column({ type: 'varchar', length: 80, default: 'Medicina General' }) specialty!: string;
  @Column({ type: 'varchar', length: 30, nullable: true }) defaultRoom!: string | null;
  @Column({ type: 'boolean', default: true }) active!: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}

@Entity('schedule_slots')
@Index('uq_schedule_doctor_date_time', ['doctorId', 'workDate', 'startTime'], { unique: true })
@Index('ix_schedule_date_doctor', ['workDate', 'doctorId'])
export class ScheduleSlotOrmEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) doctorId!: string;
  @ManyToOne(() => DoctorOrmEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'doctorId' }) doctor?: DoctorOrmEntity;
  @Column({ type: 'date' }) workDate!: string;
  @Column({ type: 'time', precision: 0 }) startTime!: string;
  @Column({ type: 'time', precision: 0 }) endTime!: string;
  @Column({ type: 'varchar', length: 30, nullable: true }) room!: string | null;
  @Column({ type: 'boolean', default: true }) active!: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}

@Entity('appointments')
@Index('uq_active_appointment_slot', ['slotId'], {
  unique: true,
  where: `"status" = 'SCHEDULED'`,
})
@Index('uq_active_patient_datetime', ['patientId', 'workDate', 'startTime'], {
  unique: true,
  where: `"status" = 'SCHEDULED'`,
})
@Index('ix_appointments_date_status', ['workDate', 'status'])
export class AppointmentOrmEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) patientId!: string;
  @ManyToOne(() => UserOrmEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'patientId' }) patient?: UserOrmEntity;
  @Column({ type: 'uuid' }) doctorId!: string;
  @ManyToOne(() => DoctorOrmEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'doctorId' }) doctor?: DoctorOrmEntity;
  @Column({ type: 'uuid' }) slotId!: string;
  @ManyToOne(() => ScheduleSlotOrmEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'slotId' }) slot?: ScheduleSlotOrmEntity;
  @Column({ type: 'date' }) workDate!: string;
  @Column({ type: 'time', precision: 0 }) startTime!: string;
  @Column({ type: 'time', precision: 0 }) endTime!: string;
  @Column({ type: 'varchar', length: 20, default: AppointmentStatus.SCHEDULED }) status!: AppointmentStatus;
  @Column({ type: 'varchar', length: 500, nullable: true }) reason!: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) cancellationReason!: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date;
}

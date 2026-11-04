import { IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';

export class CreateAppointmentDto {
  @IsUUID() slotId!: string;
  @IsOptional() @IsString() @Matches(/^\d{6,20}$/) patientDocument?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class CancelAppointmentDto {
  @IsString() @Length(3, 500) reason!: string;
}

export class RescheduleAppointmentDto {
  @IsUUID() slotId!: string;
}

export class ChangeAppointmentStatusDto {
  @IsString() @Matches(/^(COMPLETED|NO_SHOW)$/) status!: 'COMPLETED' | 'NO_SHOW';
}

import { IsBoolean, IsString, Matches } from 'class-validator';

export class AddRosterPatientDto {
  @IsString() @Matches(/^\d{6,20}$/) documentId!: string;
}

export class SetActiveDto {
  @IsBoolean() active!: boolean;
}

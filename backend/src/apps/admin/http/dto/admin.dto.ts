import { IsBoolean, IsEmail, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateReceptionistDto {
  @IsString() @Matches(/^\d{6,20}$/) documentId!: string;
  @IsString() @Length(2, 100) firstName!: string;
  @IsString() @Length(2, 100) lastName!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(8) @MaxLength(72) password!: string;
}

export class AddRosterPatientDto {
  @IsString() @Matches(/^\d{6,20}$/) documentId!: string;
}

export class SetActiveDto {
  @IsBoolean() active!: boolean;
}

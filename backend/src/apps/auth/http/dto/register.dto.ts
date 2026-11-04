import { IsDateString, IsEmail, IsIn, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsIn(['CC']) documentType!: 'CC';
  @IsString() @Matches(/^\d{6,20}$/) documentId!: string;
  @IsString() @Length(2, 100) firstName!: string;
  @IsString() @Length(2, 100) lastName!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Matches(/^\+?[0-9 ()-]{7,20}$/) phone!: string;
  @IsDateString() birthDate!: string;
  @IsString() @MinLength(8) @MaxLength(72) password!: string;
}

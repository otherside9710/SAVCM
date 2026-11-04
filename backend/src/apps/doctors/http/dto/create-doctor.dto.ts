import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateDoctorDto {
  @IsString() @Matches(/^\d{6,20}$/) documentId!: string;
  @IsString() @Length(2, 100) firstName!: string;
  @IsString() @Length(2, 100) lastName!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(8) @MaxLength(72) password!: string;
  @IsOptional() @IsString() @Matches(/^\+?[0-9 ()-]{7,20}$/) phone?: string;
  @IsOptional() @IsString() @Length(3, 80) specialty?: string;
  @IsOptional() @IsString() @MaxLength(30) room?: string;
}

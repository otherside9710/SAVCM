import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(40)
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9_-]+$/)
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}

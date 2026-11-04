import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min, MaxLength } from 'class-validator';

export class CreateScheduleDto {
  @IsUUID() doctorId!: string;
  @IsDateString() date!: string;
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!: string;
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime!: string;
  @IsInt() @Min(10) @Max(120) slotMinutes!: number;
  @IsOptional() @IsString() @MaxLength(30) room?: string;
}

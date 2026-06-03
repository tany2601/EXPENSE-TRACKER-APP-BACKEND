import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator";

export class UpdatePreferenceDto {
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  insightsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  alertsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  engagementEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  quietHoursStart?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  quietHoursEnd?: number | null;
}

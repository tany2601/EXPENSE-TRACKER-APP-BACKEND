import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(["ENGAGEMENT", "INSIGHT", "ALERT", "REMINDER"])
  type?: string;

  @IsOptional()
  @IsIn(["DAILY_ALERTS", "WEEKLY_INSIGHTS", "MONTHLY_MILESTONES", "ENGAGEMENT_BATCH"])
  triggerCategory?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  condition?: string | null;

  @IsOptional()
  @IsString()
  deepLinkScreen?: string | null;

  @IsOptional()
  @IsString()
  deepLinkData?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  dedupWindowDays?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(["HIGH", "NORMAL"])
  priority?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

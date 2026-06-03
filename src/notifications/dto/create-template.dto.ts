import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";

export class CreateTemplateDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsIn(["ENGAGEMENT", "INSIGHT", "ALERT", "REMINDER"])
  type: string;

  @IsIn(["DAILY_ALERTS", "WEEKLY_INSIGHTS", "MONTHLY_MILESTONES", "ENGAGEMENT_BATCH"])
  triggerCategory: string;

  @IsString()
  @MinLength(1)
  title: string;

  @IsString()
  @MinLength(1)
  body: string;

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

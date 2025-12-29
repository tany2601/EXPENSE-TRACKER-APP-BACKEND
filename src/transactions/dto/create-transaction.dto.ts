import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsISO8601,
  IsBoolean,
  IsArray,
} from "class-validator";
import { TransactionType } from "@prisma/client";

export class CreateTransactionSplitDto {
  @IsString()
  participantId: string;

  @IsNumber()
  amount: number;
}

export class CreateTransactionDto {
  @IsString()
  title: string;

  @IsNumber()
  amount: number;

  @IsEnum(TransactionType)
  type: TransactionType;

  @IsString()
  category: string;

  @IsISO8601()
  date: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsString()
  projectTitle?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  // 🔥 Cloudinary
  @IsOptional()
  @IsString()
  receiptImage?: string;

  @IsOptional()
  @IsString()
  receiptPublicId?: string;

  @IsOptional()
  @IsArray()
  splits?: CreateTransactionSplitDto[];
}

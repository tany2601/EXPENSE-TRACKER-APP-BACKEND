// src/sync/dto/sync.dto.ts
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
  Min,
  Max,
  IsInt,
} from "class-validator";
import { Type } from "class-transformer";

export enum SyncEntity {
  TRANSACTION = "transaction",
}

export enum SyncOpType {
  UPSERT = "UPSERT",
  DELETE = "DELETE",
}

export class SplitDto {
  @IsUUID()
  participantId: string;

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;
}

/**
 * Full Transaction payload for UPSERT
 */
export class TransactionUpsertPayloadDto {
  @IsUUID()
  id: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsNumber()
  amount: number;

  @IsEnum(["INCOME", "EXPENSE"] as any)
  type: "INCOME" | "EXPENSE";

  @IsString()
  @IsNotEmpty()
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
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  receiptImage?: string;

  @IsOptional()
  @IsString()
  receiptPublicId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitDto)
  splits?: SplitDto[];

  // Client conflict timestamp (preferred)
  @IsOptional()
  @IsISO8601()
  clientUpdatedAt?: string;

  // Backward compat: if clientUpdatedAt not sent, accept updatedAt
  @IsOptional()
  @IsISO8601()
  updatedAt?: string;

  @IsOptional()
  @IsISO8601()
  createdAt?: string;
}

/**
 * Minimal payload for DELETE
 */
export class TransactionDeletePayloadDto {
  @IsUUID()
  id: string;

  // For conflict ordering; accept either clientUpdatedAt or updatedAt
  @IsOptional()
  @IsISO8601()
  clientUpdatedAt?: string;

  @IsOptional()
  @IsISO8601()
  updatedAt?: string;
}

/**
 * Operation DTO:
 * We keep payload as "any" validated by op type at runtime in service/controller.
 * (class-validator can't do perfect discriminated unions cleanly)
 */
export class SyncOpDto {
  @IsEnum(SyncOpType)
  op: SyncOpType;

  @IsEnum(SyncEntity)
  entity: SyncEntity;

  @IsUUID()
  entityId: string;

  // payload validation is handled manually based on op in the service/controller
  payload: any;
}

export class SyncPushDto {
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @IsArray()
  ops: SyncOpDto[];
}

export class SyncPullQueryDto {
  @IsOptional()
  @IsISO8601()
  since?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  limit?: number;
}

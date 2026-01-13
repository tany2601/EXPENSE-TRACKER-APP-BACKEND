// src/sync/dto/sync.dto.ts
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export enum SyncEntity {
  TRANSACTION = "transaction",
  CONTACT = "contact",
  CATEGORY = "category",
}

export enum SyncOpType {
  UPSERT = "UPSERT",
  DELETE = "DELETE",
}

/** ---------- Shared / Transaction DTOs ---------- */

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

  // Backward compat
  @IsOptional()
  @IsISO8601()
  updatedAt?: string;

  @IsOptional()
  @IsISO8601()
  createdAt?: string;
}

/**
 * Minimal payload for Transaction DELETE
 */
export class TransactionDeletePayloadDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsISO8601()
  clientUpdatedAt?: string;

  @IsOptional()
  @IsISO8601()
  updatedAt?: string;
}

/** ---------- Contact DTOs ---------- */

export class ContactUpsertPayloadDto {
  @IsUUID()
  id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsISO8601()
  clientUpdatedAt?: string;

  @IsOptional()
  @IsISO8601()
  updatedAt?: string;

  @IsOptional()
  @IsISO8601()
  createdAt?: string;
}

export class ContactDeletePayloadDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsISO8601()
  clientUpdatedAt?: string;

  @IsOptional()
  @IsISO8601()
  updatedAt?: string;
}

/** ---------- Category DTOs ---------- */

export class CategoryUpsertPayloadDto {
  @IsUUID()
  id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  iconName: string;

  @IsString()
  @IsNotEmpty()
  color: string;

  // client may send this, but server decides final behavior
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsISO8601()
  clientUpdatedAt?: string;

  @IsOptional()
  @IsISO8601()
  updatedAt?: string;

  @IsOptional()
  @IsISO8601()
  createdAt?: string;
}

export class CategoryDeletePayloadDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsISO8601()
  clientUpdatedAt?: string;

  @IsOptional()
  @IsISO8601()
  updatedAt?: string;
}

/** ---------- Generic Sync DTOs ---------- */

export class SyncOpDto {
  @IsEnum(SyncOpType)
  op: SyncOpType;

  @IsEnum(SyncEntity)
  entity: SyncEntity;

  @IsUUID()
  entityId: string;

  // validated in service based on entity+op
  payload: any;

  @IsString()
  @IsNotEmpty()
  opId: string;
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

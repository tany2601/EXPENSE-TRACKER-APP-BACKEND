import { PartialType } from "@nestjs/mapped-types";
import { CreateTransactionDto } from "./create-transaction.dto";
import { IsOptional, IsDateString } from "class-validator";

export class UpdateTransactionDto extends PartialType(CreateTransactionDto) {
  @IsOptional()
  @IsDateString()
  reminderDismissedAt?: string | null;
}

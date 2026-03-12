import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Request,
  Patch,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { TransactionsService } from "./transactions.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateTransactionDto } from "./dto/create-transaction.dto";
import { UpdateTransactionDto } from "./dto/update-transaction.dto";
import { PaySplitDto } from "./dto/pay-split.dto";
import { FileInterceptor } from "@nestjs/platform-express";
import { receiptStorage } from "../cloudinary/receipt.storage";

@Controller("transactions")
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  // -------------------------
  // Transactions
  // -------------------------
  @Post()
  create(@Body() dto: CreateTransactionDto, @Request() req: any) {
    return this.transactionsService.create(dto, req.user.id);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.transactionsService.findAll(req.user.id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateTransactionDto,
    @Request() req: any
  ) {
    return this.transactionsService.update(id, req.user.id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Request() req: any) {
    return this.transactionsService.delete(id, req.user.id);
  }

  // -------------------------
  // Split settlement
  // -------------------------
  @Patch(":id/pay-split")
  paySplit(
    @Param("id") id: string,
    @Body() dto: PaySplitDto,
    @Request() req: any
  ) {
    return this.transactionsService.paySplit(
      id,
      dto.participantId,
      req.user.id
    );
  }

  // -------------------------
  // Receipt upload
  // -------------------------
  @Post("upload-receipt")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: receiptStorage,
      limits: { fileSize: 5 * 1024 * 1024 },
    })
  )
  uploadReceipt(@UploadedFile() file: any) {
    return {
      url: file.path,
      publicId: file.filename,
    };
  }

  // -------------------------
  // Receipt delete
  // -------------------------
  @Delete(":id/receipt")
  deleteReceipt(@Param("id") id: string, @Request() req: any) {
    return this.transactionsService.deleteReceipt(id, req.user.id);
  }
}

import {
  Controller,
  Get,
  Patch,
  Delete,
  UseGuards,
  Request,
  Body,
  Post,
  UploadedFile,
  UseInterceptors,
  Req,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { UsersService } from "./users.service";
import { FileInterceptor } from "@nestjs/platform-express";
import { avatarStorage } from "../cloudinary/avatar.storage";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) { }

  @Get("me")
  async me(@Request() req: any) {
    return this.usersService.getPublicProfile(req.user.id);
  }

  @Patch("me")
  updateMe(@Request() req: any, @Body() body: any) {
    return this.usersService.updateMe(req.user.id, body);
  }

  @Get("export")
  exportData(@Request() req: any) {
    return this.usersService.exportUserData(req.user.id);
  }

  @Post("upload-avatar")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: avatarStorage,
      limits: { fileSize: 5 * 1024 * 1024 },
    })
  )
  uploadAvatar(@UploadedFile() file: Express.Multer.File) {
    return { url: file.path };
  }

  @Delete("avatar")
  removeAvatar(@Request() req: any) {
    return this.usersService.removeAvatar(req.user.id);
  }

  @Delete("me")
  deleteAccount(@Request() req: any) {
    return this.usersService.deleteAccount(req.user.id);
  }


  @Post("verify-password")
  async verifyPassword(
    @Request() req: any,
    @Body("password") password: string
  ) {
    await this.usersService.verifyPassword(req.user.id, password);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post("reset-transactions")
  resetTransactions(
    @Req() req,
    @Body() body: { deviceId: string }
  ) {
    return this.usersService.resetTransactions(
      req.user.id,
      body.deviceId
    );
  }

}

import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { VerifyResetOtpDto } from "./dto/verify-reset-otp.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("register")
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post("login")
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post("forgot-password")
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.sendPasswordResetOtp(dto.email);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@Request() req: any) {
    return { userId: req.user.id, email: req.user.email };
  }

  @Post("verify-reset-otp")
  async verifyResetOtp(@Body() dto: VerifyResetOtpDto) {
    return this.authService.verifyPasswordResetOtp(dto.email, dto.otp);
  }

  @Post("reset-password")
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.resetToken, dto.newPassword);
  }
}

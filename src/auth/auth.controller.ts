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
async login(@Body() dto: LoginDto, @Request() req: any) {
  const deviceId = req.headers["x-device-id"];
  const ua = req.headers["user-agent"];
  const ip = req.ip;

  return this.authService.login(dto.email, dto.password, { deviceId, userAgent: ua, ip });
}


  @Post("forgot-password")
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.sendOtp(dto.email, "PASSWORD_RESET");
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@Request() req: any) {
    return { userId: req.user.id, email: req.user.email };
  }

  @Post("reset-password")
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.resetToken, dto.newPassword);
  }

  @Post("send-otp")
  async sendOtp(@Body() body: { email: string; type: string }) {
    await this.authService.sendOtp(body.email, body.type as any);
    return { ok: true };
  }

  @Post("verify-otp")
  async verifyOtp(@Body() body: { email: string; otp: string; type: string }) {
    return this.authService.verifyOtp(body.email, body.otp, body.type as any);
  }

  @Post("issue-reset-token")
  async issueResetToken(@Body() body: { email: string }) {
    return this.authService.issueResetToken(body.email);
  }

  @Post("refresh")
async refresh(@Body() body: { refreshToken: string }, @Request() req: any) {
  const deviceId = req.headers["x-device-id"];
  const ua = req.headers["user-agent"];
  const ip = req.ip;

  return this.authService.refresh(body.refreshToken, { deviceId, userAgent: ua, ip });
}

@Post("logout")
async logout(@Body() body: { refreshToken: string }) {
  return this.authService.logout(body.refreshToken);
}

}

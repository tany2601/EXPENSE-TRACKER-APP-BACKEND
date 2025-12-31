import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { UsersService } from "../users/users.service";
import { MailService } from "../mail/mail.service";

@Injectable()
export class AuthService {
  constructor(
    private users: UsersService,
    private jwt: JwtService,
    private mail: MailService
  ) {}

  async register(data: {
    email: string;
    name: string;
    password: string;
    phone?: string;
  }) {
    const hash = await bcrypt.hash(data.password, 10);

    const user = await this.users.create({
      email: data.email.toLowerCase(),
      name: data.name,
      phone: data.phone ?? null,
      passwordHash: hash,
    });

    return this.issueToken(user.id, user.email);
  }

  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email.toLowerCase());
    if (!user) throw new UnauthorizedException("Invalid credentials");

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid credentials");

    return this.issueToken(user.id, user.email);
  }

  private async issueToken(userId: string, email: string) {
    const token = await this.jwt.signAsync({ sub: userId, email });
    const user = await this.users.getPublicProfile(userId);
    return { access_token: token, user };
  }

  private generateOtp(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }
  async sendPasswordResetOtp(email: string) {
    console.log("FORGOT PASSWORD HIT:", email);

    // ✅ DECLARE FIRST
    const normalizedEmail = email.toLowerCase();

    const user = await this.users.findByEmail(normalizedEmail);
    console.log("USER FOUND:", !!user);

    if (!user) return;

    const otp = this.generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await this.users.upsertPasswordResetOtp(
      normalizedEmail,
      otpHash,
      expiresAt
    );

    // ✅ SAFE TO USE NOW
    await this.mail.sendResetOtp(normalizedEmail, otp);
  }

  async verifyPasswordResetOtp(email: string, otp: string) {
    const normalizedEmail = email.toLowerCase();

    const record = await this.users.findPasswordResetOtp(normalizedEmail);
    if (!record) {
      throw new UnauthorizedException("Invalid or expired code");
    }

    // 1️⃣ Expiry check
    if (record.expiresAt.getTime() < Date.now()) {
      await this.users.deletePasswordResetOtp(normalizedEmail);
      throw new UnauthorizedException("Invalid or expired code");
    }

    // 2️⃣ OTP match
    const isValid = await bcrypt.compare(otp, record.otpHash);
    if (!isValid) {
      throw new UnauthorizedException("Invalid or expired code");
    }

    // 3️⃣ Issue short-lived reset token
    const resetToken = await this.jwt.signAsync(
      {
        email: normalizedEmail,
        type: "PASSWORD_RESET",
      },
      { expiresIn: "5m" }
    );

    // 4️⃣ Cleanup OTP (single-use)
    await this.users.deletePasswordResetOtp(normalizedEmail);

    return { resetToken };
  }

  async resetPassword(resetToken: string, newPassword: string) {
    let payload: any;

    // 1️⃣ Verify token
    try {
      payload = await this.jwt.verifyAsync(resetToken);
    } catch {
      throw new UnauthorizedException("Invalid or expired reset token");
    }

    // 2️⃣ Validate scope
    if (payload.type !== "PASSWORD_RESET" || !payload.email) {
      throw new UnauthorizedException("Invalid reset token");
    }

    // 3️⃣ Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // 4️⃣ Update password
    await this.users.updatePasswordByEmail(
      payload.email.toLowerCase(),
      passwordHash
    );

    return { ok: true };
  }
}

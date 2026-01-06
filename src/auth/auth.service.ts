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

  async sendOtp(email: string, type: "PASSWORD_RESET" | "EMAIL_VERIFY") {
    const normalizedEmail = email.toLowerCase();

    // 🔐 Reset requires existing user
    if (type === "PASSWORD_RESET") {
      const user = await this.users.findByEmail(normalizedEmail);
      if (!user) return;
    }

    const otp = this.generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await this.users.upsertEmailOtp(normalizedEmail, type, otpHash, expiresAt);

    await this.mail.sendOtp(normalizedEmail, otp, type);
  }

  async verifyOtp(
    email: string,
    otp: string,
    type: "PASSWORD_RESET" | "EMAIL_VERIFY"
  ) {
    const record = await this.users.findEmailOtp(email, type);
    if (!record) throw new UnauthorizedException("Invalid or expired code");

    if (record.expiresAt < new Date()) {
      await this.users.deleteEmailOtp(email, type);
      throw new UnauthorizedException("Invalid or expired code");
    }

    const ok = await bcrypt.compare(otp, record.otpHash);
    if (!ok) throw new UnauthorizedException("Invalid or expired code");

    await this.users.deleteEmailOtp(email, type);

    // 🔑 IMPORTANT PART
    if (type === "PASSWORD_RESET") {
      const resetToken = await this.jwt.signAsync(
        { email, type: "PASSWORD_RESET" },
        { expiresIn: "5m" }
      );

      return { resetToken };
    }

    return { ok: true };
  }

  async issueResetToken(email: string) {
    const token = await this.jwt.signAsync(
      { email, type: "PASSWORD_RESET" },
      { expiresIn: "5m" }
    );
    return { resetToken: token };
  }

  async resetPassword(resetToken: string, newPassword: string) {
    let payload: any;

    try {
      payload = await this.jwt.verifyAsync(resetToken);
    } catch {
      throw new UnauthorizedException("Invalid or expired reset token");
    }

    if (payload.type !== "PASSWORD_RESET" || !payload.email) {
      throw new UnauthorizedException("Invalid reset token");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.users.updatePasswordByEmail(
      payload.email.toLowerCase(),
      passwordHash
    );

    return { ok: true };
  }
}

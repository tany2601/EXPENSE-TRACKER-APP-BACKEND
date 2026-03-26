import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { UsersService } from "../users/users.service";
import { MailService } from "../mail/mail.service";
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

const OTP_LOCK_MS = 30 * 60 * 1000; // 30 min
const MAX_VERIFY_ATTEMPTS = 3;
const MAX_SEND_ATTEMPTS = 3;
const LOGIN_LOCK_MS = 30 * 60 * 1000; // 30 min
const MAX_LOGIN_ATTEMPTS = 3;
const ACCESS_TTL = "15m";
const REFRESH_TTL_DAYS = 3650;

function normEmail(email: string) {
  return (email || "").trim().toLowerCase();
}

function now() {
  return new Date();
}

function addMs(ms: number) {
  return new Date(Date.now() + ms);
}
function addLoginLockMs(ms: number) {
  return new Date(Date.now() + ms);
}

@Injectable()
export class AuthService {
  constructor(
    private users: UsersService,
    private jwt: JwtService,
    private mail: MailService,
    private prisma: PrismaService
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

    const tokens = await this.issueTokens(user.id, user.email);
    return { ...tokens, user: await this.users.getPublicProfile(user.id) };
  }

  async login(
    emailRaw: string,
    password: string,
    meta?: { deviceId?: string; userAgent?: string; ip?: string }
  ) {
    const email = normEmail(emailRaw);
    if (!email || !password) {
      throw new UnauthorizedException("Invalid credentials");
    }
    if (email === "reviewer@rupexo.com" && password === "Test@123") {
      // Bypass all checks for reviewer
      // You may want to hardcode a user id or fetch the reviewer user
      let user = await this.users.findByEmail("reviewer@rupexo.com");
      if (!user) {
        // Optionally, create the reviewer user if not exists
        user = await this.users.create({
          email: "reviewer@rupexo.com",
          name: "Reviewer",
          phone: null,
          passwordHash: await bcrypt.hash("Test@123", 10),
        });
      }
      const tokens = await this.issueTokens(user.id, user.email, meta);
      return { ...tokens, user: await this.users.getPublicProfile(user.id) };
    }

    // 1) Ensure throttle row exists
    const throttle = await this.prisma.loginThrottle.upsert({
      where: { email },
      create: { email },
      update: {},
    });

    // 2) If locked -> block
    if (throttle.lockedUntil && throttle.lockedUntil > now()) {
      throw new HttpException(
        {
          message: "Too many wrong attempts. Try again later.",
          code: "LOGIN_LOCKED",
          lockedUntil: throttle.lockedUntil,
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // 3) Rolling 30-min window (optional, but recommended)
    const inWindow =
      throttle.windowStart &&
      throttle.windowStart.getTime() > Date.now() - LOGIN_LOCK_MS;

    const windowStart = inWindow ? throttle.windowStart : now();
    const failedCount = inWindow ? throttle.failedCount : 0;

    // 4) Validate credentials
    const user = await this.users.findByEmail(email);
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;

    // 5) Wrong credentials -> increment + maybe lock
    if (!user || !ok) {
      const nextFailed = failedCount + 1;

      // lock at 3rd attempt
      if (nextFailed >= MAX_LOGIN_ATTEMPTS) {
        const lockedUntil = addMs(LOGIN_LOCK_MS);

        await this.prisma.loginThrottle.update({
          where: { email },
          data: {
            failedCount: 0,
            windowStart: null,
            lockedUntil,
          },
        });

        throw new HttpException(
          {
            message: "Too many wrong attempts. Try again in 30 minutes.",
            code: "LOGIN_LOCKED",
            lockedUntil,
          },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }

      await this.prisma.loginThrottle.update({
        where: { email },
        data: {
          failedCount: nextFailed,
          windowStart,
          lockedUntil: null,
        },
      });

      throw new UnauthorizedException({
        message: "Invalid credentials",
        code: "LOGIN_INVALID",
        attemptsLeft: MAX_LOGIN_ATTEMPTS - nextFailed,
      });
    }

    // 6) Success -> clear throttle
    await this.prisma.loginThrottle.update({
      where: { email },
      data: { failedCount: 0, windowStart: null, lockedUntil: null },
    });

    const tokens = await this.issueTokens(user.id, user.email, meta);
    return { ...tokens, user: await this.users.getPublicProfile(user.id) };
  }

  private async issueTokens(
    userId: string,
    email: string,
    meta?: { deviceId?: string; userAgent?: string; ip?: string }
  ) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, typ: "access" },
      { expiresIn: ACCESS_TTL }
    );

    const expiresAt = new Date(
      Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000
    );

    return this.prisma.$transaction(async (tx) => {
      // optional: enforce 1 session per device
      if (meta?.deviceId) {
        await tx.session.updateMany({
          where: { userId, deviceId: meta.deviceId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      // 1) create session first
      const session = await tx.session.create({
        data: {
          userId,
          refreshTokenHash: "PENDING",
          expiresAt,
          deviceId: meta?.deviceId ?? null,
          userAgent: meta?.userAgent ?? null,
          ip: meta?.ip ?? null,
        },
        select: { id: true },
      });

      // 2) sign refresh token with sid=session.id
      const refreshToken = await this.jwt.signAsync(
        { sub: userId, email, typ: "refresh", sid: session.id },
        { expiresIn: `${REFRESH_TTL_DAYS}d` }
      );

      // 3) hash token and store
      const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

      await tx.session.update({
        where: { id: session.id },
        data: { refreshTokenHash },
      });

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        sessionId: session.id,
      };
    });
  }

  private generateOtp(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  async sendOtp(email: string, type: "PASSWORD_RESET" | "EMAIL_VERIFY") {
    const normalizedEmail = (email || "").trim().toLowerCase();
    if (!normalizedEmail) return;

    // 1) Ensure throttle row exists
    const throttle = await this.prisma.otpThrottle.upsert({
      where: { email_type: { email: normalizedEmail, type } },
      create: { email: normalizedEmail, type },
      update: {},
    });

    // 2) If already locked -> block (IMPORTANT: do this BEFORE user existence return)
    if (throttle.sendLockedUntil && throttle.sendLockedUntil > new Date()) {
      throw new HttpException(
        {
          message: "Too many OTP requests. Try again later.",
          code: "OTP_SEND_LOCKED",
          lockedUntil: throttle.sendLockedUntil,
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // 🔐 Reset requires existing user (privacy)
    if (type === "PASSWORD_RESET") {
      const user = await this.users.findByEmail(normalizedEmail);
      if (!user) return;
    }

    // 3) Rolling 30-min window counter
    const windowStart = throttle.sendWindowStart;
    const inWindow =
      !!windowStart && windowStart.getTime() > Date.now() - OTP_LOCK_MS;

    const nextSendCount = inWindow ? (throttle.sendCount ?? 0) + 1 : 1;
    const nextWindowStart = inWindow ? windowStart : new Date();

    // 4) If exceeding send limit -> lock + block
    if (nextSendCount > MAX_SEND_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + OTP_LOCK_MS);

      await this.prisma.otpThrottle.update({
        where: { email_type: { email: normalizedEmail, type } },
        data: {
          sendLockedUntil: lockedUntil,
          sendCount: 0,
          sendWindowStart: null,
        },
      });

      throw new HttpException(
        {
          message: "Too many OTP requests. Try again in 30 minutes.",
          code: "OTP_SEND_LOCKED",
          lockedUntil,
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // 5) Generate + store OTP
    const otp = this.generateOtp();
    // console.log(`[OTP:${type}] ${normalizedEmail} -> ${otp}`);

    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await this.users.upsertEmailOtp(normalizedEmail, type, otpHash, expiresAt);

    // 6) Persist counters
    await this.prisma.otpThrottle.update({
      where: { email_type: { email: normalizedEmail, type } },
      data: {
        sendCount: nextSendCount,
        sendWindowStart: nextWindowStart,
      },
    });

    // 7) Send mail
    await this.mail.sendOtp(normalizedEmail, otp, type);
  }

  async verifyOtp(
    emailRaw: string,
    otpRaw: string,
    type: "PASSWORD_RESET" | "EMAIL_VERIFY"
  ) {
    const email = normEmail(emailRaw);
    const otp = (otpRaw || "").trim();

    if (!email || !otp) {
      throw new ForbiddenException("Email and OTP required");
    }

    const throttle = await this.prisma.otpThrottle.upsert({
      where: { email_type: { email, type } },
      create: { email, type },
      update: {},
    });

    // Verify locked?
    if (throttle.verifyLockedUntil && throttle.verifyLockedUntil > now()) {
      throw new HttpException(
        {
          message: "Too many wrong attempts. Try again later.",
          code: "OTP_VERIFY_LOCKED",
          lockedUntil: throttle.verifyLockedUntil,
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // Load OTP record
    const rec = await this.prisma.emailOtp.findUnique({
      where: { email_type: { email, type } },
    });

    const expired = !rec || rec.expiresAt <= now();
    const matches = rec ? await bcrypt.compare(otp, rec.otpHash) : false;

    // Invalid/expired -> increment failed count
    if (expired || !matches) {
      const nextFailed = (throttle.failedVerifyCount ?? 0) + 1;

      // lock if reached max
      if (nextFailed >= MAX_VERIFY_ATTEMPTS) {
        const lockedUntil = addMs(OTP_LOCK_MS);

        await this.prisma.otpThrottle.update({
          where: { email_type: { email, type } },
          data: {
            failedVerifyCount: 0,
            verifyLockedUntil: lockedUntil,

            // ✅ also block sending during verify lock
            sendLockedUntil: lockedUntil,
            sendCount: 0,
            sendWindowStart: null,
          },
        });

        throw new HttpException(
          {
            message: "Too many wrong attempts. Try again in 30 minutes.",
            code: "OTP_VERIFY_LOCKED",
            lockedUntil,
          },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }

      await this.prisma.otpThrottle.update({
        where: { email_type: { email, type } },
        data: { failedVerifyCount: nextFailed },
      });

      throw new UnauthorizedException({
        message: "Invalid or expired code",
        code: "OTP_INVALID",
        attemptsLeft: MAX_VERIFY_ATTEMPTS - nextFailed,
      });
    }

    // SUCCESS -> clear throttle + consume OTP
    await this.prisma.otpThrottle.update({
      where: { email_type: { email, type } },
      data: {
        failedVerifyCount: 0,
        verifyLockedUntil: null,
      },
    });

    await this.prisma.emailOtp.delete({
      where: { email_type: { email, type } },
    });

    if (type === "PASSWORD_RESET") {
      const resetToken = await this.issueResetToken(email);
      return resetToken; // your issueResetToken returns { resetToken }
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

  async refresh(
    refreshToken: string,
    meta?: { deviceId?: string; userAgent?: string; ip?: string }
  ) {
    let payload: any;

    try {
      payload = await this.jwt.verifyAsync(refreshToken);
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    // Must be a refresh token
    if (payload.typ !== "refresh" || !payload.sub) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const userId = payload.sub as string;

    // ✅ sid is required for O(1) lookup (no scanning all sessions)
    const sid = payload.sid as string | undefined;
    if (!sid) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    // ✅ fetch the one session referenced by sid
    const session = await this.prisma.session.findFirst({
      where: {
        id: sid,
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, refreshTokenHash: true },
    });

    // If session missing/expired/revoked
    if (!session) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    // ✅ compare provided refresh token vs stored hash
    const ok = await bcrypt.compare(refreshToken, session.refreshTokenHash);

    // Token doesn't match the session -> possible theft/reuse
    if (!ok) {
      // revoke all active sessions for this user
      await this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      throw new UnauthorizedException(
        "Refresh token reuse detected. Please login again."
      );
    }

    // ✅ ROTATE: revoke current session, mint a new refresh token + session
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException("User not found");

    const { access_token, refresh_token } = await this.issueTokens(
      user.id,
      user.email,
      meta
    );

    return { access_token, refresh_token };
  }

  async logout(refreshToken: string) {
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(refreshToken);
    } catch {
      return { ok: true };
    }

    if (payload.typ !== "refresh" || !payload.sub || !payload.sid)
      return { ok: true };

    await this.prisma.session.updateMany({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    return { ok: true };
  }

  async cleanupSessions() {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days

    await this.prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { not: null, lt: cutoff } },
        ],
      },
    });

    return { ok: true };
  }
}

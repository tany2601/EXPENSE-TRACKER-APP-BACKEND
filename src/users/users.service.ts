import {
  Injectable,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { deleteAvatar } from "../cloudinary/cloudinary.utils";
import { join } from "path";
import * as fs from "fs";
import * as bcrypt from "bcryptjs";
import { UnauthorizedException } from "@nestjs/common";

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // -------------------------
  // EXISTING (UNCHANGED)
  // -------------------------

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: {
        email: email.toLowerCase().trim(),
      },
    });
  }

  create(data: {
    email: string;
    name: string;
    phone?: string | null;
    passwordHash: string;
    avatar?: string | null;
  }) {
    return this.prisma.user.create({ data }).catch(() => {
      throw new ConflictException("Email already exists");
    });
  }

  getPublicProfile(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatar: true,
        createdAt: true,
      },
    });
  }

  // -------------------------
  // NEW: UPDATE PROFILE
  // -------------------------

  async updateMe(
    userId: string,
    data: {
      name?: string;
      email?: string;
      phone?: string;
      avatar?: string | null;
    }
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new ForbiddenException();

    // If avatar replaced → delete old Cloudinary avatar
    if (data.avatar && user.avatar && !user.avatar.includes("dicebear")) {
      await deleteAvatar(user.avatar);
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatar: true,
        createdAt: true,
      },
    });
  }

  // -------------------------
  // NEW: DELETE AVATAR ONLY
  // -------------------------

  async removeAvatar(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new ForbiddenException();

    if (user.avatar && !user.avatar.includes("dicebear")) {
      await deleteAvatar(user.avatar);
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { avatar: null },
    });
  }

  // -------------------------
  // NEW: DELETE ACCOUNT
  // -------------------------

  async deleteAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new ForbiddenException();

    if (user.avatar && !user.avatar.includes("dicebear")) {
      await deleteAvatar(user.avatar);
    }

    await this.prisma.user.delete({ where: { id: userId } });

    return { success: true };
  }

  async exportUserData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        transactions: {
          include: {
            splits: true,
          },
        },
        contacts: true,
        categories: true,
      },
    });

    if (!user) throw new ForbiddenException();

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        createdAt: user.createdAt,
      },
      transactions: user.transactions,
      contacts: user.contacts,
      categories: user.categories,
      exportedAt: new Date().toISOString(),
    };
  }
  async upsertEmailOtp(
    email: string,
    type: "PASSWORD_RESET" | "EMAIL_VERIFY",
    otpHash: string,
    expiresAt: Date
  ) {
    return this.prisma.emailOtp.upsert({
      where: { email_type: { email, type } },
      update: { otpHash, expiresAt },
      create: { email, type, otpHash, expiresAt },
    });
  }

  async updatePasswordByEmail(email: string, passwordHash: string) {
    return this.prisma.user.update({
      where: { email: email.toLowerCase().trim() },
      data: { passwordHash },
    });
  }

  async verifyPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      throw new UnauthorizedException("Invalid password");
    }

    return true;
  }

  async resetTransactions(userId: string) {
    await this.prisma.transaction.deleteMany({
      where: { userId },
    });

    return { success: true };
  }

  async findEmailOtp(email: string, type: "PASSWORD_RESET" | "EMAIL_VERIFY") {
    return this.prisma.emailOtp.findUnique({
      where: { email_type: { email, type } },
    });
  }

  async deleteEmailOtp(email: string, type: "PASSWORD_RESET" | "EMAIL_VERIFY") {
    return this.prisma.emailOtp.delete({
      where: { email_type: { email, type } },
    });
  }

  findById(id: string) {
  return this.prisma.user.findUnique({ where: { id } });
}

}

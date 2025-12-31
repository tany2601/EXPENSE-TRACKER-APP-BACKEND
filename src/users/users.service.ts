import {
  Injectable,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { deleteAvatar } from "../cloudinary/cloudinary.utils";
import { join } from "path";
import * as fs from "fs";

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // -------------------------
  // EXISTING (UNCHANGED)
  // -------------------------

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
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
  async upsertPasswordResetOtp(
    email: string,
    otpHash: string,
    expiresAt: Date
  ) {
    return this.prisma.passwordResetOtp.upsert({
      where: { email },
      update: { otpHash, expiresAt },
      create: { email, otpHash, expiresAt },
    });
  }
  async findPasswordResetOtp(email: string) {
    return this.prisma.passwordResetOtp.findUnique({
      where: { email },
    });
  }

  async deletePasswordResetOtp(email: string) {
    return this.prisma.passwordResetOtp.delete({
      where: { email },
    });
  }

  async updatePasswordByEmail(email: string, passwordHash: string) {
    return this.prisma.user.update({
      where: { email },
      data: { passwordHash },
    });
  }
}

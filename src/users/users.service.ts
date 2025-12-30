import {
  Injectable,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { deleteAvatar } from "../cloudinary/cloudinary.utils";

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
    if (
      data.avatar &&
      user.avatar &&
      !user.avatar.includes("dicebear")
    ) {
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
}

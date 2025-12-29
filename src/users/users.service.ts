import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

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
    return this.prisma.user
      .create({ data })
      .catch(() => {
        throw new ConflictException('Email already exists');
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
}

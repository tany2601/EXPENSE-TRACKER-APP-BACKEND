import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private users: UsersService,
    private jwt: JwtService,
  ) {}

  async register(data: { email: string; name: string; password: string; phone?: string }) {
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
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    return this.issueToken(user.id, user.email);
  }

  private async issueToken(userId: string, email: string) {
    const token = await this.jwt.signAsync({ sub: userId, email });
    const user = await this.users.getPublicProfile(userId);
    return { access_token: token, user };
  }
}

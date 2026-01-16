
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'lumina_secret_key_2025',
    });
  }

  async validate(payload: any) {
  if (payload.typ && payload.typ !== "access") {
    throw new UnauthorizedException();
  }
  return { id: payload.sub, email: payload.email };
}

}

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  authenticatedUserSchema,
  type AuthenticatedUser,
  type LoginResponse,
  type SignUpRequest,
} from '@talent-nexus/contracts';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(
    email: string,
    pass: string,
  ): Promise<AuthenticatedUser | null> {
    const user = await this.usersService.findOne(email);
    if (!user?.password || !(await bcrypt.compare(pass, user.password))) {
      return null;
    }
    return authenticatedUserSchema.parse({
      id: user.id,
      email: user.email,
      role: user.role,
    });
  }

  async register(dto: SignUpRequest) {
    const hashPass = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({ ...dto, password: hashPass });
    return authenticatedUserSchema.parse({
      id: user.id,
      email: user.email,
      role: user.role,
    });
  }

  login(user: AuthenticatedUser): LoginResponse {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return {
      access_token: this.jwtService.sign(payload),
      ...user,
    };
  }
}

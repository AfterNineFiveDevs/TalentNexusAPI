import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  API_ERROR_MESSAGES,
  type LoginRequest,
  type LoginResponse,
} from '@talent-nexus/contracts';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(username: string, pass: string) {
    const user = await this.usersService.findOne(username);
    if (!user || user.password !== pass) {
      return null;
    }
    const { password, ...result } = user;
    return result;
  }

  async register(dto: { username: string; password: string }) {
    const user = await this.usersService.create(dto);
    const { password, ...result } = user;
    return result;
  }

  async login({ username, password }: LoginRequest): Promise<LoginResponse> {
    const user = await this.validateUser(username, password);
    if (!user) {
      throw new UnauthorizedException(API_ERROR_MESSAGES.INVALID_CREDENTIALS);
    }

    const payload = { username: user.username, sub: user.userId };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}

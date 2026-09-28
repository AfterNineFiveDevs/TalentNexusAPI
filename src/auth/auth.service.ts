import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(username: string, pass: string): Promise<any> {
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

  login(user: { userId: number | string; username: string }) {
    const payload = { sub: user.userId, username: user.username };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}

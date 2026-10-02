import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  API_SUCCESS_MESSAGES,
  authenticatedUserSchema,
  type AuthenticatedUser,
  type LoginResponse,
  type RefreshResponse,
  type SignUpRequest,
} from '@talent-nexus/contracts';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service.js';
import { success } from '../common/http/api-response.factory.js';
import { AuthActionTokenService } from './auth-action-token.service';
import { RefreshTokenService } from './refresh-token.service';

export interface IssuedAuthSession<TResponse extends LoginResponse> {
  refreshToken: string;
  response: TResponse;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly actionTokens: AuthActionTokenService,
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
    await this.actionTokens.sendRegistrationVerification(user);
    const authenticatedUser = authenticatedUserSchema.parse({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    return success(
      authenticatedUser,
      API_SUCCESS_MESSAGES.EMAIL_VERIFICATION_SENT,
    );
  }

  async login(
    user: AuthenticatedUser,
  ): Promise<IssuedAuthSession<LoginResponse>> {
    return {
      refreshToken: await this.refreshTokens.create(user.id),
      response: this.createAccessResponse(user),
    };
  }

  async refresh(
    refreshToken: string | undefined,
  ): Promise<IssuedAuthSession<RefreshResponse>> {
    const rotated = await this.refreshTokens.rotate(refreshToken);
    return {
      refreshToken: rotated.refreshToken,
      response: this.createAccessResponse(rotated.user),
    };
  }

  logout(refreshToken: string | undefined): Promise<void> {
    return this.refreshTokens.revokeCurrent(refreshToken);
  }

  logoutAll(userId: string): Promise<void> {
    return this.refreshTokens.revokeAll(userId);
  }

  private createAccessResponse(user: AuthenticatedUser): LoginResponse {
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

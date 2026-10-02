import { ConflictException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  API_SUCCESS_MESSAGES,
  API_ERROR_MESSAGES,
  authenticatedUserSchema,
  type AuthenticatedUser,
  type GoogleAuthRequest,
  type LoginResponse,
  type RefreshResponse,
  type SignUpRequest,
} from '@talent-nexus/contracts';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service.js';
import { success } from '../common/http/api-response.factory.js';
import { AuthActionTokenService } from './auth-action-token.service';
import {
  AuthIdentityRepository,
  type AuthIdentityStore,
} from './auth-identity.repository.js';
import { GoogleAuthService } from './google-auth.service.js';
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
    private readonly googleAuth: GoogleAuthService,
    private readonly authIdentities: AuthIdentityRepository,
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

  async loginWithGoogle(
    dto: GoogleAuthRequest,
  ): Promise<IssuedAuthSession<LoginResponse>> {
    const identity = await this.googleAuth.verify(dto.credential);
    let user: AuthenticatedUser;

    try {
      user = await this.authIdentities.transaction((store) =>
        this.resolveGoogleUser(store, identity),
      );
    } catch (error: unknown) {
      if (error instanceof ConflictException) {
        throw error;
      }

      const existing = await this.authIdentities.findGoogleIdentity(
        identity.subject,
      );
      if (!existing) {
        const emailOwner = await this.authIdentities.findUserByEmail(
          identity.email,
        );
        if (
          emailOwner &&
          (await this.authIdentities.findGoogleIdentityByUserId(emailOwner.id))
        ) {
          throw new ConflictException(
            API_ERROR_MESSAGES.GOOGLE_ACCOUNT_LINK_CONFLICT,
          );
        }
        throw error;
      }
      user = authenticatedUserSchema.parse(existing.user);
    }

    return this.login(user);
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

  private async resolveGoogleUser(
    store: AuthIdentityStore,
    identity: { subject: string; email: string; name?: string },
  ): Promise<AuthenticatedUser> {
    const linkedIdentity = await store.findGoogleIdentity(identity.subject);
    if (linkedIdentity) {
      return authenticatedUserSchema.parse(linkedIdentity.user);
    }

    const existingUser = await store.findUserByEmail(identity.email);
    if (existingUser) {
      const otherGoogleIdentity = await store.findGoogleIdentityByUserId(
        existingUser.id,
      );
      if (otherGoogleIdentity) {
        throw new ConflictException(
          API_ERROR_MESSAGES.GOOGLE_ACCOUNT_LINK_CONFLICT,
        );
      }

      await store.createGoogleIdentity(existingUser.id, identity.subject);
      if (!existingUser.verifiedAt) {
        await store.markUserVerified(existingUser.id, new Date().toISOString());
      }
      return authenticatedUserSchema.parse(existingUser);
    }

    const createdUser = await store.createGoogleUser({
      email: identity.email,
      ...(identity.name ? { name: identity.name } : {}),
      now: new Date().toISOString(),
    });
    await store.createGoogleIdentity(createdUser.id, identity.subject);
    return authenticatedUserSchema.parse(createdUser);
  }
}

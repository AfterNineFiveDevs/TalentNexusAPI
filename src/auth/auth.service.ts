import { ConflictException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  API_SUCCESS_MESSAGES,
  API_ERROR_MESSAGES,
  authenticatedUserSchema,
  type AuthenticatedUser,
  type GoogleAuthRequest,
  type LinkedinAuthRequest,
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
  type OAuthProvider,
} from './auth-identity.repository.js';
import {
  GoogleAuthService,
  type VerifiedOAuthIdentity,
} from './google-auth.service.js';
import { LinkedinAuthService } from './linkedin-auth.service.js';
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
    private readonly linkedinAuth: LinkedinAuthService,
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
    return this.loginWithProvider(
      'GOOGLE',
      identity,
      API_ERROR_MESSAGES.GOOGLE_ACCOUNT_LINK_CONFLICT,
    );
  }

  async loginWithLinkedIn(
    dto: LinkedinAuthRequest,
  ): Promise<IssuedAuthSession<LoginResponse>> {
    const identity = await this.linkedinAuth.verify(dto);
    return this.loginWithProvider(
      'LINKEDIN',
      identity,
      API_ERROR_MESSAGES.LINKEDIN_ACCOUNT_LINK_CONFLICT,
    );
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

  /**
   * Finds or creates the user for a verified outside identity, then logs in.
   * If two requests race and the transaction fails, read the winner's row.
   */
  private async loginWithProvider(
    provider: OAuthProvider,
    identity: VerifiedOAuthIdentity,
    conflictMessage: string,
  ): Promise<IssuedAuthSession<LoginResponse>> {
    let user: AuthenticatedUser;

    try {
      user = await this.authIdentities.transaction((store) =>
        this.resolveOAuthUser(store, provider, identity, conflictMessage),
      );
    } catch (error: unknown) {
      if (error instanceof ConflictException) {
        throw error;
      }

      const existing = await this.authIdentities.findIdentity(
        provider,
        identity.subject,
      );
      if (!existing) {
        const emailOwner = await this.authIdentities.findUserByEmail(
          identity.email,
        );
        if (
          emailOwner &&
          (await this.authIdentities.findIdentityByUserId(
            provider,
            emailOwner.id,
          ))
        ) {
          throw new ConflictException(conflictMessage);
        }
        throw error;
      }
      user = authenticatedUserSchema.parse(existing.user);
    }

    return this.login(user);
  }

  private async resolveOAuthUser(
    store: AuthIdentityStore,
    provider: OAuthProvider,
    identity: VerifiedOAuthIdentity,
    conflictMessage: string,
  ): Promise<AuthenticatedUser> {
    const linkedIdentity = await store.findIdentity(provider, identity.subject);
    if (linkedIdentity) {
      return authenticatedUserSchema.parse(linkedIdentity.user);
    }

    const existingUser = await store.findUserByEmail(identity.email);
    if (existingUser) {
      const otherIdentity = await store.findIdentityByUserId(
        provider,
        existingUser.id,
      );
      if (otherIdentity) {
        throw new ConflictException(conflictMessage);
      }

      await store.createIdentity(provider, existingUser.id, identity.subject);
      if (!existingUser.verifiedAt) {
        await store.markUserVerified(existingUser.id, new Date().toISOString());
      }
      return authenticatedUserSchema.parse(existingUser);
    }

    const createdUser = await store.createOAuthUser({
      provider,
      email: identity.email,
      ...(identity.name ? { name: identity.name } : {}),
      now: new Date().toISOString(),
    });
    await store.createIdentity(provider, createdUser.id, identity.subject);
    return authenticatedUserSchema.parse(createdUser);
  }
}

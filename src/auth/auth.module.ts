import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from 'src/users/users.module';
import { AuthController } from './auth.controller';
import { AuthIdentityRepository } from './auth-identity.repository';
import { AuthActionTokenRepository } from './auth-action-token.repository';
import { AuthActionTokenService } from './auth-action-token.service';
import { AuthEmailService } from './auth-email.service';
import { AuthSessionRepository } from './auth-session.repository';
import { AuthService } from './auth.service';
import { CookieOriginGuard } from './cookie-origin.guard';
import { GoogleAuthService } from './google-auth.service';
import { RefreshTokenCookieService } from './refresh-token-cookie.service';
import { RefreshTokenService } from './refresh-token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';

@Module({
  providers: [
    AuthService,
    AuthActionTokenRepository,
    AuthIdentityRepository,
    AuthActionTokenService,
    AuthSessionRepository,
    AuthEmailService,
    CookieOriginGuard,
    GoogleAuthService,
    RefreshTokenCookieService,
    RefreshTokenService,
    LocalStrategy,
    JwtStrategy,
  ],
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.getOrThrow('JWT_EXPIRES_IN'),
        },
      }),
      inject: [ConfigService],
    }),
    ConfigModule,
  ],
  exports: [AuthService],
  controllers: [AuthController],
})
export class AuthModule {}

import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AdminAuthRepository } from './admin-auth.repository';
import { AdminCryptoService } from './admin-crypto.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminEmailService } from './admin-email.service';
import { AdminCookieService } from './admin-cookie.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAccessController } from './admin-access.controller';
import { CookieOriginGuard } from '../auth/cookie-origin.guard';

@Global()
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow('JWT_SECRET'),
      }),
    }),
  ],
  providers: [
    AdminAuthRepository,
    AdminCryptoService,
    AdminAuthService,
    AdminEmailService,
    AdminCookieService,
    CookieOriginGuard,
  ],
  exports: [AdminAuthService],
  controllers: [AdminAuthController, AdminAccessController],
})
export class AdminAuthModule {}

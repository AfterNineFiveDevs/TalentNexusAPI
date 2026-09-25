import { Body, Controller, Get, Post, Request } from '@nestjs/common';
import { LoginRequestDto } from '@talent-nexus/contracts';
import { CurrentUser } from './@decorators/current-user.decorator';
import { Public } from './@decorators/public.decorator';
import { AppService } from './app.service';
import { AuthService } from './auth/auth.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly authService: AuthService,
  ) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Post('auth/login')
  async login(@Body() body: LoginRequestDto) {
    return this.authService.login(body);
  }

  @Post('auth/logout')
  async logout(@Request() req: any) {
    await new Promise<void>((resolve, reject) =>
      req.logout((err: any) => (err ? reject(err) : resolve())),
    );
  }

  @Get('profile')
  getProfile(@CurrentUser() user: any) {
    return user;
  }
}

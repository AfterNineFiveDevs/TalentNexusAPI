import { Controller, Get } from '@nestjs/common';
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

  @Get('profile')
  getProfile(@CurrentUser() user: any) {
    return user;
  }
}

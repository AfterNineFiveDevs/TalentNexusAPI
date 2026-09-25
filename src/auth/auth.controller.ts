import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from 'src/@decorators/current-user.decorator';
import { Public } from 'src/@decorators/public.decorator';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './local-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: { username: string; password: string }) {
    return this.authService.register(dto);
  }

  @Public()
  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@CurrentUser() user: any) {
    return this.authService.login(user);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  logout() {
    return;
  }
}

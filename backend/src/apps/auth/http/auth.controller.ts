import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from '../../../contexts/identity/application/auth.service';
import { AuthenticatedUser } from '../../../contexts/identity/domain/role';
import { CurrentUser } from '../../shared/http/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../shared/http/guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register') register(@Body() input: RegisterDto) { return this.auth.register(input); }
  @Post('login') login(@Body() input: LoginDto) { return this.auth.login(input); }
  @Post('forgot-password') forgotPassword(@Body() input: RequestPasswordResetDto) { return this.auth.requestPasswordReset(input); }
  @Post('reset-password') resetPassword(@Body() input: ResetPasswordDto) { return this.auth.resetPassword(input); }

  @UseGuards(JwtAuthGuard)
  @Get('me') me(@CurrentUser() user: AuthenticatedUser) { return this.auth.currentUser(user.sub); }
}

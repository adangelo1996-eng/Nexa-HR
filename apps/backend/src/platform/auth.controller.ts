import { Body, Controller, Post, Res, Req } from "@nestjs/common";
import { IsEmail, IsString, MinLength } from "class-validator";
import { AuthService } from "./auth.service";
import type { Request, Response } from "express";

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

class SynapseSsoDto {
  @IsString()
  @MinLength(16)
  synapseSsoToken!: string;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<unknown> {
    const out = await this.authService.login(dto.email, dto.password);
    this.authService.setRefreshCookie({ req, res, refreshToken: out.refreshToken });
    return { token: out.token, user: out.user };
  }

  @Post("sso")
  async sso(
    @Body() dto: SynapseSsoDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<unknown> {
    const out = await this.authService.loginWithSynapseSso(dto.synapseSsoToken);
    this.authService.setRefreshCookie({ req, res, refreshToken: out.refreshToken });
    return { token: out.token, user: out.user };
  }

  @Post("refresh")
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<unknown> {
    const out = await this.authService.refreshFromCookie(req);
    this.authService.setRefreshCookie({ req, res, refreshToken: out.refreshToken });
    return { token: out.token, user: out.user };
  }

  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ ok: true }> {
    await this.authService.revokeFromCookie(req);
    this.authService.clearRefreshCookie({ req, res });
    return { ok: true };
  }
}

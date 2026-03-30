import { Body, Controller, Post } from "@nestjs/common";
import { IsEmail, IsString, MinLength } from "class-validator";
import { AuthService } from "./auth.service";

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
  async login(@Body() dto: LoginDto): Promise<unknown> {
    return this.authService.login(dto.email, dto.password);
  }

  @Post("sso")
  async sso(@Body() dto: SynapseSsoDto): Promise<unknown> {
    return this.authService.loginWithSynapseSso(dto.synapseSsoToken);
  }
}

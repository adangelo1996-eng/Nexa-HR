import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from "class-validator";
import { CurrentAuth, type AuthContext, type AuthRole, RequireRole, RoleGuard } from "../platform/auth";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { HebbHrService, type HebbChatMessage } from "./hebb-hr.service";

class HebbChatMessageDto {
  @IsIn(["user", "assistant", "system", "tool"])
  role!: HebbChatMessage["role"];

  @IsOptional()
  @IsString()
  content?: string | null;
}

class HebbChatRequestDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HebbChatMessageDto)
  messages?: HebbChatMessageDto[];
}

@Controller("ai/hebb-hr")
@UseGuards(RoleGuard, NexaPermissionGuard)
@RequireRole("user")
export class HebbHrController {
  constructor(private readonly hebb: HebbHrService) {}

  @Post("messages")
  @RequireNexaPermissions("nexa.payroll:read")
  async postMessages(
    @CurrentAuth() auth: AuthContext & { role: AuthRole },
    @Body() body: HebbChatRequestDto
  ): Promise<{ message: string; toolResults?: unknown[] }> {
    const messages: HebbChatMessage[] = (body.messages ?? []).map((m) => ({
      role: m.role,
      content: m.content ?? null
    }));
    return this.hebb.runChat(auth, { messages });
  }
}

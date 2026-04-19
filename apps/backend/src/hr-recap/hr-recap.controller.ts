import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { IsString, MinLength } from "class-validator";
import { CurrentAuth, type AuthContext, RequireRole, RoleGuard } from "../platform/auth";
import { NexaPermissionGuard } from "../platform/nexa-permission.guard";
import { HrRecapService } from "./hr-recap.service";

class HrRecapReminderDto {
  @IsString()
  @MinLength(4)
  taskId!: string;
}

@Controller("hr-recap")
@UseGuards(RoleGuard, NexaPermissionGuard)
@RequireRole("user")
export class HrRecapController {
  constructor(private readonly svc: HrRecapService) {}

  @Get("summary")
  summary(@CurrentAuth() auth: AuthContext): ReturnType<HrRecapService["getSummary"]> {
    return this.svc.getSummary(auth);
  }

  /** Stessa forma di `GET /recruiting/onboarding`, ma autorizzato anche con permesso recap HR (senza `nexa.recruiting:read`). */
  @Get("recruiting-onboarding")
  recruitingOnboarding(@CurrentAuth() auth: AuthContext): ReturnType<HrRecapService["listRecruitingOnboarding"]> {
    return this.svc.listRecruitingOnboarding(auth);
  }

  @Get("tasks")
  tasks(@CurrentAuth() auth: AuthContext): ReturnType<HrRecapService["listTasks"]> {
    return this.svc.listTasks(auth);
  }

  @Get("people")
  people(@CurrentAuth() auth: AuthContext, @Query("category") category: string): ReturnType<HrRecapService["listPeople"]> {
    return this.svc.listPeople(auth, category);
  }

  @Post("reminders")
  reminders(@CurrentAuth() auth: AuthContext, @Body() dto: HrRecapReminderDto): ReturnType<HrRecapService["postReminder"]> {
    return this.svc.postReminder(auth, dto);
  }
}

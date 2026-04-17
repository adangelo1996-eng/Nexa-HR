import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { CurrentAuth, type AuthContext, RequireRole, RoleGuard } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard } from "../platform/nexa-permission.guard";
import { PermissionsService } from "../platform/permissions.service";
import { CreateMeetingRoomBookingDto, CreateMeetingRoomDto } from "./meeting-rooms.dto";

@Controller("meeting-rooms")
@UseGuards(RoleGuard, NexaPermissionGuard)
@RequireRole("user")
export class MeetingRoomsController {
  constructor(
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService
  ) {}

  @Get()
  async list(@CurrentAuth() auth: AuthContext): Promise<{ items: Awaited<ReturnType<HrDataStore["listMeetingRooms"]>> }> {
    return { items: await this.store.listMeetingRooms(auth.userId) };
  }

  @Post()
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateMeetingRoomDto
  ): Promise<{ item: Awaited<ReturnType<HrDataStore["createMeetingRoom"]>> }> {
    const u = await this.store.findUserById(auth.userId);
    const email = (u?.email ?? "").trim();
    const mayCreate =
      auth.role === "superuser" || (await this.permissions.canAccessNexaAdminUi(auth.userId, auth.role, email));
    if (!mayCreate) {
      throw new ForbiddenException("Solo superuser o amministratore Synapse possono creare sale riunioni");
    }
    return { item: await this.store.createMeetingRoom(auth.userId, dto) };
  }

  @Get("bookings")
  async listBookings(
    @CurrentAuth() auth: AuthContext,
    @Query("from") from?: string,
    @Query("to") to?: string
  ): Promise<{ events: Awaited<ReturnType<HrDataStore["listMeetingRoomBookingEvents"]>> }> {
    return { events: await this.store.listMeetingRoomBookingEvents(auth.userId, from, to) };
  }

  @Post(":roomId/bookings")
  async book(
    @CurrentAuth() auth: AuthContext,
    @Param("roomId") roomId: string,
    @Body() dto: CreateMeetingRoomBookingDto
  ): Promise<{ event: Awaited<ReturnType<HrDataStore["createMeetingRoomBookingEvent"]>> }> {
    try {
      return { event: await this.store.createMeetingRoomBookingEvent(auth.userId, roomId, dto) };
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (m.toLowerCase().includes("overlap") || m.toLowerCase().includes("conflict")) {
        throw new BadRequestException("Sala già prenotata in quell'orario");
      }
      throw e;
    }
  }

  @Delete("bookings/:bookingId")
  async cancel(
    @CurrentAuth() auth: AuthContext,
    @Param("bookingId") bookingId: string
  ): Promise<{ ok: true }> {
    await this.store.cancelMeetingRoomBooking(auth.userId, bookingId);
    return { ok: true };
  }
}

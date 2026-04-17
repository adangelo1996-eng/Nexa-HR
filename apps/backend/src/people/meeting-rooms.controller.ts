import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentAuth, type AuthContext, RequireRole, RoleGuard } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { CreateMeetingRoomBookingDto, CreateMeetingRoomDto } from "./meeting-rooms.dto";

@Controller("meeting-rooms")
@UseGuards(RoleGuard, NexaPermissionGuard)
@RequireRole("user")
export class MeetingRoomsController {
  constructor(private readonly store: HrDataStore) {}

  @Get()
  async list(@CurrentAuth() auth: AuthContext): Promise<{ items: Awaited<ReturnType<HrDataStore["listMeetingRooms"]>> }> {
    return { items: await this.store.listMeetingRooms(auth.userId) };
  }

  @Post()
  @RequireNexaPermissions("nexa.meeting_rooms:write")
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateMeetingRoomDto
  ): Promise<{ item: Awaited<ReturnType<HrDataStore["createMeetingRoom"]>> }> {
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


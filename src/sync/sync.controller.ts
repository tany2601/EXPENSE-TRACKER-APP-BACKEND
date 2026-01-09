import { Controller, Get, Post, Body, Query, Request, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { SyncService } from "./sync.service";
import { SyncPullQueryDto, SyncPushDto } from "./dto/sync.dto";

@UseGuards(JwtAuthGuard)
@Controller("sync")
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post("push")
  async push(@Body() dto: SyncPushDto, @Request() req: any) {
    // userId always from JWT, never from client
    return this.syncService.push(req.user.id, dto.deviceId, dto.ops);
  }

  @Get("pull")
  async pull(@Query() q: SyncPullQueryDto, @Request() req: any) {
    return this.syncService.pull(req.user.id, q.since, q.limit);
  }
}

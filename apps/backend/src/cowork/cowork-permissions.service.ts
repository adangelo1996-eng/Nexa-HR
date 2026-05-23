import { Injectable } from "@nestjs/common";
import type { AuthContext } from "../platform/auth";
import { PermissionsService } from "../platform/permissions.service";
import { COWORK_TOOL_LIST } from "./cowork-tool-catalog";
import type { CoworkToolDef } from "./cowork.types";

@Injectable()
export class CoworkPermissionsService {
  constructor(private readonly permissions: PermissionsService) {}

  async filterToolsForActor(auth: AuthContext): Promise<CoworkToolDef[]> {
    const out: CoworkToolDef[] = [];
    for (const tool of COWORK_TOOL_LIST) {
      if (await this.actorCanUseTool(auth, tool)) {
        out.push(tool);
      }
    }
    return out;
  }

  async actorCanUseTool(auth: AuthContext, tool: CoworkToolDef): Promise<boolean> {
    if (tool.permissions.length === 0) {
      return true;
    }
    if (auth.role === "superuser") {
      return true;
    }
    return this.permissions.userHasAll(auth.userId, tool.permissions);
  }
}

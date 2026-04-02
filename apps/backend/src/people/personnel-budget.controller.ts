import { Body, Controller, Get, Patch, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested
} from "class-validator";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";

class CostCenterOrderItemDto {
  @IsString()
  costCenterId!: string;

  @IsInt()
  sortOrder!: number;
}

class PatchBudgetOrderDto {
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CostCenterOrderItemDto)
  order!: CostCenterOrderItemDto[];
}

class BudgetCellPatchDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsNumber()
  budgetRal?: number | null;

  @IsOptional()
  @IsNumber()
  budgetOvertime?: number | null;

  @IsOptional()
  @IsNumber()
  budgetTravel?: number | null;

  @IsOptional()
  @IsNumber()
  budgetInps?: number | null;

  @IsOptional()
  @IsNumber()
  budgetInail?: number | null;

  @IsOptional()
  @IsNumber()
  budgetTfr?: number | null;
}

class PatchBudgetCellsDto {
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetCellPatchDto)
  cells!: BudgetCellPatchDto[];
}

@Controller("hr/personnel-budget")
@UseGuards(NexaPermissionGuard)
export class PersonnelBudgetController {
  constructor(private readonly store: HrDataStore) {}

  @Get()
  @RequireNexaPermissions("nexa.personnel_budget:read")
  async get(
    @Query("year") yearQ?: string,
    @Query("month") monthQ?: string
  ): Promise<unknown> {
    const now = new Date();
    const year = yearQ ? Number.parseInt(yearQ, 10) : now.getFullYear();
    const month = monthQ ? Number.parseInt(monthQ, 10) : now.getMonth() + 1;
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return this.store.getPersonnelBudgetSnapshot(now.getFullYear(), now.getMonth() + 1);
    }
    return this.store.getPersonnelBudgetSnapshot(year, month);
  }

  @Patch("cost-center-order")
  @RequireNexaPermissions("nexa.personnel_budget:write")
  async patchOrder(@Body() dto: PatchBudgetOrderDto): Promise<{ ok: true }> {
    await this.store.setPersonnelBudgetCostCenterOrder(
      dto.year,
      dto.order.map((o) => ({ costCenterId: o.costCenterId.trim(), sortOrder: o.sortOrder }))
    );
    return { ok: true };
  }

  @Patch("cells")
  @RequireNexaPermissions("nexa.personnel_budget:write")
  async patchCells(@Body() dto: PatchBudgetCellsDto): Promise<{ ok: true }> {
    await this.store.upsertPersonnelBudgetCells(dto.year, dto.month, dto.cells);
    return { ok: true };
  }
}

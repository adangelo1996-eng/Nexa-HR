"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo } from "react";
import type { PortalTile } from "@/lib/portal-mappa";
import {
  portalCategoryGlassPillClass,
  portalCategoryLineColor,
  portalCentralDashboardGlassClass
} from "@/lib/nav-visual-accents";

const CANVAS_W = 2800;
const CANVAS_H = 1820;
const R1 = 400;
const R2 = 228;

type BranchLayout = {
  category: string;
  tiles: PortalTile[];
  angle: number;
  catX: number;
  catY: number;
  tileLayouts: { tile: PortalTile; x: number; y: number }[];
};

function layoutMindMap(branches: { category: string; tiles: PortalTile[] }[]): BranchLayout[] {
  const n = Math.max(branches.length, 1);
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;
  return branches.map((branch, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const catX = cx + R1 * Math.cos(angle);
    const catY = cy + R1 * Math.sin(angle);
    const outwardX = Math.cos(angle);
    const outwardY = Math.sin(angle);
    const perpX = -outwardY;
    const perpY = outwardX;
    const k = branch.tiles.length;
    const tileLayouts = branch.tiles.map((tile, j) => {
    const spread = Math.min(0.52, 0.12 + k * 0.032);
    const t = k === 1 ? 0 : ((j - (k - 1) / 2) / Math.max((k - 1) / 2, 1)) * spread;
    const fanAngle = angle + Math.PI / 2 + t * 1.22;
      const tx = catX + R2 * Math.cos(fanAngle) + perpX * ((j % 2) * 14);
      const ty = catY + R2 * Math.sin(fanAngle) + perpY * ((j % 2) * 14);
      return { tile, x: tx, y: ty };
    });
    return { ...branch, angle, catX, catY, tileLayouts };
  });
}

export type PortalMindMapProps = {
  branches: { category: string; tiles: PortalTile[] }[];
  showDashboardCenter: boolean;
  dashboardBlurb?: string;
};

export function PortalMindMap(props: PortalMindMapProps): React.JSX.Element {
  const { branches, showDashboardCenter, dashboardBlurb } = props;
  const laid = useMemo(() => layoutMindMap(branches), [branches]);
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;

  const lines = useMemo(() => {
    const out: { x1: number; y1: number; x2: number; y2: number; stroke: string; key: string }[] = [];
    for (const b of laid) {
      out.push({
        x1: cx,
        y1: cy,
        x2: b.catX,
        y2: b.catY,
        stroke: portalCategoryLineColor(b.category),
        key: `c-${b.category}`
      });
      for (const { tile, x, y } of b.tileLayouts) {
        out.push({
          x1: b.catX,
          y1: b.catY,
          x2: x,
          y2: y,
          stroke: portalCategoryLineColor(b.category),
          key: `t-${b.category}-${String(tile.href)}`
        });
      }
    }
    return out;
  }, [laid, cx, cy]);

  return (
    <div
      className="relative"
      style={{ width: CANVAS_W, height: CANVAS_H, margin: "0 auto" }}
      role="img"
      aria-label="Mappa concettuale del portale: Dashboard al centro, categorie e pagine collegate"
    >
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        aria-hidden
      >
        {lines.map((ln) => (
          <line
            key={ln.key}
            x1={ln.x1}
            y1={ln.y1}
            x2={ln.x2}
            y2={ln.y2}
            stroke={ln.stroke}
            strokeWidth={2.25}
            strokeLinecap="round"
            opacity={0.55}
          />
        ))}
      </svg>

      {showDashboardCenter ? (
        <div
          className="absolute z-20 flex flex-col items-center gap-2"
          style={{
            left: cx,
            top: cy,
            transform: "translate(-50%, -50%)"
          }}
        >
          <Link
            href={"/" as Route}
            scroll={false}
            title={dashboardBlurb}
            className={`inline-flex text-center ${portalCentralDashboardGlassClass()}`}
          >
            Dashboard
          </Link>
        </div>
      ) : null}

      {laid.map((b) => (
        <div key={b.category}>
          <div
            className="absolute z-10 flex justify-center"
            style={{
              left: b.catX,
              top: b.catY,
              transform: "translate(-50%, -50%)"
            }}
          >
            <div className={`text-center ${portalCategoryGlassPillClass(b.category, "category")}`}>{b.category}</div>
          </div>
          {b.tileLayouts.map(({ tile, x, y }) => (
            <div
              key={String(tile.href)}
              className="absolute z-10 flex justify-center"
              style={{
                left: x,
                top: y,
                transform: "translate(-50%, -50%)"
              }}
            >
              <Link
                href={tile.href}
                scroll={false}
                title={tile.blurb}
                className={`block text-center ${portalCategoryGlassPillClass(b.category, "leaf")}`}
              >
                {tile.title}
              </Link>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export const PORTAL_MIND_MAP_CANVAS = { w: CANVAS_W, h: CANVAS_H, r1: R1, r2: R2 };

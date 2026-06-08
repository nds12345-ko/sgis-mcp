// ============================================================
// SGIS 통계지도 MCP Apps 서버
// ------------------------------------------------------------
// - show_korea_statmap : 호출 시 오른쪽 패널에 지도 UI(iframe) 렌더 + 초기 데이터 푸시
// - sgis_get_map_data  : UI(iframe)가 드롭다운 변경 시 호출 → SGIS 조회 → 데이터 반환
// 보안Key는 이 프로세스(.env)에만 존재한다.
// ============================================================
import "dotenv/config";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import cors from "cors";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import {
  getAccessToken,
  getBoundary,
  getStats,
  STAT_TYPES,
  type StatType,
} from "./src/sgis.js";

const DEFAULT_STAT: StatType = "population";
const DEFAULT_YEAR = 2020;

// ---- 지도 데이터 빌드 (토큰 → 경계 + 통계 → 조인 → SVG용 페이로드) -------------

interface MapFeature {
  adm_cd: string;
  adm_nm: string;
  value: number;
  /** 폴리곤 목록. 각 폴리곤은 ring 목록, 각 ring은 [x,y] 목록 (UTMK). */
  polygons: number[][][][];
}

interface MapPayload {
  statType: StatType;
  statLabel: string;
  year: number;
  features: MapFeature[];
  min: number;
  max: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

function toPolygons(geometry: any): number[][][][] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

async function buildMapData(statType: StatType, year: number): Promise<MapPayload> {
  const token = await getAccessToken(Date.now());
  const [geojson, stats] = await Promise.all([
    getBoundary(token, year, 0), // 경계: low_search=0 → 시도 17개
    getStats(token, statType, year, 1), // 통계: low_search=1 → 전국 하위 시도 17개
  ]);

  let min = Infinity;
  let max = -Infinity;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const features: MapFeature[] = [];
  for (const f of geojson.features as any[]) {
    const admCd: string = f.properties?.adm_cd ?? f.properties?.adm_dr_cd ?? "";
    const polygons = toPolygons(f.geometry);
    const value = stats.values[admCd] ?? 0;
    const admNm = f.properties?.adm_nm ?? stats.names[admCd] ?? admCd;

    for (const poly of polygons) {
      for (const ring of poly) {
        for (const [x, y] of ring) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (value < min) min = value;
    if (value > max) max = value;
    features.push({ adm_cd: admCd, adm_nm: admNm, value, polygons });
  }

  return {
    statType,
    statLabel: STAT_TYPES[statType].label,
    year,
    features,
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 0,
    bounds: { minX, minY, maxX, maxY },
  };
}

function summarize(p: MapPayload): string {
  const top = [...p.features].sort((a, b) => b.value - a.value).slice(0, 3);
  const topStr = top.map((f) => `${f.adm_nm} ${f.value.toLocaleString()}`).join(", ");
  return `${p.year}년 시도별 ${p.statLabel} 단계구분도 (${p.features.length}개 지역). 상위: ${topStr}`;
}

// ---- MCP 서버 + 도구/리소스 등록 ------------------------------------------------

const resourceUri = "ui://sgis-statmap/mcp-app.html";

const statTypeSchema = z
  .enum(["population", "household", "house"])
  .describe("통계 종류: population(인구)/household(가구)/house(주택)");
const yearSchema = z.number().int().min(2000).max(2023).describe("기준 연도 (예: 2020)");

// 각 요청마다 새 McpServer 인스턴스를 만든다 (Streamable HTTP 무상태 패턴).
// 단일 인스턴스를 재사용하면 두 번째 요청에서
// "Already connected to a transport" 오류가 발생한다.
function buildMcpServer(): McpServer {
const server = new McpServer({
  name: "SGIS 통계지도",
  version: "1.0.0",
});

// 1) 지도 UI를 띄우는 진입 도구 (LLM이 지도 질문 시 호출)
registerAppTool(
  server,
  "show_korea_statmap",
  {
    title: "한국 시도 통계지도 보기",
    description:
      "한국 시도(17개) 단위 통계를 단계구분도(색칠 지도)로 오른쪽 패널에 표시한다. " +
      "인구/가구/주택 통계를 SGIS에서 가져와 지도에 채색한다. " +
      "지도/통계지도/인구지도 등을 요청하면 이 도구를 사용한다.",
    inputSchema: {
      statType: statTypeSchema.optional(),
      year: yearSchema.optional(),
    },
    _meta: { ui: { resourceUri } },
  },
  async (args: { statType?: StatType; year?: number }) => {
    const statType = args.statType ?? DEFAULT_STAT;
    const year = args.year ?? DEFAULT_YEAR;
    const payload = await buildMapData(statType, year);
    return {
      content: [{ type: "text", text: summarize(payload) }],
      structuredContent: payload as unknown as Record<string, unknown>,
    };
  },
);

// 2) UI(iframe)가 드롭다운 변경 시 호출하는 데이터 도구
registerAppTool(
  server,
  "sgis_get_map_data",
  {
    title: "SGIS 지도 데이터 조회",
    description:
      "선택한 통계 종류·연도에 대한 시도 경계 GeoJSON과 통계 수치를 조인해 반환한다. " +
      "지도 UI가 내부적으로 호출한다.",
    inputSchema: {
      statType: statTypeSchema,
      year: yearSchema,
    },
    _meta: { ui: { resourceUri } },
  },
  async (args: { statType: StatType; year: number }) => {
    const payload = await buildMapData(args.statType, args.year);
    return {
      content: [{ type: "text", text: summarize(payload) }],
      structuredContent: payload as unknown as Record<string, unknown>,
    };
  },
);

// 3) UI 리소스 (Vite로 번들된 단일 HTML)
registerAppResource(
  server,
  resourceUri,
  resourceUri,
  { mimeType: RESOURCE_MIME_TYPE },
  async () => {
    const html = await fs.readFile(
      path.join(import.meta.dirname, "dist", "mcp-app.html"),
      "utf-8",
    );
    return {
      contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }],
    };
  },
);

  return server;
}

// ---- Express HTTP 전송 (/mcp) ---------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/", (_req, res) => {
  res.type("text/plain").send("SGIS 통계지도 MCP 서버 가동 중. 엔드포인트: POST /mcp");
});

app.post("/mcp", async (req, res) => {
  const server = buildMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// Vercel(서버리스)에서는 import만 하고 listen 하지 않는다. 로컬에서만 포트를 연다.
if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT ?? 3001);
  app.listen(PORT, () => {
    console.log(`SGIS 통계지도 MCP 서버: http://localhost:${PORT}/mcp`);
  });
}

export default app;

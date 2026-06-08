// ============================================================
// SGIS Open API 서버측 클라이언트
// ------------------------------------------------------------
// 보안Key(consumer_secret)는 이 서버 프로세스에만 존재한다.
// 브라우저(iframe UI)는 SGIS를 직접 호출하지 않고, MCP 도구를 통해
// 이 모듈을 거쳐서만 데이터를 받는다.
// ============================================================

const SGIS_BASE = "https://sgisapi.kostat.go.kr/OpenAPI3";

const SERVICE_ID = process.env.SGIS_SERVICE_ID ?? "";
const SECURITY_KEY = process.env.SGIS_SECURITY_KEY ?? "";

export type StatType = "population" | "household" | "house";

export interface StatMeta {
  /** 통계 종류 라벨 (한국어) */
  label: string;
  /** stats/population.json 응답에서 수치를 꺼낼 필드명 */
  field: string;
}

// SGIS stats/population.json 한 응답(시도 행)에 인구·가구·주택 수가 모두 들어있다.
// (실측 확인: tot_ppltn=총인구, tot_family=가구 수, tot_house=주택 수)
export const STAT_TYPES: Record<StatType, StatMeta> = {
  population: { label: "총인구", field: "tot_ppltn" },
  household: { label: "가구 수", field: "tot_family" },
  house: { label: "주택 수", field: "tot_house" },
};

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}
let cachedToken: CachedToken | null = null;

function assertKeys(): void {
  if (!SERVICE_ID || !SECURITY_KEY) {
    throw new Error(
      "SGIS 키가 설정되지 않았습니다. .env 에 SGIS_SERVICE_ID, SGIS_SECURITY_KEY 를 입력하세요.",
    );
  }
}

/** accessToken 발급 (유효 4시간). 만료 5분 전부터 재발급. */
export async function getAccessToken(nowMs: number): Promise<string> {
  assertKeys();
  if (cachedToken && cachedToken.expiresAt - 5 * 60_000 > nowMs) {
    return cachedToken.token;
  }
  const url = new URL(`${SGIS_BASE}/auth/authentication.json`);
  url.searchParams.set("consumer_key", SERVICE_ID);
  url.searchParams.set("consumer_secret", SECURITY_KEY);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`SGIS 인증 HTTP ${res.status}`);
  const json: any = await res.json();
  const token: string | undefined = json?.result?.accessToken;
  if (!token) {
    throw new Error(`SGIS 인증 실패: ${json?.errMsg ?? JSON.stringify(json).slice(0, 200)}`);
  }
  // accessTimeout 은 보통 epoch(ms) 문자열. 없으면 4시간으로 가정.
  const timeoutRaw = json?.result?.accessTimeout;
  const expiresAt = timeoutRaw ? Number(timeoutRaw) : nowMs + 4 * 60 * 60_000;
  cachedToken = { token, expiresAt };
  return token;
}

/** GeoJSON 형태의 행정구역 경계 (UTMK/EPSG:5179 좌표). */
export async function getBoundary(
  accessToken: string,
  year: number,
  lowSearch = 0,
): Promise<any> {
  const url = new URL(`${SGIS_BASE}/boundary/hadmarea.geojson`);
  url.searchParams.set("accessToken", accessToken);
  url.searchParams.set("year", String(year));
  url.searchParams.set("low_search", String(lowSearch));

  const res = await fetch(url);
  if (!res.ok) throw new Error(`SGIS 경계 HTTP ${res.status}`);
  const geojson: any = await res.json();
  if (!geojson?.features) {
    throw new Error(`SGIS 경계 응답 형식 오류: ${JSON.stringify(geojson).slice(0, 200)}`);
  }
  return geojson;
}

/**
 * 통계 수치 조회. stats/population.json 을 low_search=1 로 호출하면
 * 전국 하위(시도 17개)의 인구·가구·주택 수가 한 번에 온다.
 * adm_cd 별 { value } 맵을 반환.
 */
export async function getStats(
  accessToken: string,
  statType: StatType,
  year: number,
  lowSearch = 1,
): Promise<{ values: Record<string, number>; names: Record<string, string> }> {
  const field = STAT_TYPES[statType].field;
  const url = new URL(`${SGIS_BASE}/stats/population.json`);
  url.searchParams.set("accessToken", accessToken);
  url.searchParams.set("year", String(year));
  url.searchParams.set("low_search", String(lowSearch));

  const res = await fetch(url);
  if (!res.ok) throw new Error(`SGIS 통계 HTTP ${res.status}`);
  const json: any = await res.json();
  const rows: any[] = json?.result ?? [];
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`SGIS 통계 응답 비어있음: ${json?.errMsg ?? JSON.stringify(json).slice(0, 200)}`);
  }

  const values: Record<string, number> = {};
  const names: Record<string, string> = {};
  for (const row of rows) {
    const admCd: string | undefined = row.adm_cd;
    if (!admCd) continue;
    names[admCd] = row.adm_nm ?? admCd;
    const n = Number(row[field]);
    values[admCd] = Number.isFinite(n) ? n : 0;
  }
  return { values, names };
}

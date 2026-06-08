// ============================================================
// SGIS 시도 통계지도 — iframe UI 로직 (MCP App 클라이언트)
// ------------------------------------------------------------
// 외부 네트워크를 직접 호출하지 않는다. 모든 데이터는 MCP 호스트를 통해
// 서버 도구(sgis_get_map_data)를 호출해서 받는다 (postMessage/JSON-RPC).
// 렌더링은 render.ts(순수 SVG)에 위임한다.
// ============================================================
import { App } from "@modelcontextprotocol/ext-apps";
import { renderMap, type MapPayload } from "./render.js";

const statSel = document.getElementById("stat") as HTMLSelectElement;
const yearSel = document.getElementById("year") as HTMLSelectElement;
const titleEl = document.getElementById("title")!;
const statusEl = document.getElementById("status")!;
const svg = document.getElementById("map") as unknown as SVGSVGElement;
const legendEl = document.getElementById("legend")!;
const tipEl = document.getElementById("tip")!;

const app = new App({ name: "SGIS 시도 통계지도", version: "1.0.0" });
app.connect();

// 호스트가 도구 결과를 푸시하면(최초 show_korea_statmap 호출 등) 렌더한다.
app.ontoolresult = (result: any) => {
  const payload = readPayload(result);
  if (payload) draw(payload);
};

statSel.addEventListener("change", reload);
yearSel.addEventListener("change", reload);

let loading = false;
async function reload() {
  if (loading) return;
  loading = true;
  setStatus("지도를 불러오는 중…");
  try {
    const result = await app.callServerTool({
      name: "sgis_get_map_data",
      arguments: { statType: statSel.value, year: Number(yearSel.value) },
    });
    const payload = readPayload(result);
    if (payload) draw(payload);
    else setStatus("데이터를 해석할 수 없습니다.", true);
  } catch (e: any) {
    setStatus(`오류: ${e?.message ?? e}`, true);
  } finally {
    loading = false;
  }
}

function draw(p: MapPayload) {
  // 드롭다운/제목을 페이로드 상태와 동기화한 뒤 렌더
  if (statSel.value !== p.statType) statSel.value = p.statType;
  if (yearSel.value !== String(p.year)) yearSel.value = String(p.year);
  titleEl.textContent = `${p.year}년 시도별 ${p.statLabel}`;
  renderMap({ svg, legendEl, tipEl }, p);
  svg.hidden = false;
  legendEl.hidden = false;
  statusEl.style.display = "none";
}

function readPayload(result: any): MapPayload | null {
  if (!result) return null;
  if (result.structuredContent?.features) return result.structuredContent as MapPayload;
  const text = result.content?.find((c: any) => c.type === "text")?.text;
  if (text) {
    try {
      const j = JSON.parse(text);
      if (j?.features) return j as MapPayload;
    } catch { /* 요약 텍스트일 뿐 데이터 아님 */ }
  }
  return null;
}

function setStatus(msg: string, isError = false) {
  statusEl.textContent = msg;
  statusEl.className = isError ? "error" : "";
  statusEl.style.display = "block";
  svg.hidden = true;
  legendEl.hidden = true;
}

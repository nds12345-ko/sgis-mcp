// 개발용 미리보기 하니스 — MCP 호스트 없이 저장된 페이로드로 렌더만 확인한다.
import { renderMap, type MapPayload } from "./render.js";

const svg = document.getElementById("map") as unknown as SVGSVGElement;
const legendEl = document.getElementById("legend")!;
const tipEl = document.getElementById("tip")!;
const titleEl = document.getElementById("title")!;

const res = await fetch("/preview-payload.json");
const p = (await res.json()) as MapPayload;
titleEl.textContent = `${p.year}년 시도별 ${p.statLabel}`;
renderMap({ svg, legendEl, tipEl }, p);

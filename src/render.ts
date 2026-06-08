// ============================================================
// 단계구분도 렌더링 (프레임워크 비의존, 순수 DOM/SVG)
// UTMK(EPSG:5179) 평면좌표를 SVG 뷰포트에 선형 맞춤(Y 반전)해 폴리곤을 그린다.
// MCP UI(mcp-app.ts)와 미리보기 하니스(preview.ts)가 함께 사용한다.
// ============================================================

export interface MapFeature {
  adm_cd: string;
  adm_nm: string;
  value: number;
  polygons: number[][][][];
}
export interface MapPayload {
  statType: string;
  statLabel: string;
  year: number;
  features: MapFeature[];
  min: number;
  max: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface RenderTargets {
  svg: SVGSVGElement;
  legendEl: HTMLElement;
  tipEl: HTMLElement;
}

export const VIEW_W = 800;
export const VIEW_H = 900;
const PAD = 20;

// 6단계 순차 색상 (연한 → 진한 파랑)
export const COLORS = ["#eff3ff", "#c6dbef", "#9ecae1", "#6baed6", "#3182bd", "#08519c"];

const NS = "http://www.w3.org/2000/svg";

export function renderMap(t: RenderTargets, p: MapPayload): void {
  const { svg, legendEl, tipEl } = t;
  const { minX, minY, maxX, maxY } = p.bounds;
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min((VIEW_W - 2 * PAD) / spanX, (VIEW_H - 2 * PAD) / spanY);
  const offX = (VIEW_W - spanX * scale) / 2;
  const offY = (VIEW_H - spanY * scale) / 2;
  // UTMK는 북쪽이 y 증가 → SVG는 아래가 y 증가하므로 Y를 뒤집는다.
  const px = (x: number) => offX + (x - minX) * scale;
  const py = (y: number) => VIEW_H - (offY + (y - minY) * scale);

  const breaks = quantileBreaks(p.features.map((f) => f.value), COLORS.length);
  const colorFor = (v: number) => COLORS[classIndex(v, breaks)];

  while (svg.firstChild) svg.removeChild(svg.firstChild);
  for (const f of p.features) {
    let d = "";
    for (const poly of f.polygons) {
      for (const ring of poly) {
        ring.forEach(([x, y], i) => {
          d += (i === 0 ? "M" : "L") + px(x).toFixed(1) + " " + py(y).toFixed(1) + " ";
        });
        d += "Z ";
      }
    }
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d.trim());
    path.setAttribute("class", "region");
    path.setAttribute("fill", colorFor(f.value));
    path.setAttribute("fill-rule", "evenodd");
    const tipText = `${f.adm_nm}: ${f.value.toLocaleString()}`;
    path.addEventListener("mousemove", (ev) => showTip(svg, tipEl, ev as MouseEvent, tipText));
    path.addEventListener("mouseleave", () => (tipEl.style.display = "none"));
    svg.appendChild(path);
  }

  drawLegend(legendEl, breaks, p.statLabel);
}

function drawLegend(legendEl: HTMLElement, breaks: number[], label: string): void {
  let html = `<div style="font-weight:700;margin-bottom:4px">${label}</div>`;
  for (let i = COLORS.length - 1; i >= 0; i--) {
    const lo = i === 0 ? 0 : breaks[i - 1];
    const range = i === COLORS.length - 1 ? `${fmt(lo)} 이상` : `${fmt(lo)} – ${fmt(breaks[i])}`;
    html += `<div class="row"><span class="sw" style="background:${COLORS[i]}"></span>${range}</div>`;
  }
  legendEl.innerHTML = html;
}

function showTip(svg: SVGSVGElement, tipEl: HTMLElement, ev: MouseEvent, text: string): void {
  const rect = (svg as Element).getBoundingClientRect();
  tipEl.textContent = text;
  tipEl.style.left = ev.clientX - rect.left + "px";
  tipEl.style.top = ev.clientY - rect.top + "px";
  tipEl.style.display = "block";
}

/** 값 배열을 n개 클래스로 나누는 분위수 경계 (오름차순, 마지막은 최대값). */
export function quantileBreaks(values: number[], n: number): number[] {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return new Array(n).fill(0);
  const breaks: number[] = [];
  for (let i = 1; i <= n; i++) {
    const idx = Math.min(sorted.length - 1, Math.floor((i / n) * (sorted.length - 1)));
    breaks.push(sorted[idx]);
  }
  return breaks;
}

function classIndex(v: number, breaks: number[]): number {
  for (let i = 0; i < breaks.length; i++) {
    if (v <= breaks[i]) return i;
  }
  return breaks.length - 1;
}

export function fmt(n: number): string {
  if (n >= 1e8) return (n / 1e8).toFixed(1) + "억";
  if (n >= 1e4) return (n / 1e4).toFixed(1) + "만";
  return Math.round(n).toLocaleString();
}

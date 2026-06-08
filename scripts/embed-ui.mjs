// 빌드 후 dist/mcp-app.html 을 읽어 src/ui-html.ts 모듈로 임베드한다.
// 서버리스(Vercel)에서 런타임 파일 읽기가 불안정하므로, UI를 코드에 문자열로 박는다.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, "dist", "mcp-app.html"), "utf-8");
const out = `// 자동 생성 파일 — 직접 수정 금지. (scripts/embed-ui.mjs 가 dist/mcp-app.html 에서 생성)
export const UI_HTML = ${JSON.stringify(html)};
`;
writeFileSync(join(root, "src", "ui-html.ts"), out, "utf-8");
console.log(`embed-ui: src/ui-html.ts 생성 (${html.length} chars)`);

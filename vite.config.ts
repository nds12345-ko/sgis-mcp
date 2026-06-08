import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// UI(mcp-app.html + src/mcp-app.ts)를 단일 HTML 파일로 번들한다.
// 샌드박스 iframe의 deny-by-default CSP를 충족시키기 위해 모든 JS/CSS를 HTML에 인라인한다.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: process.env.INPUT,
    },
  },
});

# SGIS 통계지도 MCP App

Claude(또는 MCP Apps 지원 호스트)에서 **"한국 인구지도 보여줘"** 같은 질문을 하면,
오른쪽 패널에 **시도(17개) 단계구분도**가 렌더링되는 MCP Apps 서버입니다.

```
사용자 질문 → Claude가 도구 호출 → 오른쪽 패널에 지도 UI(iframe)
   → UI가 MCP 도구 호출(postMessage) → 서버가 SGIS API 호출 → 지도 채색
```

보안Key(consumer_secret)는 **서버(.env)에만** 존재하며 브라우저에 노출되지 않습니다.

## 구성

| 파일 | 역할 |
|------|------|
| `server.ts` | MCP 서버: `show_korea_statmap`/`sgis_get_map_data` 도구 + UI 리소스 + Express `/mcp` |
| `src/sgis.ts` | 서버측 SGIS 클라이언트 (토큰 캐시·경계·통계) |
| `mcp-app.html`, `src/mcp-app.ts` | iframe UI (드롭다운 + SVG 단계구분도 + 범례 + 툴팁) |
| `dist/mcp-app.html` | Vite로 번들된 단일 HTML (빌드 산출물) |

## 1. 설치 & 키 입력

```powershell
cd C:\Users\user\sgis-statmap
npm install
Copy-Item .env.example .env   # 그리고 .env 에 SGIS 서비스ID/보안Key 입력
```

## 2. 빌드 & 실행

```powershell
npm run build   # UI를 dist/mcp-app.html 로 번들
npm run serve   # http://localhost:3001/mcp 기동
```

## 3. 로컬 테스트 (터널·유료플랜 불필요)

`ext-apps`의 basic-host로 iframe UI까지 완전 로컬 확인:

```powershell
git clone https://github.com/modelcontextprotocol/ext-apps.git
cd ext-apps\examples\basic-host
npm install
$env:SERVERS='["http://localhost:3001/mcp"]'; npm start
# http://localhost:8080 접속 → show_korea_statmap 호출 → 지도 렌더 확인
```

## 4. 실제 Claude에서 보기

- **방법 A — 터널:** `npx cloudflared tunnel --url http://localhost:3001` 로 공개 URL 생성 후
  Claude 설정 → 커넥터 → 커스텀 커넥터로 `<공개URL>/mcp` 등록 (유료플랜 필요).
- **방법 B — Vercel 배포:** 이 저장소를 Vercel에 연결 → 환경변수 `SGIS_SERVICE_ID`,
  `SGIS_SECURITY_KEY` 설정 → 배포 URL `https://<app>.vercel.app/mcp` 를 커스텀 커넥터로 등록.

## 통계 종류

드롭다운에서 선택: **인구(총인구) / 가구(가구 수) / 주택(주택 수)**, 연도 2000~2020.

> SGIS `stats/population.json`(low_search=1) 한 응답에 시도별 인구·가구·주택 수가 모두 들어있다.
> `src/sgis.ts`의 `STAT_TYPES`가 필드를 매핑한다: 인구=`tot_ppltn`, 가구=`tot_family`, 주택=`tot_house`.
> (실측 확인됨 — 2020년 기준 17개 시도 정상 반환)

## 로컬 미리보기 (MCP 호스트 없이 렌더만 확인)

서버 도구 없이 지도 렌더링만 빠르게 보려면:

```powershell
npm run serve   # 다른 터미널에서 켜둔 뒤, 아래로 페이로드 1회 생성
# preview-payload.json 생성: sgis_get_map_data 결과의 structuredContent 저장 (README 하단 참고)
npm run preview:ui   # http://localhost:5173/preview.html
```

`preview.html` + `src/preview.ts`는 저장된 `preview-payload.json`을 읽어 `src/render.ts`로 그린다.
실제 MCP 통합 테스트는 위 **3. 로컬 테스트(basic-host)** 를 사용한다.

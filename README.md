# SEO Creator

YouTube / YouTube Music 플레이리스트의 **SEO 최적화 제목 + 썸네일 컨셉** 을 한 번에 만들어 주는 데스크톱 앱.
**Electron + Node.js 단일 엔진** — Python 백엔드, 외부 서버, 추가 API 키 없이 모든 로직이 로컬에서 동작합니다.

> v2.1 부터 Python/FastAPI 백엔드는 제거되었습니다. 이전의 `localhost:8000` fetch fallback도 더 이상 존재하지 않습니다.

---

## 핵심 기능

| 영역 | 내용 |
|---|---|
| 입력 | URL(공개 재생목록) · 수동(장르/분위기/상황) |
| 결과 | 3종 세트 — **감성형 / 검색형 / 롱테일형** (각 YT Music 짧은 제목 + YT Playlist 긴 제목) |
| 점수 | 세트별 7-항목 SEO 점수 (intent / coverage / clickability / tag / thumbnail / competition / diversity) |
| 썸네일 | 메인·보조 키워드, 컬러톤, 레이아웃, 폰트 느낌, 피해야 할 요소, Unsplash/Pexels 검색 키워드 |
| 설명 | 자동 description / tags / hashtags 생성 (한·영 혼합) |
| 재생성 | 전체 / 세트 단위 / 제목만 / 썸네일만 / 태그만 |
| 히스토리 | 모든 생성 결과 자동 저장 + 클릭 복원 + 삭제 |
| 즐겨찾기 | ⭐ 토글 + 패널에서 한 번에 복원 |
| 내보내기 | JSON / CSV / TXT — 네이티브 파일 다이얼로그, UTF-8 |
| 결정성 | 같은 입력은 같은 결과 (input hash → seeded RNG) |
| 자가검증 | `npm run test:engine` 으로 회귀 즉시 확인 |

---

## 아키텍처

```
electron/   → main process + preload IPC bridge (21 channels)
engine/     → Node.js SEO 엔진 (외부 의존성 없음)
  data/     → 키워드 사전 (장르 19, 분위기 12, 상황 16)
  util/     → seeded RNG, alias resolver, title validator
frontend/   → Next.js 14 + Tailwind + lucide-react (static export)
scripts/    → dev.sh, build.sh, test-engine.js
```

렌더러는 `window.electronAPI`(preload가 노출하는 19개 메소드)만 호출합니다. 모든 IPC envelope은 `{ ok: true, data } | { ok: false, error }` 형태로 정규화됩니다 (`engine:health`만 호환 사유로 raw 객체).

---

## 사전 요구사항

- **Node.js 18+**
- macOS 또는 Windows (Linux AppImage도 빌드 가능)
- **Python 불필요** · **별도 백엔드 서버 없음**

---

## 빠른 시작 (개발 모드)

```bash
git clone https://github.com/freemilesarea-boop/SEO-Creator.git
cd SEO-Creator

npm install                # root + frontend 의존성 동시 설치 (postinstall로 frontend도 자동)
npm run dev                # Next.js dev server + Electron 동시 실행
```

`scripts/dev.sh` 도 동일한 흐름을 실행합니다 (사전에 `npm run test:engine` 으로 엔진 자가검증).

frontend는 `http://localhost:3000` 에 dev server로 떠 있고, Electron이 그것을 로드한 뒤 모든 데이터 호출은 IPC로 직접 처리합니다.

---

## 패키징 (배포용)

```bash
npm run build:mac     # macOS .dmg (x64 + arm64)
npm run build:win     # Windows NSIS installer (x64)
npm run build:linux   # AppImage
npm run build:app     # 현재 플랫폼 자동 감지
```

`./scripts/build.sh [mac|win|linux|all]` 도 가능. 빌드 직전 자동으로 `node scripts/test-engine.js` 가 실행되어 엔진 회귀 여부를 확인합니다.

빌드 산출물은 `dist-app/` 아래에 생성됩니다.

### macOS / Windows 빌드 주의사항

- **현재 기본 타깃**: macOS `dmg`, Windows `nsis`. Linux `AppImage`.
- **macOS 코드 서명**: `package.json` 의 `build.mac.identity` 가 `null` 로 되어 있어 자체 서명을 시도하지 않습니다. 서명되지 않은 `.dmg` 는 Gatekeeper 가 막을 수 있습니다 — 배포 시 자체 인증서로 서명하거나, 사용자에게 "이 앱 열기 허용" 안내가 필요합니다.
- **Windows SmartScreen**: NSIS 인스톨러에 EV 코드 사이닝 인증서가 없으면 SmartScreen 경고가 뜹니다. 서명 또는 사용자 안내가 필요합니다.
- **Windows portable / macOS zip 옵션**: 인스톨러 없이 압축본만 배포하고 싶다면 `package.json` 의 `build.win.target` / `build.mac.target` 에 항목을 추가합니다.

  ```json
  "win": {
    "target": [
      { "target": "nsis", "arch": ["x64"] },
      { "target": "portable", "arch": ["x64"] }
    ]
  },
  "mac": {
    "target": [
      { "target": "dmg", "arch": ["x64", "arm64"] },
      { "target": "zip", "arch": ["x64", "arm64"] }
    ]
  }
  ```

- **Python 바이너리 번들 없음**: 이전 버전(2.0.x)에서 PyInstaller 로 묶던 `seo-backend` 바이너리는 v2.1 부터 사라졌습니다. 빌드 산출물 용량이 크게 감소합니다.

---

## 자가검증 (Self-check)

```bash
npm run test:engine
```

- 16 섹션 / 74 assertions
- 외부 패키지 / 네트워크 의존성 없음 (Node stdlib only)
- 임시 디렉토리 사용 + 자동 정리
- 실패 시 `process.exit(1)` — CI 친화적

회귀 영역: healthCheck / generate / 3-set 차별화 / per-set score / descriptionPack / thumbnail v2 fields / regenerate(set/title/thumbnail/tags/all) / favorites lifecycle / history list-detail-remove / exports(JSON/CSV/TXT) / determinism / invalid input handling.

---

## 데이터 저장 위치

| OS | 경로 |
|---|---|
| macOS | `~/Library/Application Support/SEO Creator/` |
| Windows | `%APPDATA%/SEO Creator/` |
| Linux | `~/.config/SEO Creator/` |

각 위치에 다음이 저장됩니다:

- `history/<id>.json` — 생성 결과 (atomic write)
- `favorites.json` — 즐겨찾기 (단일 파일)

**손상된 파일은 자동 격리**: JSON 파싱이 실패하면 `<file>.corrupt-<ts>` 로 이름이 바뀌고 빈 상태로 복구됩니다. 다음 실행을 막지 않습니다.

---

## 폴더 구조

```
SEO-Creator/
├── electron/
│   ├── main.js               # IPC dispatcher (21 channels, 비즈니스 로직 없음)
│   └── preload.js            # window.electronAPI bridge (camelCase only)
├── engine/
│   ├── index.js              # 공개 API (22 exports)
│   ├── data/                 # 키워드 사전 (19 장르 / 12 무드 / 16 상황)
│   ├── history-store.js      # atomic write + corruption recovery
│   ├── favorites-store.js
│   ├── exporter.js           # JSON / CSV / TXT 직렬화
│   ├── regenerate.js         # 5종 부분 재생성
│   ├── scoring.js            # 7-항목 per-set 점수
│   ├── description-generator.js
│   ├── thumbnail-generator.js
│   ├── title-generator.js
│   ├── keyword-engine.js
│   ├── intent-classifier.js
│   ├── coherence.js
│   ├── explainer.js
│   ├── playlist-parser.js    # YouTube Innertube + HTML fallback
│   └── util/                 # seeded-random, aliases, validator
├── frontend/
│   └── src/
│       ├── app/page.tsx
│       ├── lib/api.ts        # IPC-only, 단일 컨벤션 (camelCase)
│       └── components/
│           ├── LinkInputForm.tsx
│           ├── ManualInputForm.tsx
│           ├── ResultsView.tsx       # ⭐ 즐겨찾기 + Export 버튼
│           ├── ResultCard.tsx        # per-set 점수 + 액션 버튼
│           ├── HistoryPanel.tsx
│           └── FavoritesPanel.tsx
└── scripts/
    ├── dev.sh
    ├── build.sh
    └── test-engine.js        # CI 친화적 자가검증
```

---

## 기술 스택

- **데스크톱**: Electron 33
- **프론트엔드**: Next.js 14 · React 18 · Tailwind CSS · TypeScript
- **엔진**: Node.js (외부 의존성 없음)
- **패키징**: electron-builder (dmg / nsis / AppImage)

---

## 라이선스

MIT

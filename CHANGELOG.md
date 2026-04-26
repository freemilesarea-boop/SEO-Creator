# Changelog

이 프로젝트는 [Keep a Changelog](https://keepachangelog.com/) 형식과
[Semantic Versioning](https://semver.org/) 을 따릅니다.

---

## [2.1.0] — 2026-04-26

데스크톱 배포 안정화 + 결과 품질 개선 릴리즈.
구매자가 같은 입력으로 같은 결과를 받고, 패키징된 macOS / Windows 앱에서
모든 기능이 외부 의존 없이 동작하도록 재정비한 메이저 정비 릴리즈입니다.

### Added

- **세트별 SEO 점수**: 감성형 / 검색형 / 롱테일형이 서로 다른 점수를 받는다.
  7-항목 가중합 (`intentFit 25 / keywordCoverage 20 / titleClickability 20 /
  tagQuality 15 / thumbnailRelevance 10 / competitionBonus 5 / diversityBonus 5`).
- **부분 재생성 5종**: 카드별 `제목`, `썸네일`, `태그/설명`, `세트 전체` 재생성과
  결과 화면 상단의 `전체 재생성`. `prevResponse` 는 절대 mutate 되지 않으며
  변경 영역 외 필드는 보존된다.
- **결정적 출력**: 동일 입력 → 동일 제목 + 동일 썸네일.
  내부적으로 `hashSeed(input)` 으로 만든 uint32 seed 를 mulberry32 PRNG 에 주입.
  다른 결과를 원하면 재생성 버튼이 새 `seedSalt` 를 발급한다.
- **즐겨찾기**: 결과 화면 ⭐ 토글 + 입력 화면 `FavoritesPanel`.
  payload 에 `GenerationResponse` 전체를 담아 한 클릭 복원 가능.
- **히스토리 패널**: 입력 화면 `HistoryPanel` — 항목 클릭 시 결과 즉시 복원,
  휴지통으로 단건 삭제. 로컬 JSON 파일 기반.
- **Export**: 결과 화면에서 `JSON / CSV / TXT` 를 한 번에 저장.
  네이티브 파일 다이얼로그 사용, UTF-8 인코딩.
  사용자 취소 시 에러가 아닌 `{ cancelled: true }` 로 응답.
- **풍부한 썸네일 컨셉**: `fontFeel`, `avoidList`, `photoSearchKeywords`
  (Unsplash/Pexels 검색어), `composition` 필드 추가.
- **자동 description / tags / hashtags**: 세트별 본문 + 다국어 태그 + 해시태그를
  생성해 description pack 으로 노출.
- **엔진 자가검증**: `npm run test:engine` — 16 섹션 / 74 assertions,
  외부 패키지 / 네트워크 의존성 없음, 실패 시 `process.exit(1)` 로 CI 게이트 친화적.
- **사전 확장**: 장르 4종 (`edm`, `latin`, `jpop`, `ost`) + 상황 4종 (`cooking`,
  `reading`, `commute`, `walk`) 신규 추가.
  `genre_aliases` (`electronic→edm`, `citypop→jpop`, `ambient→lofi`) 와
  `situation_aliases` (`late_night→night_drive` 등) 로 호환.
- **타이틀 검증기**: 길이 / 단어 중복 / banned-word / spam / 한·영 혼용 정리.

### Changed

- **단일 엔진 아키텍처**: 모든 SEO 로직이 `engine/` Node 모듈로 이전.
  Electron main 이 IPC 로 직접 호출. 파사드 `engine/index.js` 는
  history / favorites / regenerate / scoring / exporter helper 들에 위임만 한다.
- **세트 차별화 강화**:
  - 감성형 — mood 중심, 검색어 색깔 약하게, 부드러운 만연체.
  - 검색형 — discovery + utility 중심, genre/situation/playlist 키워드 명확.
  - 롱테일형 — situation context + mood + genre 조합, genre-anchor + ≥2 specificity 게이트.
- **API surface (camelCase only)**: `frontend/src/lib/api.ts` 가 19개 IPC
  메소드를 단일 컨벤션으로 노출. envelope `{ ok, data | error }` 통일.
- **electron-builder files spec**: `engine/data/**/*.json` 이 패키지에
  포함되도록 갱신. `backend/` 경로 참조 제거.
- **scripts/dev.sh, scripts/build.sh**: Python / PyInstaller / uvicorn /
  포트 대기 흐름 제거, Node-only 로 단순화. 빌드 전 자가검증 자동 실행.
- **package.json**: `wait-on`, `cross-env` devDep 추가; `test:engine` 스크립트 추가.
  버전 `2.0.0 → 2.1.0`.

### Fixed

- **`regenerate(generationId)` placeholder 결함**: 항상 `pop / chill / cafe`
  결과로 떨어지던 문제. 새 `regenerateAll / Set / Title / Thumbnail / Tags`
  가 직전 응답을 정확히 재사용한다.
- **enum / 사전 키 불일치**: `edm`, `latin`, `jpop`, `ost` 선택 시 키워드
  풀이 비던 문제 해결 — 사전에 4종 신규 등록 + alias 맵 추가.
- **상황 키 누락**: `cooking`, `reading`, `commute`, `walk` 가 사전에 없던 문제 해결.
- **세트 SEO 점수 동일 표시 (P5)**: 모든 세트가 `상위 5 키워드 평균 × 100`
  으로 같은 값이던 결함 — 세트별 다른 점수 계산으로 교체.
- **썸네일 비결정성 (P6)**: `random.choice` 사용으로 동일 입력에도 매번
  layout / overlay 가 달라지던 결함 — input hash 기반 seeded RNG 로 해결.
- **포트 미스매치**: dev.sh 의 `18484` vs frontend 의 `8000` vs settings 의
  `8000` 3중 미스매치 제거 (전부 IPC 사용으로 일원화).
- **CORS / fetch fallback 잔존**: 더 이상 필요 없음 (HTTP 서버 자체가 없음).

### Removed

- **Python 백엔드 전체**: `backend/` 트리 (FastAPI, services, schemas,
  requirements, Dockerfile, PyInstaller spec) 삭제.
- **`docker-compose.yml`**: 웹 서버 모드 제거.
- **`electron/backend-launcher.js`**: 외부 프로세스 spawn 로직 제거.
- **`localhost:8000` fetch fallback**: 렌더러는 IPC 만 사용.
- **camelCase ↔ snake_case 듀얼 헬퍼 (`g(obj, camel, snake, ...)`)**: 단일 컨벤션 통일.
- **PyInstaller 산출물 의존**: 패키지에서 `seo-backend(.exe)` 바이너리 제거 → 앱 용량 감소.

### Architecture / IPC

채널 21개 (모두 main 등록, preload 19개 메소드와 1:1 매핑):

- `engine:health`
- `engine:generateManual`, `engine:generateLink`
- `engine:regenerate:{all, set, title, thumbnail, tags}`
- `engine:favorite:{add, remove, list, has}`
- `engine:getHistory` (legacy alias), `engine:history:{list, get, remove}`
- `engine:export:{json, csv, txt, filename, save}`

응답 envelope: `{ ok: true, data } | { ok: false, error }` 로 정규화.
`engine:health` 만 호환을 위해 raw 객체 그대로 반환.

### Migration notes (v2.0.x → v2.1.0)

- Python 설치 / `pip install` 흐름은 더 이상 필요 없습니다.
  기존 로컬에 `backend/` 디렉토리가 있다면 삭제해도 무방합니다.
- 패키징 산출물에서 `seo-backend` 바이너리가 사라져 앱 용량이 줄어듭니다.
- 사용자 데이터 경로는 그대로 (`<userData>/history/<id>.json`).
- `<userData>/favorites.json` 은 즐겨찾기 첫 사용 시 자동 생성됩니다.
- 손상된 history / favorites 파일은 다음 실행 시 자동 격리됩니다 (앱 부팅을 막지 않음).

---

## [2.0.0] — 이전 (참고)

- Python FastAPI 백엔드 + Node.js Electron 이중 구현이 공존하던 시기.
- 자세한 변경 사항은 git log 참조.

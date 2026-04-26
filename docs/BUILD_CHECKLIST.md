# 빌드 / 배포 체크리스트

SEO Creator 데스크톱 앱을 macOS / Windows 패키징 + 배포 직전에 한 번씩
확인하는 체크리스트입니다. 모든 단계가 통과해야 빌드를 진행하세요.

> 모든 명령은 저장소 루트(`SEO-Creator/`)에서 실행합니다.

---

## 0. 사전 점검 (Pre-flight)

### 의존성

- [ ] **Node.js 18+** 사용 중
  ```bash
  node -v   # v18.x 이상
  npm -v
  ```
- [ ] root + frontend 의존성 설치
  ```bash
  npm install
  ```
  (root `postinstall` 이 frontend도 자동 설치)

### 자가검증

- [ ] **엔진 회귀 테스트**
  ```bash
  npm run test:engine
  ```
  - 기대값: `ALL PASS ✓ (74 assertions)`
  - 실패 시 빌드를 진행하지 말고 원인 수정 후 재실행.

- [ ] **TypeScript 타입 체크**
  ```bash
  cd frontend && npx tsc --noEmit
  ```
  - 0 errors 이어야 함.

- [ ] **프런트엔드 정적 빌드**
  ```bash
  cd frontend && npx next build
  ```
  - `frontend/out/index.html` 생성 확인.
  - 콘솔에 type / lint 경고가 새로 떴는지 검토.

### 안전한 시작 상태

- [ ] `git status` 깨끗한 상태에서 시작.
- [ ] `dist-app/` 가 비어 있거나 이전 산출물만 있는지 확인.
- [ ] `package.json` 의 `version` 이 릴리즈할 버전과 일치하는지 확인.

---

## 1. macOS 빌드

```bash
npm run build:mac
```

`scripts/build.sh mac` 또는 `npx electron-builder --mac` 도 동일.

### 타깃 / 아키텍처

- [ ] 기본 타깃은 **DMG**, x64 + arm64 두 슬라이스.
  - 산출물 예: `dist-app/SEO Creator-2.1.0.dmg`,
    `dist-app/SEO Creator-2.1.0-arm64.dmg`.
- [ ] **ZIP 산출물이 필요하면** `package.json` 의 `build.mac.target` 에
  추가:
  ```json
  "mac": {
    "target": [
      { "target": "dmg", "arch": ["x64", "arm64"] },
      { "target": "zip", "arch": ["x64", "arm64"] }
    ]
  }
  ```
- [ ] arm64 / x64 각각 **Apple Silicon / Intel 머신에서 부팅 확인** (가능하면).
  Apple Silicon 한 대로만 테스트하는 경우 x64 슬라이스는 Rosetta 로 검증.

### Gatekeeper / 코드 사이닝

- [ ] `package.json > build.mac.identity` 가 `null` (자체 서명 안 함)
  인지 확인. 그대로 둘 경우 사용자는 첫 실행 시:
  > "확인되지 않은 개발자가 만든 앱입니다."
  경고를 받음.
- [ ] 배포 시 사용자에게 안내할 회피 방법:
  1. Finder 에서 앱 우클릭 → "열기" → "열기" 재확인.
  2. `시스템 설정 → 개인 정보 보호 및 보안 → 그래도 열기`.
- [ ] 자체 발급 인증서로 서명할 계획이면 `identity` 에 인증서 이름 입력 후
  `npm run build:mac` 재실행. notarization 까지 하려면 별도 워크플로우 필요.

### macOS 산출물 점검

- [ ] DMG 마운트 → 앱을 `Applications` 폴더로 드래그 → 정상 실행.
- [ ] 앱 메뉴바, 윈도우 트래픽 라이트 정상 표시.
- [ ] 다크 모드에서 UI가 깨지지 않음.

---

## 2. Windows 빌드

```bash
npm run build:win
```

`scripts/build.sh win` 또는 `npx electron-builder --win` 도 동일.

### 타깃 / 아키텍처

- [ ] 기본 타깃은 **NSIS installer**, x64.
  - 산출물 예: `dist-app/SEO Creator Setup 2.1.0.exe`.
- [ ] **Portable EXE 가 필요하면** `package.json` 의 `build.win.target` 에 추가:
  ```json
  "win": {
    "target": [
      { "target": "nsis", "arch": ["x64"] },
      { "target": "portable", "arch": ["x64"] }
    ]
  }
  ```
- [ ] **NSIS 만 비활성** (portable 단독 배포 등) 하려면 `nsis` 항목 제거.
  단, 인스톨러 없는 배포는 사용자에게 압축 해제 위치 자유 → 자동 업데이트가
  까다로워짐을 주의.

### SmartScreen / 코드 사이닝

- [ ] EV 코드 사이닝 인증서가 없으면 첫 실행 시 SmartScreen 가 차단.
- [ ] 배포 시 사용자 안내:
  1. "추가 정보" 클릭 → "실행" 으로 우회.
  2. 또는 압축본(portable) 사용.
- [ ] 인증서 보유 시 `signingHashAlgorithms`, `certificateFile`,
  `certificatePassword` 환경변수 / 옵션 사용 (electron-builder 문서 참조).

### Windows 산출물 점검

- [ ] NSIS 인스톨러 실행 → 설치 → 시작 메뉴 / 바탕화면 바로가기 생성 확인.
- [ ] 앱 첫 실행 시 정상 부팅 + 창 표시.
- [ ] 제거(Add/Remove Programs) 정상.

---

## 3. 배포 전 기능 확인 (Smoke Test)

빌드된 앱을 실행한 뒤 다음 시나리오를 손으로 한 번씩 통과하세요.

### 기본 생성

- [ ] **Manual 생성** 정상
  - 장르: K-Pop, 분위기: Energetic, 상황: Workout, 언어: ko
  - 결과 화면이 뜨고 3 세트가 모두 다른 점수로 채워짐.
  - 각 카드에 썸네일 컨셉, 폰트 느낌, 피해야 할 요소, 사진 검색 키워드 표시.
  - description / tags / hashtags 패널이 채워져 있음.
- [ ] **Link 생성** 정상
  - 공개 YouTube/YouTube Music 재생목록 URL 입력.
  - 분석이 정상 완료되고 3 세트가 표시됨.
  - URL 형식 오류 시 친절한 에러 토스트.

### 결정성

- [ ] 같은 입력으로 두 번 Manual 생성 → 결과 카드의 제목과 썸네일이 동일.
  (`generationId` 만 random.)

### 부분 / 전체 재생성

- [ ] 카드 footer **제목** 버튼 → 해당 카드의 제목만 바뀌고 썸네일/태그는 보존.
- [ ] **썸네일** 버튼 → 썸네일 컨셉만 바뀌고 제목/태그는 보존.
- [ ] **태그/설명** 버튼 → description/tags/hashtags 만 갱신.
- [ ] **세트 전체** 버튼 → 해당 세트만 모두 새로.
- [ ] 결과 상단 **재생성** 버튼 → 3 세트 모두 새로 생성.

### 즐겨찾기

- [ ] 결과 화면 **⭐ 즐겨찾기** 토글 → "즐겨찾기됨" 상태로 변경.
- [ ] 새로 만들기 → 입력 화면 **즐겨찾기 패널** 에 항목 노출.
- [ ] 항목 클릭 → 결과 화면이 동일하게 복원.
- [ ] 휴지통 → 즐겨찾기에서 즉시 제거.

### 히스토리

- [ ] 입력 화면 **최근 히스토리** 패널에 직전 생성이 노출.
- [ ] 항목 클릭 → 결과 즉시 복원.
- [ ] 휴지통 → 항목 삭제 (확인 후 패널 갱신).

### Export

- [ ] 결과 화면 우상단 **JSON / CSV / TXT** 버튼 각각 클릭.
- [ ] 네이티브 저장 다이얼로그가 뜸. 기본 파일명에 `seo-creator-<id>-<iso>.<ext>`.
- [ ] 저장 후 토스트 `"<FORMAT>로 저장되었습니다"`.
- [ ] 다이얼로그 취소 시 토스트 `"저장이 취소되었습니다"` (에러 아님).
- [ ] 저장된 파일 내용 확인:
  - JSON 파싱 가능 + `generationId` 포함.
  - CSV 헤더 + 3 행, UTF-8 (한글 정상).
  - TXT 사람이 읽기 좋은 다중 섹션.

### 카드 복사

- [ ] 카드 footer **카드 복사** → 클립보드에 다중 라인 텍스트가 들어감.
- [ ] 다른 앱에 붙여넣어 한글 깨짐 없는지 확인.

### Footer

- [ ] Footer 에 `v2.1.0` 가 표시됨 (또는 현재 패키지 버전).

---

## 4. 실패 시 확인할 로그 포인트

### 앱이 부팅 안 됨 / 흰 화면

- 개발자 도구: macOS 메뉴 → View → Toggle Developer Tools (또는
  Win/Linux 단축키 `Ctrl+Shift+I`).
- 콘솔에 IPC / contextBridge 관련 에러가 있는지.
- userData 경로:
  - macOS: `~/Library/Application Support/SEO Creator/`
  - Windows: `%APPDATA%/SEO Creator/`
  - Linux: `~/.config/SEO Creator/`

### 결과가 비어 있음 / 오류 메시지만 표시

- 결과 화면 우상단 토스트의 에러 문구 확인.
- 같은 입력을 `npm run dev` 모드에서 재현하여 dev tools 콘솔 확인.
- `npm run test:engine` 으로 엔진 자체가 정상인지 먼저 확인.

### 히스토리 / 즐겨찾기가 비어 있거나 안 열림

- userData 경로 확인 (위).
- `history/` 폴더 안에 `*.json.corrupt-<ts>` 파일이 있는지 — 손상 격리 흔적.
- `favorites.json.corrupt-<ts>` 도 동일하게 자동 격리됨.
- 격리된 파일은 안전하게 다른 위치로 옮겨두고 다시 사용해도 됨.

### Export 저장 실패

- 다이얼로그가 안 뜨면 main process 로그 확인 (개발 모드: 터미널, 패키지 모드:
  플랫폼별 로그 위치).
- 파일 시스템 권한 (예: `~/` 가 잠겨있는 환경, OneDrive 동기화 폴더 등) 확인.

### macOS Gatekeeper / Windows SmartScreen 차단

- 코드 사이닝 / Notarization 항목 (위 1·2 절) 다시 확인.
- 사용자가 권한 우회를 따랐는지 안내 문서 점검.

### 패키징 시 산출물 누락

- `dist-app/` 가 비어 있다면 `npm run build:frontend` 가 먼저 실행됐는지 확인
  (`frontend/out/index.html` 존재 여부).
- electron-builder `files` 글로브가 `engine/data/**/*.json` 을 포함하는지 확인.

---

## 5. 릴리즈 후 (Post-release)

- [ ] `CHANGELOG.md` 에 신규 버전 섹션 추가.
- [ ] `package.json` 의 `version` 을 다음 사이클로 bump.
- [ ] git tag 생성 (예: `v2.1.0`) 및 push.
- [ ] 다음 릴리즈 진행 전 이 체크리스트를 처음부터 다시 실행.

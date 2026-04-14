# SEO Creator - 플레이리스트 이름 SEO · 썸네일 생성기

YouTube Music 재생목록 제목, YouTube Playlist 제목, 썸네일 키워드를 자동 생성하는 **데스크톱 앱**입니다.

## 핵심 기능

- **링크 기반 자동 생성**: YouTube/YouTube Music 재생목록 URL을 입력하면 곡 분석 후 자동으로 SEO 최적화 결과 생성
- **수동 입력 기반 생성**: 장르, 분위기, 상황을 직접 선택하여 결과 생성
- **3종 결과 출력**: YouTube Music 제목 (짧은 형태) + YouTube Playlist 제목 (긴 형태) + 썸네일 컨셉
- **3세트 추천**: 감성형, 검색형, 클릭형 등 다양한 스타일 동시 제안
- **SEO 점수 산정**: 키워드 관련성, 검색 의도, 스팸 위험도 기반 점수화
- **재생성**: 마음에 안 들면 버튼 하나로 새로운 조합 생성
- **데스크톱 앱**: Electron 기반, 브라우저 없이 독립 실행

## 폴더 구조

```
SEO-Creator/
├── electron/
│   ├── main.js               # Electron 메인 프로세스
│   ├── preload.js             # 프리로드 (contextBridge)
│   └── backend-launcher.js    # FastAPI 자동 실행/관리
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI 진입점
│   │   ├── api/routes.py      # API 엔드포인트
│   │   ├── models/            # Pydantic 모델 + DB
│   │   ├── services/          # 핵심 서비스 모듈
│   │   └── data/              # 키워드 사전 (JSON)
│   └── requirements.txt
├── frontend/
│   ├── src/                   # Next.js 컴포넌트
│   ├── out/                   # static export 결과 (빌드 후)
│   └── package.json
├── scripts/
│   ├── dev.sh                 # 개발 모드 실행
│   └── build.sh               # 앱 패키징
├── assets/                    # 앱 아이콘 (icon.icns, icon.ico)
├── package.json               # Electron + electron-builder 설정
└── docker-compose.yml         # 웹 서버 모드 (선택)
```

## 사전 요구사항

- **Node.js 18+**
- **Python 3.11+** (pip 포함)
- macOS 또는 Windows

## 빠른 시작 (개발 모드)

```bash
# 1. 클론
git clone https://github.com/freemilesarea-boop/SEO-Creator.git
cd SEO-Creator

# 2. 의존성 설치
npm install                          # Electron + 루트 의존성
cd frontend && npm install && cd ..  # 프론트엔드 의존성
pip install -r backend/requirements.txt  # 백엔드 의존성

# 3. 실행
./scripts/dev.sh
```

이 한 줄이면 백엔드 + 프론트엔드 + Electron 앱이 동시에 뜹니다.

## 앱 패키징 (배포용)

### macOS (.dmg)

```bash
./scripts/build.sh mac
```

결과: `dist-app/SEO Creator-*.dmg`

### Windows (.exe)

```bash
./scripts/build.sh win
```

결과: `dist-app/SEO Creator Setup *.exe`

### 현재 플랫폼 자동 감지

```bash
./scripts/build.sh
```

### npm 스크립트로도 가능

```bash
npm run build:mac    # macOS
npm run build:win    # Windows
npm run build:app    # 현재 플랫폼
```

## 개별 실행 (수동)

### 백엔드만 실행

```bash
cd backend
pip install -r requirements.txt
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 18484 --reload
```

### 프론트엔드만 실행 (브라우저 모드)

```bash
cd frontend
npm install
npm run dev
```

브라우저에서 http://localhost:3000 접속

### Electron만 실행 (백엔드가 이미 실행 중일 때)

```bash
ELECTRON_DEV=true npx electron .
```

## .env 설정

```bash
cp .env.example .env
```

| 변수 | 설명 | 기본값 | 필수 |
|------|------|--------|------|
| `YOUTUBE_API_KEY` | YouTube Data API 키 | - | 아니오 |
| `UNSPLASH_API_KEY` | Unsplash API 키 (향후) | - | 아니오 |

## API 엔드포인트

앱 내부에서 `http://127.0.0.1:18484` 로 통신합니다.

### 수동 입력 모드

```bash
curl -X POST http://127.0.0.1:18484/api/v1/generate/manual \
  -H 'Content-Type: application/json' \
  -d '{"genre":"lofi","mood":"chill","situation":"study","language":"ko"}'
```

### 링크 기반 모드

```bash
curl -X POST http://127.0.0.1:18484/api/v1/generate/link \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.youtube.com/playlist?list=PLxxxxx","language":"ko"}'
```

### 재생성

```bash
curl -X POST http://127.0.0.1:18484/api/v1/generate/regenerate/{generation_id}
```

## 앱 아이콘 설정

`assets/` 폴더에 아이콘 파일을 넣으면 패키징 시 자동 적용됩니다:

- macOS: `assets/icon.icns` (1024x1024)
- Windows: `assets/icon.ico` (256x256)
- PNG: `assets/icon.png` (512x512, 범용)

## 문제 발생 시 체크리스트

| 증상 | 확인 사항 |
|------|----------|
| 앱이 안 뜸 | Python 3.11+ 설치 확인, `pip install -r backend/requirements.txt` |
| 빈 화면 | 백엔드가 18484 포트에서 실행 중인지 확인 |
| 링크 모드 오류 | 재생목록 URL이 공개 상태인지 확인 |
| 패키징 실패 | `npm install` 후 `frontend/out/index.html` 존재 확인 |
| 포트 충돌 | 18484 포트를 다른 앱이 사용 중인지 확인 |

## 기술 스택

- **데스크톱**: Electron 33
- **프론트엔드**: Next.js 14, React 18, Tailwind CSS, TypeScript
- **백엔드**: Python, FastAPI, yt-dlp
- **패키징**: electron-builder
- **DB**: SQLite (앱 내장)

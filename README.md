# SEO Creator - 플레이리스트 이름 SEO · 썸네일 생성기

YouTube Music 재생목록 제목, YouTube Playlist 제목, 썸네일 키워드를 자동 생성하는 SEO 최적화 도구입니다.

## 핵심 기능

- **링크 기반 자동 생성**: YouTube/YouTube Music 재생목록 URL을 입력하면 곡 분석 후 자동으로 SEO 최적화 결과 생성
- **수동 입력 기반 생성**: 장르, 분위기, 상황을 직접 선택하여 결과 생성
- **3종 결과 출력**: YouTube Music 제목 (짧은 형태) + YouTube Playlist 제목 (긴 형태) + 썸네일 컨셉
- **3세트 추천**: 감성형, 검색형, 클릭형 등 다양한 스타일 동시 제안
- **SEO 점수 산정**: 키워드 관련성, 검색 의도, 스팸 위험도 기반 점수화
- **재생성**: 마음에 안 들면 버튼 하나로 새로운 조합 생성

## 폴더 구조

```
SEO-Creator/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI 진입점
│   │   ├── config.py               # 환경 설정
│   │   ├── api/
│   │   │   └── routes.py           # API 엔드포인트
│   │   ├── models/
│   │   │   ├── schemas.py          # Pydantic 모델
│   │   │   └── database.py         # SQLAlchemy 비동기 DB
│   │   ├── services/
│   │   │   ├── playlist_parser.py  # YouTube 재생목록 파싱 (yt-dlp)
│   │   │   ├── metadata_analyzer.py# 곡 메타데이터 분석
│   │   │   ├── keyword_engine.py   # SEO 키워드 수집/점수화
│   │   │   ├── title_generator.py  # 제목 생성 엔진
│   │   │   └── thumbnail_generator.py # 썸네일 키워드 생성
│   │   └── data/
│   │       ├── keyword_dictionary.json          # 최종 병합 사전
│   │       ├── keyword_dictionary_genres.json    # 15개 장르 데이터
│   │       ├── keyword_dictionary_moods.json     # 12개 분위기 데이터
│   │       ├── keyword_dictionary_situations.json# 12개 상황 데이터
│   │       ├── keyword_dictionary_visuals.json   # 비주얼/레이아웃 데이터
│   │       ├── keyword_dictionary_core.json      # 아티스트맵/템플릿/금지어
│   │       └── build_dictionary.py               # 사전 병합 스크립트
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx            # 메인 페이지
│   │   │   ├── layout.tsx          # 루트 레이아웃
│   │   │   └── globals.css         # 글로벌 스타일
│   │   ├── components/
│   │   │   ├── LinkInputForm.tsx   # 링크 입력 폼
│   │   │   ├── ManualInputForm.tsx # 수동 입력 폼
│   │   │   ├── ResultCard.tsx      # 결과 카드
│   │   │   └── ResultsView.tsx     # 결과 전체 뷰
│   │   └── lib/
│   │       └── api.ts              # API 클라이언트
│   ├── package.json
│   ├── tailwind.config.ts
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

## 로컬 실행 방법

### 사전 요구사항

- Python 3.11+
- Node.js 18+
- (선택) YouTube Data API 키 - 링크 기반 모드에서 yt-dlp가 기본 사용되므로 필수는 아님

### 1. 백엔드 실행

```bash
# 의존성 설치
cd backend
pip install -r requirements.txt

# 서버 실행 (프로젝트 루트에서)
cd ..
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

서버가 http://localhost:8000 에서 실행됩니다.
API 문서: http://localhost:8000/docs

### 2. 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

프론트엔드가 http://localhost:3000 에서 실행됩니다.

## Docker 실행 방법

```bash
# (선택) .env 파일 생성
cp .env.example .env

# 빌드 및 실행
docker compose up --build

# 백그라운드 실행
docker compose up --build -d
```

- 프론트엔드: http://localhost:3000
- 백엔드 API: http://localhost:8000
- API 문서: http://localhost:8000/docs

## .env 설정

```bash
# .env.example 참고
cp .env.example .env
```

| 변수 | 설명 | 기본값 | 필수 |
|------|------|--------|------|
| `YOUTUBE_API_KEY` | YouTube Data API 키 | - | 아니오 (yt-dlp 사용) |
| `UNSPLASH_API_KEY` | Unsplash API 키 (향후 확장용) | - | 아니오 |
| `BACKEND_PORT` | 백엔드 포트 | 8000 | 아니오 |
| `FRONTEND_PORT` | 프론트엔드 포트 | 3000 | 아니오 |
| `DATABASE_URL` | DB 경로 | sqlite:///./seo_creator.db | 아니오 |

## API 엔드포인트

### 헬스체크

```bash
curl http://localhost:8000/api/v1/health
```

### 수동 입력 모드

```bash
curl -X POST http://localhost:8000/api/v1/generate/manual \
  -H 'Content-Type: application/json' \
  -d '{
    "genre": "lofi",
    "mood": "chill",
    "situation": "study",
    "language": "ko"
  }'
```

**응답 예시 (요약):**
```json
{
  "analysis": {
    "primary_genre": "lofi",
    "primary_mood": "chill",
    "primary_situation": "study"
  },
  "keyword_scores": [
    { "keyword": "로파이 비트", "total_score": 0.53 }
  ],
  "results": [
    {
      "set_label": "감성형",
      "yt_music_title": "공부 차분한 로파이",
      "yt_playlist_title": "공부할 때 듣기 좋은 차분한 로파이 플레이리스트",
      "thumbnail": {
        "main_keywords": ["study", "chill", "lofi"],
        "color_tone": ["warm beige", "soft brown"],
        "layout": "center portrait + bold serif title",
        "text_overlay": "차분한 Playlist"
      },
      "seo_score": 72.5
    }
  ],
  "generation_id": "a1b2c3d4"
}
```

### 링크 기반 모드

```bash
curl -X POST http://localhost:8000/api/v1/generate/link \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf",
    "language": "ko"
  }'
```

**보정 옵션 포함:**
```bash
curl -X POST http://localhost:8000/api/v1/generate/link \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf",
    "language": "ko",
    "override_genre": "lofi",
    "override_mood": "chill",
    "exclude_keywords": ["playlist", "music"]
  }'
```

### 재생성

```bash
curl -X POST http://localhost:8000/api/v1/generate/regenerate/a1b2c3d4
```

### 히스토리 조회

```bash
curl http://localhost:8000/api/v1/history?limit=10
```

## 지원 옵션

### 장르 (15종)
kpop, pop, rnb, hiphop, lofi, jazz, rock, edm, classical, indie, ballad, acoustic, latin, jpop, ost

### 분위기 (12종)
chill, emotional, energetic, dreamy, sexy, happy, sad, dark, romantic, nostalgic, peaceful, intense

### 상황 (12종)
study, night_drive, workout, cafe, sleep, morning, rain, commute, party, cooking, reading, walk

### 언어
ko (한국어), en (영어), mixed (혼합)

## 키워드 사전 수정

키워드 사전을 수정하려면:

1. `backend/app/data/` 아래의 분할 JSON 파일을 수정
2. 병합 스크립트 실행:
```bash
python backend/app/data/build_dictionary.py
```
3. 서버 재시작

## 문제 발생 시 체크리스트

| 증상 | 확인 사항 |
|------|----------|
| 백엔드 시작 안 됨 | Python 3.11+ 설치 확인, `pip install -r requirements.txt` 실행 |
| 프론트엔드 빌드 실패 | Node.js 18+ 확인, `npm install` 실행 |
| 링크 모드 오류 | 재생목록 URL이 공개 상태인지 확인, yt-dlp 설치 확인 |
| 수동 모드 결과 없음 | `keyword_dictionary.json` 존재 확인, `build_dictionary.py` 실행 |
| Docker 실행 안 됨 | Docker 및 Docker Compose 설치 확인, `.env` 파일 유무 확인 |
| CORS 에러 | 백엔드가 localhost:8000에서 실행 중인지 확인 |
| 빈 결과 반환 | 장르/분위기/상황 조합이 올바른 enum 값인지 확인 |

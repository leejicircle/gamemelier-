# 🎮 Gamemelier

> Steam 게임 카탈로그 + 개인화 추천 웹 애플리케이션

Steam의 게임 데이터를 수집·가공하여 게임 탐색, 출시예정작 확인, 위시리스트 저장, 개인화 추천을 제공하는 웹 서비스입니다.

<br/>

## ✨ 주요 기능

| 기능 | 설명 |
|---|---|
| 🏠 **홈** | 추천/인기 게임 캐러셀 |
| 🕹️ **전체 게임** | 장르 필터 + 페이지네이션 게임 목록 |
| 📅 **출시예정** | Coming Soon 게임 모아보기 |
| 🎯 **추천** | 로그인 사용자 대상 개인화 추천 (장르·태그·평판 기반, 신규 유저 온보딩 게임 픽커·취향 칩·추천 이유 배지) |
| 📄 **게임 상세** | 스크린샷·영상 캐러셀, 장르·세부 태그, 가격, 위시리스트, 구매 링크 |
| 👤 **마이페이지** | 저장한 게임 목록, 선호 장르 관리 |
| 🔍 **검색** | 게임 이름 실시간 검색 |
| 🔐 **인증** | Supabase 기반 회원가입/로그인 |

<br/>

## 🛠 기술 스택

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, React 19.2, Turbopack)
- **Language**: TypeScript
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) (`@theme inline`) + [shadcn/ui](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/)
- **Backend / Auth**: [Supabase](https://supabase.com/) (`@supabase/ssr`)
- **Server State**: [TanStack Query](https://tanstack.com/query)
- **Client State**: [Zustand](https://zustand-demo.pmnd.rs/)
- **Carousel**: [Embla Carousel](https://www.embla-carousel.com/)
- **Animation**: [Framer Motion](https://motion.dev/) (`motion`) — 초기진입 인트로 스플래시
- **Data Ingest**: Steam Web API → Supabase (`tsx` CLI 스크립트)

<br/>

## 📁 프로젝트 구조

```
src/
├─ app/                      # App Router 라우트
│  ├─ (user)/                #   로그인 / 회원가입
│  ├─ api/                   #   라우트 핸들러 (search, topsellers)
│  ├─ games/                 #   전체 게임 목록 + [id] 상세
│  ├─ upcoming/              #   출시예정
│  ├─ recommend/             #   개인화 추천
│  ├─ mypage/                #   마이페이지
│  ├─ shared/                #   페이지 공통 컴포넌트 (Nav, Footer, 카드 등)
│  ├─ globals.css            #   Tailwind 토큰 / 커스텀 breakpoint
│  └─ proxy.ts               #   Supabase 세션 갱신 (구 middleware)
├─ components/
│  ├─ ui/                    #   shadcn 베이스 컴포넌트
│  └─ auth/                  #   인증 상태 동기화
├─ lib/
│  ├─ api/                   #   데이터 페칭 함수
│  ├─ hooks/                 #   커스텀 훅
│  ├─ supabase/              #   client / server 환경별 Supabase
│  └─ constants/             #   상수 (장르 카테고리 등)
├─ store/                    # Zustand 스토어
└─ types/                    # 공통 타입

scripts/
├─ ingest-steam.ts           # 기존 게임 데이터 갱신 (UPDATE)
├─ ingest-upcoming.ts        # 출시예정 게임 신규 적재 (INSERT/UPSERT)
├─ ingest-popular.ts         # 인기작(topsellers) 미보유 신규 lean 적재
└─ backfill-tags.ts          # 태그 없는 게임에 SteamSpy 태그 백필 (1회성)
```

<br/>

## 📱 반응형 breakpoint

`globals.css`의 `@theme inline`에 정의된 커스텀 breakpoint를 표준으로 사용합니다 (기본 `sm/md/lg` 대신).

| prefix | 최소 너비 | 대상 |
|---|---|---|
| (기본) | 0px~ | 모바일 |
| `mobile:` | ≥ 360px | 모바일 |
| `tablet:` | ≥ 768px | 태블릿 |
| `desktop:` | ≥ 1440px | 데스크탑 |

<br/>

## 🚀 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

프로젝트 루트에 `.env.local` 파일을 생성합니다.

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 3. 개발 서버 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인할 수 있습니다.

<br/>

## 📜 스크립트

| 명령어 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 실행 (Turbopack) |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 프로덕션 서버 실행 |
| `npm run lint` | ESLint 검사 |

<br/>

## 🔄 데이터 적재 (Ingest)

Steam Web API에서 게임 데이터를 수집해 Supabase에 적재하는 CLI 스크립트입니다. `service_role` 키를 사용하므로 별도 `.env.ingest` 파일로 분리합니다.

```bash
# .env.ingest
INGEST_SUPABASE_URL=your-supabase-url
INGEST_SERVICE_ROLE_KEY=your-service-role-key
```

```bash
# 기존 게임 데이터 갱신
npx tsx --env-file=.env.ingest scripts/ingest-steam.ts

# 출시예정 게임 신규 적재
npx tsx --env-file=.env.ingest scripts/ingest-upcoming.ts

# 인기작 신규 적재
npx tsx --env-file=.env.ingest scripts/ingest-popular.ts

# 태그 백필 (태그 없는 게임만, SteamSpy 전용)
npx tsx --env-file=.env.ingest scripts/backfill-tags.ts
```

선택적 튜닝 환경 변수: `INGEST_LIMIT`, `INGEST_DELAY_MS`, `INGEST_SKIP_FRESH_HOURS`, `INGEST_MAX_CONSECUTIVE_ERRORS`, `INGEST_UPCOMING_COUNT` 등.

<br/>

## 🌿 브랜치 전략

| 브랜치 | 용도 |
|---|---|
| `main` | 배포(프로덕션) 전용 |
| `dev` | 작업 통합 브랜치 |
| `feat/*`, `fix/*`, `chore/*` | 기능/수정 작업 브랜치 → `dev`로 PR |

작업 브랜치 → `dev` PR (자체 코드 리뷰 후 머지) → 릴리스 시 `dev` → `main` PR.

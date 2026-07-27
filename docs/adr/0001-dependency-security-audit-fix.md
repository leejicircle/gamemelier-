# ADR 0001 — 의존성 보안 취약점(npm audit) 대응

- 상태: 채택 (Accepted)
- 날짜: 2026-07-27
- 관련: PR #43, `.github/workflows/security.yml`, `package.json`

## 배경 (문제 상황)

main의 주간 스케줄 보안 워크플로(`security.yml`의 `audit` 잡, `npm audit --audit-level=high`)가
실패했다. 코드 변경 때문이 아니라, 시간이 지나며 **새 CVE/advisory가 공개**되어 기존 의존성이
취약으로 재분류된 것이다.

`npm audit` 결과: **high 6종 + critical 1종**.

| 패키지 | 심각도 | 성격 | 배포 번들 포함? |
| --- | --- | --- | --- |
| `next` (16.2.9) | high ×9 advisory | App Router Server Actions SSRF/DoS, 이미지 최적화 SVG DoS, 캐시 혼동, rewrites SSRF 등 | ✅ 프로덕션 핵심 |
| `sharp` (0.34.5) | high | next 이미지 최적화가 쓰는 libvips CVE 4건 | ✅ 프로덕션(서버) |
| `postcss` (nested 8.4.31) | high | CSS stringify XSS·소스맵 경로 읽기 (빌드타임) | ✅ 직접 의존성 |
| `tar` (7.5.20) | **critical** | node-tar PAX 경로 혼동 등 5건 | ❌ dev (`@tailwindcss/postcss` → oxide) |
| `brace-expansion` | high | ReDoS/OOM | ❌ dev (eslint 툴체인 전용) |
| `js-yaml` | high | YAML merge-key 2차식 CPU 소모 | ❌ dev |

이 앱은 로그인에 **서버 액션**, 카드/hero에 **`/_next/image`(sharp)**, 미들웨어에 **프록시 rewrites**를
쓰므로 Next.js·sharp 계열 advisory는 실질적 위험이 있다. 반면 `brace-expansion`·`js-yaml`·`tar`는
빌드·린트 툴(devDependencies)에서만 나오며 **배포 번들에 실리지 않는다**.

## 검토한 해결 요소

### 1. `npm audit fix` (semver 범위 내 패치 범프)
- semver 범위(`^16.2.7` 등) 안에서만 올림 → **비파괴적**.
- `next 16.2.9 → 16.2.12`로 **Next.js advisory 9건 전부 해소**, `tar`도 패치 버전으로 상승(critical 해소).
- 채택. 프로덕션에 실질 관련된 위험은 대부분 여기서 사라진다.

### 2. `npm audit fix --force`
- 남은 하위 의존성(sharp/postcss/brace-expansion)을 강제로 맞추려 시도.
- **치명적 부작용**: `next`를 **16.2.12 → 9.3.3으로 7개 메이저 다운그레이드**(React 16 시절로) 제안.
  npm이 "취약점 없는 버전"을 과거로 거슬러 찾은 결과. **기각.**

### 3. `overrides`로 취약 하위 의존성 버전 핀 고정
- 상위 패키지(next)가 아직 패치 버전으로 안 올린 하위 의존성을 직접 강제.
- `sharp ^0.35.3`(next가 0.34.5로 핀 → 0.35.3), `postcss $postcss`(직접 의존성을 `^8.5.23`로 올리고
  next 내부 nested 8.4.31도 동일 강제).
- **부분 채택.** sharp·postcss(프로덕션)만 적용.

### 4. `brace-expansion` override → **시도했으나 기각**
- `brace-expansion ^5.0.8`로 override했더니 `npm audit`은 0이 됐지만 **eslint가 깨졌다**
  (`@eslint/config-array`가 옛 `expand()` API 의존 → `TypeError: expand is not a function`, quality 잡 실패).
- brace-expansion은 major(1.x~5.x)마다 API가 갈려 **단일 override로 모든 소비자를 만족시킬 수 없다**.
- 게다가 `brace-expansion`은 프로덕션 의존성에 **0개**(순수 eslint 툴체인) → 배포물 무관.
- override 제거하고 아래 5번으로 처리.

### 5. CI audit 범위를 프로덕션 의존성으로 한정 (`--omit=dev`)
- `npm audit --audit-level=high` → `npm audit --omit=dev --audit-level=high`.
- 배포 번들에 실리는 의존성만 게이트. dev 전용 툴(eslint의 brace-expansion, tar 등)의 취약점은
  **실제 배포물에 없으므로** CI를 막지 않는다.
- 채택. dev 툴 취약점은 로컬 `npm audit`(전체)로 수동 점검.

### (참고) 검토했으나 안 한 것
- CI audit 레벨을 `critical`로 낮추기: high(Next SSRF 등 프로덕션 위험)를 놓치게 되어 기각.
- 취약점 무시 목록(allowlist): npm audit은 표준 무시 기능이 빈약하고 유지보수 부담 → `--omit=dev`가 더 명확.

## 결정

1. **`npm audit fix`**로 next(16.2.12)·tar 등 semver 범위 내 패치 적용.
2. **`overrides`로 `sharp ^0.35.3` + `postcss $postcss`(`^8.5.23`)** 핀 고정 — 프로덕션 관련 하위 의존성.
3. **CI audit을 `--omit=dev`로 한정** — 배포되는 코드에 게이트를 정렬. dev 전용 취약점은 비블로킹.
4. `brace-expansion` override는 **하지 않음**(eslint 파괴 + 프로덕션 무관).

## 근거 요약

- **위험 기반 우선순위**: 실제 배포물(서버 액션·이미지 최적화·프록시)에 닿는 Next.js·sharp·postcss는
  적극 패치, 빌드·린트 전용은 게이트에서 제외.
- **비파괴 우선**: `--force`의 메이저 다운그레이드는 취약점보다 큰 손해 → 최소 범프 + 국소 override.
- **게이트 정렬**: "배포되지 않는 코드의 취약점으로 배포를 막지 않는다"가 `--omit=dev`의 취지.

## 검증

- `npm audit --omit=dev --audit-level=high` → **found 0 vulnerabilities** (exit 0)
- `npm run lint` → 0 errors (eslint 정상 복구)
- `npm run build` → 성공
- **sharp 강제 범프가 이미지 최적화를 깨지 않는지 실측**: 로컬 prod에서 Steam 원격 이미지
  `/_next/image` 변환 전부 200 OK, 카드 렌더 정상 확인.

## 결과 / 후속

- 배포물 대상 취약점 0. dev 전용 취약점(brace-expansion 등)은 상위 패키지(eslint)가
  패치 버전으로 올리면 자연 해소 → 주기적으로 로컬 `npm audit` 확인.
- 롤백: `package.json`/`package-lock.json`/`security.yml`만 변경 → `git revert`로 즉시 복구.

## 용어

- **npm audit / `--audit-level`**: 설치된 의존성의 알려진 취약점을 조회. `high`면 high 이상에서 실패 처리.
- **`--omit=dev`**: 프로덕션 의존성만 대상(빌드·테스트·린트용 devDependencies 제외).
- **overrides**: 의존성 트리 하위(내가 직접 설치하지 않은) 패키지의 버전을 강제 지정하는 npm 기능.
  `"$postcss"`는 "루트 postcss 의존성이 정하는 버전으로 nested도 통일"이라는 자기참조 문법.
- **semver 메이저 범프**: 하위호환이 깨질 수 있는 버전 상승(예: 16.x → 9.x는 역방향 메이저).
- **ReDoS**: 정규식/패턴 확장이 지수 시간이 되어 CPU를 태우는 서비스 거부.
- **SSRF (Server-Side Request Forgery)**: 서버가 공격자가 조작한 목적지로 요청을 보내게 하는 취약점.

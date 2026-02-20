# Discovery-X 부하 테스트 (Artillery)

## 테스트 시나리오

| 파일 | 대상 | 인증 | 목표 |
|------|------|------|------|
| `health.yml` | GET /api/health | 불요 | p95 < 500ms |
| `api-crud.yml` | discoveries, recall, similar-seeds | 필요 | p95 < 1s |
| `chat-stream.yml` | POST /api/chat (SSE) | 필요 | p95 < 3s |
| `spike.yml` | health + discoveries + search | 혼합 | 에러율 < 1% |

## 환경변수

| 변수 | 설명 | 예시 |
|------|------|------|
| `LOAD_TEST_TARGET` | 테스트 타겟 URL | `http://localhost:5173` |
| `LOAD_TEST_COOKIE` | 인증 쿠키 (인증 필요 API용) | `__session=abc123...` |

### 인증 쿠키 얻는 방법

1. 브라우저에서 https://dx.minu.best 로그인
2. DevTools → Application → Cookies → `__session` 값 복사
3. 환경변수 설정: `export LOAD_TEST_COOKIE="__session=복사한값"`

## 실행 방법

### 로컬 (dev 서버)
```bash
# dev 서버 실행 (별도 터미널)
pnpm dev

# 헬스체크 (인증 불요)
LOAD_TEST_TARGET=http://localhost:5173 pnpm load-test

# API 테스트 (인증 필요)
LOAD_TEST_TARGET=http://localhost:5173 \
LOAD_TEST_COOKIE="__session=..." \
pnpm load-test:api
```

### Quick 테스트 (1회만 실행)
```bash
LOAD_TEST_TARGET=http://localhost:5173 \
pnpm exec artillery run --count 1 --num 1 tests/load/health.yml
```

### 프로덕션 (주의: 실제 트래픽 발생)
```bash
# 프로덕션 대상 테스트 시 반드시 팀에 공유 후 실행
LOAD_TEST_TARGET=https://dx.minu.best \
LOAD_TEST_COOKIE="__session=..." \
pnpm load-test:api
```

## 결과 해석

Artillery는 실행 후 아래 지표를 출력합니다:

- **http.response_time**: 응답 시간 분포 (min, max, median, p95, p99)
- **http.requests**: 총 요청 수
- **http.codes.xxx**: HTTP 상태 코드별 카운트
- **vusers.created / completed**: 가상 사용자 생성/완료 수

### 성능 기준

| 지표 | 기준 | 의미 |
|------|------|------|
| p95 < 500ms | health | 인프라 기본 응답성 |
| p95 < 1000ms | API CRUD | 인증+DB 조합 성능 |
| p95 < 3000ms | chat SSE | Agent 응답 (LLM 포함) |
| 에러율 < 1% | spike | 부하 내구성 |

### JSON 리포트 생성
```bash
LOAD_TEST_TARGET=http://localhost:5173 \
pnpm exec artillery run --output report.json tests/load/health.yml

# HTML 리포트 생성
pnpm exec artillery report report.json
```

## CI/CD 통합

`ensure.thresholds`가 설정되어 있으므로, 기준 미달 시 Artillery가 exit code 1을 반환합니다.

```yaml
# GitHub Actions 예시
- name: Load Test (health)
  run: |
    LOAD_TEST_TARGET=${{ secrets.LOAD_TEST_TARGET }} \
    pnpm load-test
```

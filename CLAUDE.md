# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

<!-- TODO: 프로젝트 한줄 설명 -->

## 빌드 및 개발 명령어

```bash
# TODO: 프로젝트에 맞게 수정
npm run dev          # 개발 서버 시작
npm run build        # 프로덕션 빌드
npm run lint         # 린트 검사
npm run test         # 테스트 실행
npm run deploy       # 배포 (프로덕션)
npm run deploy:preview  # 배포 (프리뷰)
```

## 기술 스택

<!-- TODO: 사용하는 기술 나열 -->
- **프레임워크**: <!-- TODO -->
- **언어**: <!-- TODO -->
- **빌드 도구**: <!-- TODO -->
- **스타일링**: <!-- TODO -->
- **상태 관리**: <!-- TODO -->

## 프로젝트 구조

```
src/
├── <!-- TODO: 디렉토리 구조 -->
```

## 코드 컨벤션

<!-- TODO: 프로젝트별 코드 규칙 -->
- **컴포넌트**: <!-- TODO: export 방식, 네이밍 -->
- **상태 관리**: <!-- TODO: 상태 접근 패턴 -->
- **스타일링**: <!-- TODO: 스타일링 패턴 -->
- **테스트**: <!-- TODO: 테스트 프레임워크, 규칙 -->

## 배포

<!-- TODO: 배포 설정 -->
- **호스팅**: <!-- TODO -->
- **프로덕션 URL**: <!-- TODO -->
- **CI/CD**: <!-- TODO -->

## 문서

<!-- TODO: 관련 문서 목록 -->

## SDD (Spec Driven Development) 워크플로우

프로젝트 사양서 `SPEC.md`에 설계/아키텍처/현재 상태를 기록하고, 세션 스킬로 관리한다.

### 스킬

| 스킬 | 용도 |
|------|------|
| `/session-start [작업내용]` | SPEC.md에서 프로젝트 컨텍스트 복원 |
| `/session-end [메모]` | Git 커밋 + SPEC.md 업데이트 |
| `/deploy [--preview]` | CLAUDE.md 참조 기반 배포 |

### SPEC.md 구조

| 섹션 | 내용 | 업데이트 빈도 |
|------|------|-------------|
| §1 Project Overview | 미션, 범위, 성공 기준, 대상 사용자 | 드물게 |
| §2 Product Design | 핵심 워크플로우, UI 요소, 페이지 구성 | 기능 추가 시 |
| §3 Architecture Patterns | 라우팅, 상태관리, 컴포넌트, 데이터 흐름 | 패턴 변경 시 |
| §4 Technical Constraints | 빌드 산출물, 제약사항 | 드물게 |
| §5 Current Status | 현재 단계, 최근 변경, 활성 결정사항 | **매 세션** |
| §6 Implementation Log | 완료 요약, 미래 작업 | 마일스톤 시 |

### 워크플로우 패턴

```bash
# 패턴 1: 빠른 프로토타이핑 (배포 없이)
/session-start 오늘은 새 컴포넌트 구현
→ 작업 수행
/session-end 컴포넌트 구현 완료

# 패턴 2: 배포 포함
/session-end 기능 구현 완료
/deploy

# 패턴 3: 프리뷰 배포
/session-end QA용 변경사항
/deploy --preview
```

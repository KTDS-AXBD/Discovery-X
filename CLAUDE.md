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

## Cline Memory Bank

Cline VS Code 익스텐션을 위한 Memory Bank 파일이 `memory-bank/` 디렉토리에 존재한다.
Cline 전용 규칙은 `.clinerules` 파일을 참조.

### Memory Bank 스킬 (Claude Code ↔ Cline 연동)

Claude Code와 Cline 간 프로젝트 컨텍스트를 공유하기 위한 스킬:

| 스킬 | 용도 |
|------|------|
| `/session-start [작업내용]` | 세션 시작 시 Memory Bank에서 컨텍스트 복원 |
| `/session-end [메모]` | 세션 종료 시 Git 커밋 + Memory Bank 업데이트 (배포 제외) |
| `/deploy [--preview]` | CLAUDE.md 참조 기반 배포 |

**Cline 연동**:
```
Claude Code: /session-end [메모] → Memory Bank 업데이트
Cline: "follow your custom instructions" → 업데이트된 Memory Bank로 이어받기
```

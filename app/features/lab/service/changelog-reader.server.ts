/**
 * CHANGELOG.md 파일 리더 (서버사이드)
 *
 * Cloudflare Edge에서는 fs 모듈을 사용할 수 없으므로,
 * Vite의 ?raw 쿼리로 빌드 시점에 번들에 포함시킨다.
 * 빌드할 때마다 최신 CHANGELOG.md 내용이 반영된다.
 */

import changelogRaw from "../../../../docs/CHANGELOG.md?raw";

export async function readChangelogFile(): Promise<string> {
  return changelogRaw as string;
}

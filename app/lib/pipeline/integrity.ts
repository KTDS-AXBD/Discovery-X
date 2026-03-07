/**
 * Pipeline Integrity Validator
 *
 * Radar -> Ideas -> Proposals 파이프라인 데이터 정합성 검증 서비스.
 *
 * 5대 검증 원칙:
 * 1. 참조 무결성 — FK가 실제 레코드를 가리킨다
 * 2. 필수 필드 — titleKo, summaryKo 등 비즈니스 필수값 존재
 * 3. 균등 분배 — 소스당 아이템, proposal당 섹션 수 일치
 * 4. 전 구간 연결 — Radar->Ideas 경로가 끊기지 않는다
 * 5. 콘텐츠 품질 — 섹션 content 최소 길이
 */
import { sql } from "drizzle-orm";
import type { DB } from "~/db";
import { radarSources, radarRuns, radarItems } from "~/db";
import { ideas, ideaSources } from "~/features/ideas/db/schema";
import { proposals, proposalSections } from "~/features/proposals/db/schema";

export interface IntegrityCheck {
  id: string;
  name: string;
  pass: boolean;
  expected: string | number;
  actual: string | number;
}

export interface IntegrityReport {
  timestamp: Date;
  prefix: string;
  checks: IntegrityCheck[];
  passed: number;
  failed: number;
  total: number;
}

export class PipelineIntegrityValidator {
  constructor(private db: DB) {}

  async validate(
    prefix: string,
    expectations: {
      sources?: number;
      items?: number;
      ideas?: number;
      links?: number;
      proposals?: number;
      sections?: number;
      itemsPerSource?: number;
      sectionsPerProposal?: number;
      minContentLength?: number;
    } = {},
  ): Promise<IntegrityReport> {
    const checks: IntegrityCheck[] = [];

    const runs = await this.db.select({ cnt: sql<number>`count(*)` }).from(radarRuns).where(sql`id LIKE ${prefix + "-run-%"}`);
    checks.push({ id: "TC-01", name: "radar_runs 존재", pass: runs[0].cnt >= 1, expected: ">=1", actual: runs[0].cnt });

    const sources = await this.db.select({ cnt: sql<number>`count(*)` }).from(radarSources).where(sql`id LIKE ${prefix + "-src-%"}`);
    const expSrc = expectations.sources ?? sources[0].cnt;
    checks.push({ id: "TC-02", name: "radar_sources 수", pass: sources[0].cnt === expSrc, expected: expSrc, actual: sources[0].cnt });

    const items = await this.db.select({ cnt: sql<number>`count(*)` }).from(radarItems).where(sql`id LIKE ${prefix + "-ri-%"}`);
    const expItems = expectations.items ?? items[0].cnt;
    checks.push({ id: "TC-03", name: "radar_items 수", pass: items[0].cnt === expItems, expected: expItems, actual: items[0].cnt });

    const incomplete = await this.db.select({ cnt: sql<number>`count(*)` }).from(radarItems)
      .where(sql`id LIKE ${prefix + "-ri-%"} AND (title_ko IS NULL OR summary_ko IS NULL)`);
    checks.push({ id: "TC-04", name: "radar_items 필수 필드", pass: incomplete[0].cnt === 0, expected: 0, actual: incomplete[0].cnt });

    const orphanItems = await this.db.all<{ cnt: number }>(
      sql`SELECT count(*) as cnt FROM radar_items WHERE id LIKE ${prefix + "-ri-%"} AND source_id NOT IN (SELECT id FROM radar_sources)`,
    );
    checks.push({ id: "TC-05", name: "radar_items FK 정합성", pass: orphanItems[0].cnt === 0, expected: 0, actual: orphanItems[0].cnt });

    if (expectations.itemsPerSource) {
      const dist = await this.db.all<{ min_cnt: number; max_cnt: number }>(
        sql`SELECT min(cnt) as min_cnt, max(cnt) as max_cnt FROM (SELECT source_id, count(*) as cnt FROM radar_items WHERE id LIKE ${prefix + "-ri-%"} GROUP BY source_id)`,
      );
      const ips = expectations.itemsPerSource;
      checks.push({ id: "TC-06", name: `소스당 아이템 균등 (${ips})`, pass: dist[0].min_cnt === ips && dist[0].max_cnt === ips, expected: ips, actual: `${dist[0].min_cnt}~${dist[0].max_cnt}` });
    }

    const ideasCnt = await this.db.select({ cnt: sql<number>`count(*)` }).from(ideas).where(sql`id LIKE ${prefix + "-idea-%"}`);
    const expIdeas = expectations.ideas ?? ideasCnt[0].cnt;
    checks.push({ id: "TC-07", name: "ideas 수", pass: ideasCnt[0].cnt === expIdeas, expected: expIdeas, actual: ideasCnt[0].cnt });

    const links = await this.db.select({ cnt: sql<number>`count(*)` }).from(ideaSources).where(sql`id LIKE ${prefix + "-is-%"}`);
    const expLinks = expectations.links ?? links[0].cnt;
    checks.push({ id: "TC-08", name: "idea_sources 수", pass: links[0].cnt === expLinks, expected: expLinks, actual: links[0].cnt });

    const orphanLinks = await this.db.all<{ oi: number; oit: number }>(
      sql`SELECT (SELECT count(*) FROM idea_sources WHERE id LIKE ${prefix + "-is-%"} AND idea_id NOT IN (SELECT id FROM ideas)) as oi, (SELECT count(*) FROM idea_sources WHERE id LIKE ${prefix + "-is-%"} AND radar_item_id NOT IN (SELECT id FROM radar_items)) as oit`,
    );
    checks.push({ id: "TC-09", name: "idea_sources FK 정합성", pass: orphanLinks[0].oi === 0 && orphanLinks[0].oit === 0, expected: "0 orphans", actual: `ideas=${orphanLinks[0].oi},items=${orphanLinks[0].oit}` });

    const propsCnt = await this.db.select({ cnt: sql<number>`count(*)` }).from(proposals).where(sql`id LIKE ${prefix + "-prop-%"}`);
    const expProps = expectations.proposals ?? propsCnt[0].cnt;
    checks.push({ id: "TC-10", name: "proposals 수", pass: propsCnt[0].cnt === expProps, expected: expProps, actual: propsCnt[0].cnt });

    const secsCnt = await this.db.select({ cnt: sql<number>`count(*)` }).from(proposalSections).where(sql`id LIKE ${prefix + "-ps-%"}`);
    const expSecs = expectations.sections ?? secsCnt[0].cnt;
    checks.push({ id: "TC-11", name: "proposal_sections 수", pass: secsCnt[0].cnt === expSecs, expected: expSecs, actual: secsCnt[0].cnt });

    if (expectations.sectionsPerProposal) {
      const sd = await this.db.all<{ min_cnt: number; max_cnt: number }>(
        sql`SELECT min(cnt) as min_cnt, max(cnt) as max_cnt FROM (SELECT proposal_id, count(*) as cnt FROM proposal_sections WHERE id LIKE ${prefix + "-ps-%"} GROUP BY proposal_id)`,
      );
      const spp = expectations.sectionsPerProposal;
      checks.push({ id: "TC-12", name: `proposal당 섹션 균등 (${spp})`, pass: sd[0].min_cnt === spp && sd[0].max_cnt === spp, expected: spp, actual: `${sd[0].min_cnt}~${sd[0].max_cnt}` });
    }

    const minLen = expectations.minContentLength ?? 50;
    const empty = await this.db.all<{ cnt: number }>(
      sql`SELECT count(*) as cnt FROM proposal_sections WHERE id LIKE ${prefix + "-ps-%"} AND (content IS NULL OR length(content) < ${minLen})`,
    );
    checks.push({ id: "TC-13", name: `섹션 콘텐츠 최소 ${minLen}자`, pass: empty[0].cnt === 0, expected: 0, actual: empty[0].cnt });

    const conn = await this.db.all<{ items: number; ideas: number }>(
      sql`SELECT count(DISTINCT ri.id) as items, count(DISTINCT i.id) as ideas FROM radar_items ri JOIN idea_sources isc ON isc.radar_item_id = ri.id JOIN ideas i ON i.id = isc.idea_id WHERE ri.id LIKE ${prefix + "-ri-%"}`,
    );
    checks.push({ id: "TC-14", name: "전 구간 연결 (Radar->Ideas)", pass: conn[0].items > 0 && conn[0].ideas > 0, expected: ">0", actual: `items=${conn[0].items},ideas=${conn[0].ideas}` });

    const passed = checks.filter((c) => c.pass).length;
    return { timestamp: new Date(), prefix, checks, passed, failed: checks.length - passed, total: checks.length };
  }
}

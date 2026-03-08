/**
 * Slide Builder — 구조화된 ProposalData → Slide[] 변환
 * Discovery-X proposals/service/slides.ts에서 추출, DB 의존성 제거
 */
import type { Slide, SlideFormat } from "../types.js";
export interface ProposalData {
    title: string;
    description: string | null;
    category: string | null;
    status: string;
    budget: string | null;
    teamSize: number | null;
    startDate: string | null;
    ownerName: string | null;
    sections: Record<string, string>;
    milestones: Array<{
        title: string;
        status: string;
    }>;
}
export declare function buildSlides(data: ProposalData, format: SlideFormat): Slide[];
//# sourceMappingURL=slide-builder.d.ts.map
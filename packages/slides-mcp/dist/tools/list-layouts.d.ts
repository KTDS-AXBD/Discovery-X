/**
 * list_layouts MCP Tool
 * 사용 가능한 레이아웃, 포맷, 섹션 타입 정보 조회
 */
export declare const LIST_LAYOUTS_SCHEMA: {
    readonly name: "list_layouts";
    readonly description: string;
    readonly inputSchema: {
        readonly type: "object";
        readonly properties: {};
    };
};
export declare function executeListLayouts(): {
    layouts: {
        name: string;
        description: string;
    }[];
    formats: {
        name: string;
        description: string;
        sections: string[];
    }[];
    sectionTypes: {
        type: string;
        label: string;
    }[];
    sectionGroups: {
        groupTitle: string;
        types: string[];
    }[];
};
//# sourceMappingURL=list-layouts.d.ts.map
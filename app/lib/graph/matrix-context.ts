/**
 * Framework Matrix 도메인 JSON-LD @context 정의.
 * Industry/Function/Cell/Score 엔티티의 시맨틱 어휘를 정의한다.
 * @see https://www.w3.org/TR/json-ld/#the-context
 */
export const MATRIX_CONTEXT = {
  dx: "https://discovery-x.app/ns/",
  mx: "https://discovery-x.app/ns/matrix/",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  // 엔티티 타입
  Industry: "mx:Industry",
  Function: "mx:Function",
  Cell: "mx:Cell",
  Score: "mx:Score",
  // 프로퍼티
  name: "rdfs:label",
  nameEn: "mx:nameEn",
  description: "mx:description",
  category: "mx:category",
  industryId: { "@id": "mx:industryId", "@type": "@id" },
  functionId: { "@id": "mx:functionId", "@type": "@id" },
  timeHorizon: "mx:timeHorizon",
  pipelineStage: "mx:pipelineStage",
  status: "mx:status",
  compositeScore: { "@id": "mx:compositeScore", "@type": "xsd:float" },
  clevelScore: { "@id": "mx:clevelScore", "@type": "xsd:float" },
  executionScore: { "@id": "mx:executionScore", "@type": "xsd:float" },
  strategicWeight: { "@id": "mx:strategicWeight", "@type": "xsd:float" },
  priority: { "@id": "mx:priority", "@type": "xsd:integer" },
  relatedTo: { "@id": "dx:relatedTo", "@type": "@id" },
  linkedTopic: { "@id": "mx:linkedTopic", "@type": "@id" },
  createdAt: { "@id": "dx:createdAt", "@type": "xsd:dateTime" },
} as const;

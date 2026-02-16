/**
 * Discovery-X JSON-LD @context 정의.
 * Graph 생성 시 기본 @context로 사용.
 * @see https://www.w3.org/TR/json-ld/#the-context
 */
export const DX_CONTEXT = {
  dx: "https://dx.minu.best/schema/",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  name: "rdfs:label",
  label: "dx:label",
  description: "dx:description",
  importance: { "@id": "dx:importance", "@type": "xsd:float" },
  category: "dx:category",
  relatedTo: { "@id": "dx:relatedTo", "@type": "@id" },
  createdAt: { "@id": "dx:createdAt", "@type": "xsd:dateTime" },
  source: { "@id": "dx:source", "@type": "@id" },
  Entity: "dx:Entity",
  Concept: "dx:Concept",
  Evidence: "dx:Evidence",
  Expertise: "dx:Expertise",
  Preference: "dx:Preference",
} as const;

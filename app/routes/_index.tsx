import type { MetaFunction } from "@remix-run/cloudflare";

export const meta: MetaFunction = () => {
  return [
    { title: "Discovery-X" },
    { name: "description", content: "내부 실험 중심 사고 시스템" },
  ];
};

export default function Index() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900">Discovery-X</h1>
        <p className="mt-4 text-lg text-gray-600">
          AX 신사업을 위한 내부 실험 중심 사고 시스템
        </p>
        <p className="mt-2 text-sm text-gray-500">
          관찰을 행동으로, 행동을 근거 있는 문서로
        </p>
      </div>
    </div>
  );
}

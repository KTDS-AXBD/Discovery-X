/**
 * Industry Adapter 선택 드롭다운 (Strategic Evolution F1)
 */

import { Select } from "~/components/ui/Select";

interface IndustrySelectorProps {
  value?: string;
  onChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
}

const INDUSTRY_OPTIONS = [
  { value: "", label: "산업 미지정" },
  { value: "manufacturing", label: "🏭 제조업" },
  { value: "finance", label: "🏦 금융/보험" },
  { value: "healthcare", label: "🏥 헬스케어/의료" },
  { value: "public", label: "🏛️ 공공/정부" },
  { value: "energy", label: "⚡ 에너지/환경" },
  { value: "other", label: "기타" },
];

export default function IndustrySelector({
  value,
  onChange,
  name = "industryCode",
  disabled = false,
}: IndustrySelectorProps) {
  return (
    <Select
      name={name}
      defaultValue={value || ""}
      disabled={disabled}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
    >
      {INDUSTRY_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </Select>
  );
}

export { INDUSTRY_OPTIONS };

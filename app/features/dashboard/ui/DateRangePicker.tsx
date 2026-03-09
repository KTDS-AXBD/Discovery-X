import { useSearchParams, useNavigate } from "@remix-run/react";
import { Button } from "~/components/ui/Button";

const PRESETS = [
  { label: "7일", days: 7 },
  { label: "30일", days: 30 },
  { label: "90일", days: 90 },
  { label: "전체", days: null },
] as const;

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getPresetRange(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from: formatDate(from), to: formatDate(to) };
}

function isPresetActive(
  preset: (typeof PRESETS)[number],
  searchParams: URLSearchParams,
): boolean {
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (preset.days === null) {
    return !from && !to;
  }

  const expected = getPresetRange(preset.days);
  return from === expected.from && to === expected.to;
}

export function DateRangePicker() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  function handleClick(preset: (typeof PRESETS)[number]) {
    const params = new URLSearchParams(searchParams);

    if (preset.days === null) {
      params.delete("from");
      params.delete("to");
    } else {
      const range = getPresetRange(preset.days);
      params.set("from", range.from);
      params.set("to", range.to);
    }

    navigate(`?${params.toString()}`, { replace: true });
  }

  return (
    <div className="flex gap-2">
      {PRESETS.map((preset) => (
        <Button
          key={preset.label}
          variant={isPresetActive(preset, searchParams) ? "default" : "ghost"}
          size="sm"
          onClick={() => handleClick(preset)}
        >
          {preset.label}
        </Button>
      ))}
    </div>
  );
}

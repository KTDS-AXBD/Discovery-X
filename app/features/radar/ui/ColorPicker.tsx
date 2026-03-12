const PRESET_COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#06B6D4", "#6B7280",
] as const;

interface ColorPickerProps {
  value?: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="flex items-center gap-1">
      {PRESET_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={`w-6 h-6 rounded-full transition-all ${
            value === color ? "ring-2 ring-offset-1 ring-fg-brand" : ""
          }`}
          style={{ backgroundColor: color }}
          onClick={() => onChange(color)}
          aria-label={color}
        />
      ))}
    </div>
  );
}

import { useState } from "react";
import { Form } from "@remix-run/react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { Button } from "~/components/ui/Button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "~/components/ui/Select";
import { Textarea } from "~/components/ui/Textarea";
import { FormField } from "~/components/ui/FormField";

const LANGUAGE_OPTIONS = [
  { value: "auto", label: "자동 (기본)" },
  { value: "ko", label: "한국어" },
  { value: "en", label: "영어" },
];

const STYLE_OPTIONS = [
  { value: "concise", label: "간결형" },
  { value: "detailed", label: "상세형" },
  { value: "evidence-focused", label: "근거 강조형" },
];

interface AgentSettingsEditorProps {
  language: string;
  style: string;
  customInstructions: string;
}

export function AgentSettingsEditor({
  language: initialLanguage,
  style: initialStyle,
  customInstructions: initialInstructions,
}: AgentSettingsEditorProps) {
  const [language, setLanguage] = useState(initialLanguage);
  const [style, setStyle] = useState(initialStyle);
  const [instructions, setInstructions] = useState(initialInstructions);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">나의 Agent 설정</CardTitle>
      </CardHeader>
      <CardContent>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="update-agent-settings" />

          <FormField label="응답 언어 선호">
            <Select name="agentLanguage" value={language} onValueChange={setLanguage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="응답 스타일">
            <Select name="agentStyle" value={style} onValueChange={setStyle}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STYLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="커스텀 지시사항">
            <Textarea
              name="customInstructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value.slice(0, 500))}
              placeholder="Agent에게 전달할 추가 지시사항 (최대 500자)"
              rows={3}
              maxLength={500}
            />
            <p className="mt-1 text-xs text-fg-tertiary">
              {instructions.length}/500자
            </p>
          </FormField>

          <div className="flex justify-end">
            <Button type="submit">저장</Button>
          </div>
        </Form>
      </CardContent>
    </Card>
  );
}

import { useState } from "react";
import { Form } from "@remix-run/react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { Input } from "~/components/ui/Input";
import { Button } from "~/components/ui/Button";
import { Select } from "~/components/ui/Select";
import { FormField } from "~/components/ui/FormField";
import { ExpertiseTag } from "./ExpertiseTag";
import type { JsonLdNode } from "~/lib/graph/types";

const LEVEL_OPTIONS = [
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" },
  { value: "expert", label: "Expert" },
];

interface ProfileEditorProps {
  userName: string;
  userRole: string;
  expertiseNodes: JsonLdNode[];
  preferenceNodes: JsonLdNode[];
  saving?: boolean;
}

export function ProfileEditor({
  userName,
  userRole,
  expertiseNodes,
  preferenceNodes,
  saving,
}: ProfileEditorProps) {
  const [newExpertise, setNewExpertise] = useState("");
  const [newExpertiseLevel, setNewExpertiseLevel] = useState("mid");
  const [newPreference, setNewPreference] = useState("");

  return (
    <div className="space-y-6">
      {/* 기본 정보 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">기본 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="update-profile" />
            <FormField label="이름">
              <Input name="name" defaultValue={userName} />
            </FormField>
            <FormField label="역할">
              <Input name="role" defaultValue={userRole} placeholder="예: BD Manager" />
            </FormField>
            <div className="flex justify-end">
              <Button type="submit" loading={saving}>저장</Button>
            </div>
          </Form>
        </CardContent>
      </Card>

      {/* 전문 분야 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">전문 분야</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {expertiseNodes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {expertiseNodes.map((node) => {
                const label = str(node, "dx:label", node["@id"]);
                const level = str(node, "dx:level", "");
                return (
                  <Form key={node["@id"]} method="post">
                    <input type="hidden" name="intent" value="remove-expertise" />
                    <input type="hidden" name="nodeId" value={node["@id"]} />
                    <ExpertiseTag
                      label={label}
                      level={level}
                      onRemove={() => {
                        const form = document.querySelector<HTMLFormElement>(
                          `input[value="${node["@id"]}"]`,
                        )?.closest("form");
                        form?.requestSubmit();
                      }}
                    />
                  </Form>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-[var(--axis-text-tertiary)]">등록된 전문 분야가 없습니다.</p>
          )}

          <Form method="post" className="flex items-end gap-2">
            <input type="hidden" name="intent" value="add-expertise" />
            <FormField label="새 전문 분야" className="flex-1">
              <Input
                name="label"
                value={newExpertise}
                onChange={(e) => setNewExpertise(e.target.value)}
                placeholder="예: AI/ML"
              />
            </FormField>
            <FormField label="레벨">
              <Select
                name="level"
                value={newExpertiseLevel}
                onChange={(e) => setNewExpertiseLevel(e.target.value)}
              >
                {LEVEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <Button type="submit" variant="outline" disabled={!newExpertise.trim()}>
              추가
            </Button>
          </Form>
        </CardContent>
      </Card>

      {/* 관심 분야 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">관심 분야</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {preferenceNodes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {preferenceNodes.map((node) => {
                const label = str(node, "dx:label", node["@id"]);
                return (
                  <Form key={node["@id"]} method="post">
                    <input type="hidden" name="intent" value="remove-preference" />
                    <input type="hidden" name="nodeId" value={node["@id"]} />
                    <ExpertiseTag
                      label={label}
                      onRemove={() => {
                        const form = document.querySelector<HTMLFormElement>(
                          `input[name="nodeId"][value="${node["@id"]}"]`,
                        )?.closest("form");
                        form?.requestSubmit();
                      }}
                    />
                  </Form>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-[var(--axis-text-tertiary)]">등록된 관심 분야가 없습니다.</p>
          )}

          <Form method="post" className="flex items-end gap-2">
            <input type="hidden" name="intent" value="add-preference" />
            <FormField label="새 관심 분야" className="flex-1">
              <Input
                name="label"
                value={newPreference}
                onChange={(e) => setNewPreference(e.target.value)}
                placeholder="예: 에너지 산업"
              />
            </FormField>
            <Button type="submit" variant="outline" disabled={!newPreference.trim()}>
              추가
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

function str(node: JsonLdNode, key: string, fallback: string): string {
  const v = node[key];
  return typeof v === "string" ? v : fallback;
}

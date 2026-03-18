import { eq } from "drizzle-orm";
import type { DB } from "~/db";
import { tenants } from "~/db";
import type { PalSettings, TenantSettings } from "~/db/schema";

// ============================================================================
// DEFAULTS
// ============================================================================

export const DEFAULT_PAL_SETTINGS: Required<PalSettings> = {
  enabled: false,
  frugalThreshold: 0.3,
  standardThreshold: 0.7,
  weights: { token: 0.3, tool: 0.3, depth: 0.4 },
};

// ============================================================================
// SERVICE
// ============================================================================

export class PalSettingsService {
  constructor(private db: DB) {}

  /** 테넌트의 PAL 설정 조회. 미설정 시 기본값 반환. */
  async getSettings(tenantId: string): Promise<Required<PalSettings>> {
    const [row] = await this.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!row) {
      return { ...DEFAULT_PAL_SETTINGS };
    }

    return mergeDefaults(row.settings?.pal);
  }

  /** PAL 설정 부분 갱신. 기존 tenants.settings의 다른 필드는 보존. */
  async updateSettings(
    tenantId: string,
    patch: Partial<PalSettings>,
  ): Promise<Required<PalSettings>> {
    const [row] = await this.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!row) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const current = row.settings ?? ({} as TenantSettings);
    const currentPal = current.pal ?? {};

    // 가중치 머지
    const mergedWeights =
      patch.weights !== undefined
        ? {
            ...DEFAULT_PAL_SETTINGS.weights,
            ...currentPal.weights,
            ...patch.weights,
          }
        : currentPal.weights;

    const merged: PalSettings = {
      ...currentPal,
      ...patch,
      weights: mergedWeights,
    };

    // 검증
    validatePalSettings(merged);

    const newSettings: TenantSettings = {
      ...current,
      pal: merged,
    };

    await this.db
      .update(tenants)
      .set({ settings: newSettings, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId));

    return mergeDefaults(merged);
  }

  /** PAL 설정 초기화 (기본값으로 리셋) */
  async resetSettings(tenantId: string): Promise<Required<PalSettings>> {
    const [row] = await this.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!row) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const current = row.settings ?? ({} as TenantSettings);
    // pal 필드 제거 → 기본값으로 복원
    const { pal: _, ...rest } = current;

    await this.db
      .update(tenants)
      .set({ settings: rest as TenantSettings, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId));

    return { ...DEFAULT_PAL_SETTINGS };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function mergeDefaults(pal?: PalSettings): Required<PalSettings> {
  return {
    enabled: pal?.enabled ?? DEFAULT_PAL_SETTINGS.enabled,
    frugalThreshold:
      pal?.frugalThreshold ?? DEFAULT_PAL_SETTINGS.frugalThreshold,
    standardThreshold:
      pal?.standardThreshold ?? DEFAULT_PAL_SETTINGS.standardThreshold,
    weights: {
      token: pal?.weights?.token ?? DEFAULT_PAL_SETTINGS.weights.token,
      tool: pal?.weights?.tool ?? DEFAULT_PAL_SETTINGS.weights.tool,
      depth: pal?.weights?.depth ?? DEFAULT_PAL_SETTINGS.weights.depth,
    },
  };
}

function validatePalSettings(settings: PalSettings): void {
  if (
    settings.frugalThreshold !== undefined &&
    (settings.frugalThreshold < 0 || settings.frugalThreshold > 1)
  ) {
    throw new Error(
      `frugalThreshold must be between 0 and 1, got ${settings.frugalThreshold}`,
    );
  }

  if (
    settings.standardThreshold !== undefined &&
    (settings.standardThreshold < 0 || settings.standardThreshold > 1)
  ) {
    throw new Error(
      `standardThreshold must be between 0 and 1, got ${settings.standardThreshold}`,
    );
  }

  if (
    settings.frugalThreshold !== undefined &&
    settings.standardThreshold !== undefined &&
    settings.frugalThreshold >= settings.standardThreshold
  ) {
    throw new Error(
      `frugalThreshold (${settings.frugalThreshold}) must be less than standardThreshold (${settings.standardThreshold})`,
    );
  }

  if (settings.weights) {
    const { token, tool, depth } = settings.weights;
    const values = [token, tool, depth].filter(
      (v) => v !== undefined,
    ) as number[];
    for (const v of values) {
      if (v < 0 || v > 1) {
        throw new Error(`Weight values must be between 0 and 1, got ${v}`);
      }
    }
    // 전체 가중치 합이 1.0인지 검증 (세 값 모두 지정된 경우만)
    if (token !== undefined && tool !== undefined && depth !== undefined) {
      const sum = token + tool + depth;
      if (Math.abs(sum - 1.0) > 0.001) {
        throw new Error(
          `Weights must sum to 1.0, got ${sum.toFixed(3)}`,
        );
      }
    }
  }
}

-- ============================
-- Phase 3: Multi-Tenant 기반 구조
-- ============================

-- 1. 신규 테이블
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  settings TEXT DEFAULT '{}',
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);

CREATE TABLE tenant_members (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
  invited_by TEXT REFERENCES users(id),
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_tenant_members_tenant ON tenant_members(tenant_id);
CREATE INDEX idx_tenant_members_user ON tenant_members(user_id);

-- 2. 기본 Tenant 생성 (기존 데이터 마이그레이션)
INSERT INTO tenants (id, name, slug, plan, status, owner_user_id, created_at, updated_at)
SELECT 'default-tenant', 'Discovery-X', 'discovery-x', 'enterprise', 'active',
       COALESCE(
         (SELECT id FROM users WHERE role = 'admin' LIMIT 1),
         (SELECT id FROM users LIMIT 1)
       ),
       unixepoch(), unixepoch()
WHERE EXISTS (SELECT 1 FROM users LIMIT 1);

-- 3. Root 엔티티에 tenant_id 추가 (NULL 허용 — D1 ALTER 제약)
ALTER TABLE discoveries ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE conversations ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE radar_sources ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE radar_runs ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE industry_adapters ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE alert_rules ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE webhook_configs ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE valueup_assessments ADD COLUMN tenant_id TEXT REFERENCES tenants(id);

-- 4. Venture Sprint에 tenant_id 추가
ALTER TABLE vd_sprints ADD COLUMN tenant_id TEXT REFERENCES tenants(id);

-- 5. 기존 데이터에 기본 tenant_id 할당
UPDATE discoveries SET tenant_id = 'default-tenant' WHERE tenant_id IS NULL;
UPDATE conversations SET tenant_id = 'default-tenant' WHERE tenant_id IS NULL;
UPDATE radar_sources SET tenant_id = 'default-tenant' WHERE tenant_id IS NULL;
UPDATE radar_runs SET tenant_id = 'default-tenant' WHERE tenant_id IS NULL;
UPDATE industry_adapters SET tenant_id = 'default-tenant' WHERE tenant_id IS NULL;
UPDATE alert_rules SET tenant_id = 'default-tenant' WHERE tenant_id IS NULL;
UPDATE webhook_configs SET tenant_id = 'default-tenant' WHERE tenant_id IS NULL;
UPDATE valueup_assessments SET tenant_id = 'default-tenant' WHERE tenant_id IS NULL;
UPDATE vd_sprints SET tenant_id = 'default-tenant' WHERE tenant_id IS NULL;

-- 6. 기존 사용자를 기본 Tenant 멤버로 등록
INSERT INTO tenant_members (id, tenant_id, user_id, role, joined_at)
SELECT 'tm-' || substr(id, 1, 8), 'default-tenant', id,
       CASE role
         WHEN 'admin' THEN 'owner'
         WHEN 'gatekeeper' THEN 'gatekeeper'
         ELSE 'member'
       END,
       unixepoch()
FROM users WHERE role != 'pending';

-- 7. 복합 인덱스 추가 (tenant 스코프 쿼리 최적화)
CREATE INDEX idx_discoveries_tenant ON discoveries(tenant_id);
CREATE INDEX idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX idx_vd_sprints_tenant ON vd_sprints(tenant_id);
CREATE INDEX idx_radar_sources_tenant ON radar_sources(tenant_id);
CREATE INDEX idx_valueup_assessments_tenant ON valueup_assessments(tenant_id);

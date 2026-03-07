ALTER TABLE evidence ADD COLUMN conversation_id TEXT REFERENCES conversations(id);
--> statement-breakpoint
CREATE INDEX idx_evidence_conversation ON evidence(conversation_id);

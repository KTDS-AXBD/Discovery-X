-- Add approval workflow columns to discoveries table
ALTER TABLE discoveries ADD COLUMN approval_status text NOT NULL DEFAULT 'NONE';
ALTER TABLE discoveries ADD COLUMN pending_decision text;
ALTER TABLE discoveries ADD COLUMN pending_decision_data text;
ALTER TABLE discoveries ADD COLUMN approval_comment text;
ALTER TABLE discoveries ADD COLUMN approved_at integer;
ALTER TABLE discoveries ADD COLUMN approved_by text REFERENCES users(id);
ALTER TABLE discoveries ADD COLUMN rejected_at integer;

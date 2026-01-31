-- FTS5 virtual table for similar seed search (trigram tokenizer for CJK support)
CREATE VIRTUAL TABLE IF NOT EXISTS discoveries_fts USING fts5(
  discovery_id UNINDEXED,
  title,
  seed_summary,
  tokenize = 'trigram'
);

-- Populate FTS index from existing data
INSERT INTO discoveries_fts (discovery_id, title, seed_summary)
SELECT id, title, seed_summary FROM discoveries;

-- Trigger: auto-sync on INSERT
CREATE TRIGGER IF NOT EXISTS discoveries_fts_insert AFTER INSERT ON discoveries
BEGIN
  INSERT INTO discoveries_fts (discovery_id, title, seed_summary)
  VALUES (NEW.id, NEW.title, NEW.seed_summary);
END;

-- Trigger: auto-sync on UPDATE
CREATE TRIGGER IF NOT EXISTS discoveries_fts_update AFTER UPDATE OF title, seed_summary ON discoveries
BEGIN
  DELETE FROM discoveries_fts WHERE discovery_id = OLD.id;
  INSERT INTO discoveries_fts (discovery_id, title, seed_summary)
  VALUES (NEW.id, NEW.title, NEW.seed_summary);
END;

-- Trigger: auto-sync on DELETE
CREATE TRIGGER IF NOT EXISTS discoveries_fts_delete AFTER DELETE ON discoveries
BEGIN
  DELETE FROM discoveries_fts WHERE discovery_id = OLD.id;
END;

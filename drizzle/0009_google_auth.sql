-- Google OAuth: add google_id, avatar_url, role to users
ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN avatar_url TEXT;
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

-- Set first user as admin
UPDATE users SET role = 'admin' WHERE id = 'user-1';

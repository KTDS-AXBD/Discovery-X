-- P6.0 누락 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_cells_horizon ON matrix_cells(team_id, time_horizon);
CREATE INDEX IF NOT EXISTS idx_cells_priority ON matrix_cells(team_id, priority);

-- F50: Ambiguity Score — prds 테이블 컬럼 추가
ALTER TABLE prds ADD COLUMN ambiguity_score REAL;
ALTER TABLE prds ADD COLUMN dimension_scores TEXT;
ALTER TABLE prds ADD COLUMN project_type TEXT;

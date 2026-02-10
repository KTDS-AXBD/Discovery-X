-- Add unique constraint on (proposal_id, type) to prevent duplicate sections
CREATE UNIQUE INDEX `idx_proposal_sections_unique_type` ON `proposal_sections` (`proposal_id`, `type`);

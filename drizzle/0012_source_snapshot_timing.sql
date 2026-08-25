ALTER TABLE source_snapshot_manifest ADD COLUMN provider_updated_at text;
ALTER TABLE source_snapshot_manifest ADD COLUMN requested_at text NOT NULL DEFAULT '';
ALTER TABLE source_snapshot_manifest ADD COLUMN received_at text NOT NULL DEFAULT '';
ALTER TABLE source_snapshot_manifest ADD COLUMN availability_basis text NOT NULL DEFAULT 'received_only';

UPDATE source_snapshot_manifest
SET requested_at = captured_at,
    received_at = captured_at
WHERE requested_at = '' OR received_at = '';

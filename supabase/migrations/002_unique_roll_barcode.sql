-- ====================================================================
-- RollPrint IMS - Phase 2 Unique Roll Barcode Migration
-- CRITICAL RULE: Every physical roll must have its OWN unique barcode.
-- One barcode must NEVER represent multiple physical rolls.
-- Database rule: inventory_rolls.roll_barcode must be UNIQUE.
-- ====================================================================

-- 1. Ensure roll_barcode, roll_number, and tracking metadata exist on inventory_rolls
ALTER TABLE inventory_rolls ADD COLUMN IF NOT EXISTS roll_barcode VARCHAR(100);
ALTER TABLE inventory_rolls ADD COLUMN IF NOT EXISTS roll_number INTEGER DEFAULT 1;
ALTER TABLE inventory_rolls ADD COLUMN IF NOT EXISTS material_name VARCHAR(150);
ALTER TABLE inventory_rolls ADD COLUMN IF NOT EXISTS size VARCHAR(50);
ALTER TABLE inventory_rolls ADD COLUMN IF NOT EXISTS roll_length NUMERIC(10, 2);
ALTER TABLE inventory_rolls ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100);

-- 2. Backfill roll_barcode from barcode column if empty
UPDATE inventory_rolls 
SET roll_barcode = barcode 
WHERE roll_barcode IS NULL;

-- 3. Set NOT NULL and enforce UNIQUE constraint on roll_barcode
ALTER TABLE inventory_rolls ALTER COLUMN roll_barcode SET NOT NULL;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_inventory_rolls_roll_barcode'
    ) THEN
        ALTER TABLE inventory_rolls ADD CONSTRAINT uq_inventory_rolls_roll_barcode UNIQUE (roll_barcode);
    END IF;
END $$;

-- 4. Create Unique Index for instant O(1) roll barcode scan lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_rolls_roll_barcode ON inventory_rolls(roll_barcode);
CREATE INDEX IF NOT EXISTS idx_inventory_rolls_batch_number ON inventory_rolls(batch_number);
CREATE INDEX IF NOT EXISTS idx_inventory_rolls_roll_status ON inventory_rolls(status);

COMMENT ON COLUMN inventory_rolls.roll_barcode IS 'UNIQUE physical roll barcode. Exactly 1 barcode per physical roll.';
COMMENT ON CONSTRAINT uq_inventory_rolls_roll_barcode ON inventory_rolls IS 'Enforces that no two physical rolls can ever have the same barcode.';

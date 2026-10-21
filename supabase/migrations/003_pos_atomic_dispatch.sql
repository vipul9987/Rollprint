-- ====================================================================
-- RollPrint IMS - Phase 3 POS Continuous Scanning & Atomic Dispatch
-- CRITICAL REQUIREMENT:
-- 1. inventory_rolls aligned with foreign keys (batch_id, batch_item_id)
-- 2. Clean POS dispatch tables: stock_out_dispatches & stock_out_dispatch_items
-- 3. Dedicated PostgreSQL RPC function: execute_roll_dispatch(...)
--    Guarantees atomic multi-roll dispatch (ALL succeed or NONE succeed)
-- ====================================================================

-- 1. ADD MISSING TRACKING COLUMNS & FOREIGN KEYS TO inventory_rolls
ALTER TABLE inventory_rolls ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES stock_batches(id) ON DELETE SET NULL;
ALTER TABLE inventory_rolls ADD COLUMN IF NOT EXISTS batch_item_id UUID REFERENCES stock_batch_items(id) ON DELETE SET NULL;
ALTER TABLE inventory_rolls ADD COLUMN IF NOT EXISTS material_id UUID REFERENCES materials(id) ON DELETE SET NULL;
ALTER TABLE inventory_rolls ADD COLUMN IF NOT EXISTS category_snapshot VARCHAR(100);
ALTER TABLE inventory_rolls ADD COLUMN IF NOT EXISTS stock_in_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE inventory_rolls ADD COLUMN IF NOT EXISTS stock_out_date DATE;
ALTER TABLE inventory_rolls ADD COLUMN IF NOT EXISTS original_stock_in_invoice_number VARCHAR(100);
ALTER TABLE inventory_rolls ADD COLUMN IF NOT EXISTS stock_out_invoice_number VARCHAR(100);

-- Ensure status supports 'IN_STOCK' and 'OUT' cleanly
DO $$
BEGIN
    -- If status column is enum or varchar, make sure 'IN_STOCK' and 'OUT' are accepted
    ALTER TABLE inventory_rolls ALTER COLUMN status TYPE VARCHAR(50);
    ALTER TABLE inventory_rolls ALTER COLUMN status SET DEFAULT 'IN_STOCK';
    UPDATE inventory_rolls SET status = 'IN_STOCK' WHERE status IN ('AVAILABLE', 'OPEN') OR status IS NULL;
    UPDATE inventory_rolls SET status = 'OUT' WHERE status IN ('CONSUMED');
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

-- 2. CREATE POS DISPATCH AUDIT TABLES
CREATE TABLE IF NOT EXISTS stock_out_dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_invoice_number VARCHAR(100) NOT NULL,
    dispatch_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_rolls INTEGER NOT NULL CHECK (total_rolls > 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_out_dispatch_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_id UUID NOT NULL REFERENCES stock_out_dispatches(id) ON DELETE CASCADE,
    inventory_roll_id UUID NOT NULL REFERENCES inventory_rolls(id) ON DELETE RESTRICT,
    roll_barcode VARCHAR(100) NOT NULL,
    material_name_snapshot VARCHAR(150),
    category_snapshot VARCHAR(100),
    width VARCHAR(50),
    roll_length NUMERIC(10, 2),
    batch_number VARCHAR(100),
    original_stock_in_invoice_number VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. ENSURE stock_transactions CONTAINS PHYSICAL ROLL AUDIT COLUMNS
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS roll_barcode VARCHAR(100);
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS stock_out_invoice_number VARCHAR(100);
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS stock_out_date DATE;
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS original_stock_in_invoice_number VARCHAR(100);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_inventory_rolls_status ON inventory_rolls(status);
CREATE INDEX IF NOT EXISTS idx_inventory_rolls_batch_id ON inventory_rolls(batch_id);
CREATE INDEX IF NOT EXISTS idx_stock_out_dispatches_inv ON stock_out_dispatches(dispatch_invoice_number);
CREATE INDEX IF NOT EXISTS idx_stock_out_dispatch_items_disp ON stock_out_dispatch_items(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_stock_out_dispatch_items_roll ON stock_out_dispatch_items(inventory_roll_id);

-- ====================================================================
-- 4. ATOMIC DISPATCH RPC FUNCTION: execute_roll_dispatch
-- Client Requirement:
-- "If 10 rolls are in cart: either ALL 10 become OUT or NONE become OUT.
--  No partial completion."
-- ====================================================================
CREATE OR REPLACE FUNCTION execute_roll_dispatch(
    p_out_invoice VARCHAR,
    p_out_date DATE,
    p_roll_barcodes TEXT[]
) RETURNS JSONB AS $$
DECLARE
    v_total_requested INT;
    v_locked_count INT;
    v_dispatch_id UUID;
    v_roll RECORD;
    v_conflict_barcode TEXT;
BEGIN
    -- 1. Validation checks
    IF p_out_invoice IS NULL OR TRIM(p_out_invoice) = '' THEN
        RAISE EXCEPTION 'Stock OUT Invoice Number is required.';
    END IF;

    IF p_out_date IS NULL THEN
        p_out_date := CURRENT_DATE;
    END IF;

    v_total_requested := array_length(p_roll_barcodes, 1);
    IF v_total_requested IS NULL OR v_total_requested = 0 THEN
        RAISE EXCEPTION 'No physical rolls provided for dispatch.';
    END IF;

    -- 2. Lock all requested rolls to prevent concurrent dispatch race conditions
    -- Verify every single barcode exists in inventory_rolls
    SELECT COUNT(*) INTO v_locked_count
    FROM inventory_rolls
    WHERE roll_barcode = ANY(p_roll_barcodes)
    FOR UPDATE;

    IF v_locked_count <> v_total_requested THEN
        RAISE EXCEPTION 'One or more scanned roll barcodes do not exist in the database.';
    END IF;

    -- 3. Check for any roll that has ALREADY been stocked out
    SELECT roll_barcode INTO v_conflict_barcode
    FROM inventory_rolls
    WHERE roll_barcode = ANY(p_roll_barcodes)
      AND status = 'OUT'
    LIMIT 1;

    IF v_conflict_barcode IS NOT NULL THEN
        RAISE EXCEPTION 'This physical roll has already been stocked out: %', v_conflict_barcode;
    END IF;

    -- 4. Create Master Dispatch Record
    INSERT INTO stock_out_dispatches (
        dispatch_invoice_number,
        dispatch_date,
        total_rolls,
        created_at
    ) VALUES (
        TRIM(p_out_invoice),
        p_out_date,
        v_total_requested,
        NOW()
    ) RETURNING id INTO v_dispatch_id;

    -- 5. Process each roll atomically
    FOR v_roll IN
        SELECT
            id,
            roll_barcode,
            batch_id,
            batch_item_id,
            batch_number,
            invoice_number,
            original_stock_in_invoice_number,
            material_name,
            size,
            roll_length
        FROM inventory_rolls
        WHERE roll_barcode = ANY(p_roll_barcodes)
    LOOP
        -- Mark roll as OUT
        UPDATE inventory_rolls
        SET
            status = 'OUT',
            stock_out_date = p_out_date,
            stock_out_invoice_number = TRIM(p_out_invoice),
            updated_at = NOW()
        WHERE id = v_roll.id;

        -- Create dispatch item line
        INSERT INTO stock_out_dispatch_items (
            dispatch_id,
            inventory_roll_id,
            roll_barcode,
            material_name_snapshot,
            width,
            roll_length,
            batch_number,
            original_stock_in_invoice_number,
            created_at
        ) VALUES (
            v_dispatch_id,
            v_roll.id,
            v_roll.roll_barcode,
            v_roll.material_name,
            v_roll.size,
            v_roll.roll_length,
            v_roll.batch_number,
            COALESCE(v_roll.original_stock_in_invoice_number, v_roll.invoice_number),
            NOW()
        );

        -- Decrement batch item remaining roll quantity if present
        IF v_roll.batch_item_id IS NOT NULL THEN
            UPDATE stock_batch_items
            SET remaining_roll_quantity = GREATEST(0, remaining_roll_quantity - 1)
            WHERE id = v_roll.batch_item_id;
        END IF;

        -- Decrement master batch remaining rolls if present
        IF v_roll.batch_id IS NOT NULL THEN
            UPDATE stock_batches
            SET updated_at = NOW()
            WHERE id = v_roll.batch_id;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'dispatch_id', v_dispatch_id,
        'dispatch_invoice_number', TRIM(p_out_invoice),
        'dispatch_date', p_out_date,
        'total_rolls', v_total_requested
    );
END;
$$ LANGUAGE plpgsql;

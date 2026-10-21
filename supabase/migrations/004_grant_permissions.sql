-- ====================================================================
-- RollPrint IMS - Migration 004: Grant Table Permissions & Fix RPC
-- 1. Grants anon / authenticated access to inventory tables & sequences
-- 2. Drops obsolete trigger trg_sync_roll_status on inventory_rolls
-- 3. Converts status column to VARCHAR(50) accepting 'IN_STOCK' and 'OUT'
-- 4. Updates execute_roll_dispatch with PostgreSQL row-locking syntax
--    (PERFORM ... FOR UPDATE instead of aggregate FOR UPDATE)
-- ====================================================================

-- 1. SCHEMA USAGE
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 2. TABLE PRIVILEGES
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

-- 3. SEQUENCE PRIVILEGES
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 4. ROUTINE / FUNCTION EXECUTION PRIVILEGES
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- 5. DEFAULT PRIVILEGES FOR FUTURE OBJECTS
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- 6. DROP OLD TRIGGER THAT BLOCKS COLUMN ALTERATION
DROP TRIGGER IF EXISTS trg_sync_roll_status ON inventory_rolls;

-- 7. CONVERT status COLUMN TO VARCHAR(50) ACCEPTING 'IN_STOCK' AND 'OUT'
ALTER TABLE inventory_rolls ALTER COLUMN status DROP DEFAULT;
ALTER TABLE inventory_rolls ALTER COLUMN status TYPE VARCHAR(50) USING status::text;
ALTER TABLE inventory_rolls ALTER COLUMN status SET DEFAULT 'IN_STOCK';
UPDATE inventory_rolls SET status = 'IN_STOCK' WHERE status IN ('AVAILABLE', 'OPEN') OR status IS NULL;
UPDATE inventory_rolls SET status = 'OUT' WHERE status IN ('CONSUMED');

-- 8. DISABLE RLS ON OPERATIONAL TABLES FOR WAREHOUSE CLIENT APP
ALTER TABLE materials DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_batch_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_rolls DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_out_dispatches DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_out_dispatch_items DISABLE ROW LEVEL SECURITY;

-- 9. CORRECTED ATOMIC MULTI-ROLL DISPATCH FUNCTION
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
    PERFORM id
    FROM inventory_rolls
    WHERE roll_barcode = ANY(p_roll_barcodes)
    FOR UPDATE;

    GET DIAGNOSTICS v_locked_count = ROW_COUNT;

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

        -- Record Dispatch Audit Line Item
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

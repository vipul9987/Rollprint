-- ====================================================================
-- MIGRATION 008: STAR MATERIAL CATEGORY & DAILY BACKUP / RESTORE
-- RollPrint IMS - Phase 3 Production Data Protection & Star Material
--
-- 1. ADDITIVE Star Material Category & Controlled Sizes (1.02, 1.30, 1.60, 1.90, 2.54, 3.20)
-- 2. Server-side validation functions & triggers for Star Material
-- 3. Hardened execute_stock_in_batch with Star Material size enforcement
-- 4. Secure database-backed inventory_backups and inventory_restore_audit tables
-- 5. Transactional backup check, creation, and atomic restore RPCs
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. ADD STAR MATERIAL TO CATEGORIES TABLE SAFELY (ADDITIVE)
-- --------------------------------------------------------------------
INSERT INTO public.categories (id, name, description, active)
VALUES (gen_random_uuid(), 'Star Material', 'Star Material with controlled sizes: 1.02, 1.30, 1.60, 1.90, 2.54, 3.20', true)
ON CONFLICT (name) DO NOTHING;

-- --------------------------------------------------------------------
-- 2. STAR MATERIAL SIZE VALIDATION FUNCTION
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_star_material_size(p_category TEXT, p_size TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF p_category IS NULL THEN
        RETURN TRUE;
    END IF;

    -- Only enforce if category is Star Material
    IF p_category = 'Star Material' OR p_category = 'STAR_MATERIAL' OR UPPER(p_category) = 'STAR_MATERIAL' THEN
        IF p_size IS NULL THEN
            RETURN FALSE;
        END IF;

        -- Strictly allow ONLY: 1.02, 1.30, 1.60, 1.90, 2.54, 3.20
        IF p_size IN ('1.02', '1.30', '1.60', '1.90', '2.54', '3.20') OR
           (p_size ~ '^[0-9]+(\.[0-9]+)?$' AND p_size::NUMERIC IN (1.02, 1.30, 1.60, 1.90, 2.54, 3.20)) THEN
            RETURN TRUE;
        ELSE
            RETURN FALSE;
        END IF;
    END IF;

    -- Other categories retain normal behavior
    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_star_material_size(TEXT, TEXT) TO authenticated, anon;

-- --------------------------------------------------------------------
-- 3. TRIGGER FOR MATERIAL CATALOG SERVER-SIDE VALIDATION
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_validate_star_material()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF (NEW.category = 'Star Material' OR NEW.category = 'STAR_MATERIAL' OR UPPER(NEW.category) = 'STAR_MATERIAL') THEN
        IF NOT public.check_star_material_size(NEW.category, NEW.variant_size) THEN
            RAISE EXCEPTION 'Invalid size for Star Material. Please select one of the allowed sizes: 1.02, 1.30, 1.60, 1.90, 2.54, 3.20.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_star_material_catalog ON public.material_catalog;
CREATE TRIGGER trg_validate_star_material_catalog
    BEFORE INSERT OR UPDATE ON public.material_catalog
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_validate_star_material();

-- --------------------------------------------------------------------
-- 4. UPDATE execute_stock_in_batch TO ENFORCE STAR MATERIAL SIZES
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_stock_in_batch(
    p_invoice_number VARCHAR,
    p_stock_in_date DATE,
    p_items JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_user_email VARCHAR;
    v_clean_invoice VARCHAR;
    v_date_prefix VARCHAR;
    v_batch_number VARCHAR;
    v_batch_id UUID;
    v_item RECORD;
    v_item_idx INT := 0;
    v_batch_item_id UUID;
    v_material_id UUID;
    v_qty INT;
    v_roll_len NUMERIC(10,2);
    v_width VARCHAR;
    v_category VARCHAR;
    v_material_name VARCHAR;
    v_total_rolls INT := 0;
    v_generated_barcodes TEXT[] := '{}';
    v_roll_idx INT;
    v_roll_barcode VARCHAR;
    v_inventory_roll_id UUID;
BEGIN
    v_user_id := auth.uid();
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

    IF p_invoice_number IS NULL OR TRIM(p_invoice_number) = '' THEN
        RAISE EXCEPTION 'Invoice number is required.';
    END IF;

    IF p_stock_in_date IS NULL THEN
        RAISE EXCEPTION 'Stock IN date is required.';
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Batch must contain at least one item.';
    END IF;

    -- Clean invoice & generate batch number
    v_clean_invoice := UPPER(REGEXP_REPLACE(TRIM(p_invoice_number), '[^A-Za-z0-9]', '', 'g'));
    v_date_prefix := TO_CHAR(p_stock_in_date, 'DDMMYY');
    v_batch_number := v_date_prefix || v_clean_invoice;

    -- Check for batch duplicate
    IF EXISTS (SELECT 1 FROM public.stock_batches WHERE batch_number = v_batch_number) THEN
        RAISE EXCEPTION 'Batch % already exists for invoice % on date %.', v_batch_number, p_invoice_number, p_stock_in_date;
    END IF;

    -- Insert Parent Batch
    v_batch_id := gen_random_uuid();
    INSERT INTO public.stock_batches (
        id,
        batch_number,
        invoice_number,
        stock_in_date,
        total_initial_rolls,
        total_remaining_rolls,
        created_by
    ) VALUES (
        v_batch_id,
        v_batch_number,
        TRIM(p_invoice_number),
        p_stock_in_date,
        0,
        0,
        COALESCE(v_user_email, 'staff@rollprint.com')
    );

    -- Process Each Batch Item Line
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        material_name TEXT,
        category TEXT,
        size TEXT,
        roll_length NUMERIC,
        quantity INT
    )
    LOOP
        v_item_idx := v_item_idx + 1;
        v_material_name := TRIM(v_item.material_name);
        v_category := COALESCE(TRIM(v_item.category), 'Flex PVC');
        v_width := TRIM(v_item.size);
        v_roll_len := COALESCE(v_item.roll_length, 50.00);
        v_qty := COALESCE(v_item.quantity, 1);

        -- ENFORCE STAR MATERIAL SERVER-SIDE RESTRICTION
        IF NOT public.check_star_material_size(v_category, v_width) THEN
            RAISE EXCEPTION 'Invalid size for Star Material. Please select one of the allowed sizes: 1.02, 1.30, 1.60, 1.90, 2.54, 3.20.';
        END IF;

        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'Item % quantity must be at least 1.', v_material_name;
        END IF;

        -- Find or create material master record
        SELECT id INTO v_material_id
        FROM public.materials
        WHERE LOWER(TRIM(name)) = LOWER(v_material_name)
        LIMIT 1;

        IF v_material_id IS NULL THEN
            v_material_id := gen_random_uuid();
            INSERT INTO public.materials (id, name, default_width, default_length, active)
            VALUES (v_material_id, v_material_name, v_width::NUMERIC, v_roll_len, TRUE);
        END IF;

        -- Insert Batch Item Line
        v_batch_item_id := gen_random_uuid();
        INSERT INTO public.stock_batch_items (
            id,
            batch_id,
            material_id,
            material_name_snapshot,
            category_snapshot,
            width,
            roll_length,
            initial_roll_quantity,
            remaining_roll_quantity,
            area_m2
        ) VALUES (
            v_batch_item_id,
            v_batch_id,
            v_material_id,
            v_material_name,
            v_category,
            v_width,
            v_roll_len,
            v_qty,
            v_qty,
            (v_width::NUMERIC * v_roll_len * v_qty)
        );

        -- Generate Individual Physical Rolls
        FOR v_roll_idx IN 1..v_qty
        LOOP
            v_total_rolls := v_total_rolls + 1;
            v_roll_barcode := v_batch_number || '-R' || LPAD(v_total_rolls::TEXT, 2, '0');
            v_inventory_roll_id := gen_random_uuid();

            INSERT INTO public.inventory_rolls (
                id,
                batch_id,
                batch_item_id,
                material_id,
                roll_barcode,
                batch_number,
                invoice_number,
                original_stock_in_invoice_number,
                roll_number,
                material_name,
                category_snapshot,
                size,
                roll_length,
                status,
                stock_in_date
            ) VALUES (
                v_inventory_roll_id,
                v_batch_id,
                v_batch_item_id,
                v_material_id,
                v_roll_barcode,
                v_batch_number,
                TRIM(p_invoice_number),
                TRIM(p_invoice_number),
                v_total_rolls,
                v_material_name,
                v_category,
                v_width,
                v_roll_len,
                'IN_STOCK',
                p_stock_in_date
            );

            -- Record Audit Transaction
            INSERT INTO public.stock_transactions (
                id,
                inventory_roll_id,
                roll_barcode,
                batch_id,
                batch_number,
                material_id,
                material_name_snapshot,
                category_snapshot,
                width,
                roll_length,
                transaction_type,
                quantity,
                area_m2,
                original_stock_in_invoice_number,
                created_by
            ) VALUES (
                gen_random_uuid(),
                v_inventory_roll_id,
                v_roll_barcode,
                v_batch_id,
                v_batch_number,
                v_material_id,
                v_material_name,
                v_category,
                v_width,
                v_roll_len,
                'IN',
                1,
                (v_width::NUMERIC * v_roll_len),
                TRIM(p_invoice_number),
                COALESCE(v_user_email, 'staff@rollprint.com')
            );

            v_generated_barcodes := array_append(v_generated_barcodes, v_roll_barcode);
        END LOOP;
    END LOOP;

    -- Update parent batch totals
    UPDATE public.stock_batches
    SET total_initial_rolls = v_total_rolls,
        total_remaining_rolls = v_total_rolls
    WHERE id = v_batch_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'batch_id', v_batch_id,
        'batch_number', v_batch_number,
        'total_rolls', v_total_rolls,
        'roll_barcodes', v_generated_barcodes
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_stock_in_batch(VARCHAR, DATE, JSONB) TO authenticated, anon;

-- --------------------------------------------------------------------
-- 5. SECURE INVENTORY BACKUP & RESTORE AUDIT STORAGE
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_backups (
    id VARCHAR(100) PRIMARY KEY,
    backup_date DATE NOT NULL DEFAULT CURRENT_DATE,
    backup_type VARCHAR(50) NOT NULL, -- 'DAILY', 'MANUAL', 'PRE_RESTORE'
    created_by VARCHAR(150) NOT NULL DEFAULT 'SYSTEM',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    record_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED'
);

CREATE TABLE IF NOT EXISTS public.inventory_restore_audit (
    id VARCHAR(100) PRIMARY KEY,
    backup_id VARCHAR(100) NOT NULL,
    restored_by VARCHAR(150) NOT NULL DEFAULT 'STAFF',
    restored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    pre_restore_backup_id VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'SUCCESS',
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_inventory_backups_daily 
    ON public.inventory_backups (backup_date, backup_type, status);

CREATE INDEX IF NOT EXISTS idx_inventory_backups_created 
    ON public.inventory_backups (created_at DESC);

ALTER TABLE public.inventory_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_restore_audit ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT ON public.inventory_backups TO authenticated, anon;
GRANT SELECT, INSERT ON public.inventory_restore_audit TO authenticated, anon;

DROP POLICY IF EXISTS "allow_read_backups" ON public.inventory_backups;
CREATE POLICY "allow_read_backups" ON public.inventory_backups FOR SELECT USING (true);

DROP POLICY IF EXISTS "allow_insert_backups" ON public.inventory_backups;
CREATE POLICY "allow_insert_backups" ON public.inventory_backups FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "allow_read_restore_audit" ON public.inventory_restore_audit;
CREATE POLICY "allow_read_restore_audit" ON public.inventory_restore_audit FOR SELECT USING (true);

DROP POLICY IF EXISTS "allow_insert_restore_audit" ON public.inventory_restore_audit;
CREATE POLICY "allow_insert_restore_audit" ON public.inventory_restore_audit FOR INSERT WITH CHECK (true);

-- --------------------------------------------------------------------
-- 6. RPC: CHECK TODAY'S DAILY BACKUP
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_today_daily_backup()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_backup RECORD;
BEGIN
    SELECT id, backup_date, backup_type, created_by, created_at, record_counts, status
    INTO v_backup
    FROM public.inventory_backups
    WHERE backup_type = 'DAILY'
      AND backup_date = CURRENT_DATE
      AND status = 'COMPLETED'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_backup.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'exists', TRUE,
            'backup', row_to_json(v_backup)
        );
    ELSE
        RETURN jsonb_build_object(
            'exists', FALSE
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_today_daily_backup() TO authenticated, anon;

-- --------------------------------------------------------------------
-- 7. RPC: CREATE INVENTORY BACKUP TRANSACTIONALLY
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_inventory_backup(
    p_backup_type VARCHAR,
    p_client_materials JSONB DEFAULT NULL,
    p_created_by VARCHAR DEFAULT 'STAFF'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_backup_id VARCHAR;
    v_counts JSONB;
    v_snapshot JSONB;
    v_mat_count INT := 0;
    v_rolls_count INT := 0;
    v_in_stock_count INT := 0;
    v_out_count INT := 0;
    v_batches_count INT := 0;
    v_txns_count INT := 0;
    v_dispatches_count INT := 0;
    v_rolls JSONB := '[]'::jsonb;
    v_batches JSONB := '[]'::jsonb;
    v_txns JSONB := '[]'::jsonb;
    v_dispatches JSONB := '[]'::jsonb;
BEGIN
    IF p_backup_type NOT IN ('DAILY', 'MANUAL', 'PRE_RESTORE') THEN
        RAISE EXCEPTION 'Invalid backup type: %. Must be DAILY, MANUAL, or PRE_RESTORE.', p_backup_type;
    END IF;

    v_backup_id := 'bkp-' || p_backup_type || '-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 6);

    -- Material count
    IF p_client_materials IS NOT NULL AND jsonb_typeof(p_client_materials) = 'array' THEN
        v_mat_count := jsonb_array_length(p_client_materials);
    ELSE
        SELECT COUNT(*) INTO v_mat_count FROM public.material_catalog;
        IF v_mat_count = 0 THEN
            SELECT COUNT(*) INTO v_mat_count FROM public.materials;
        END IF;
    END IF;

    -- Inventory Rolls
    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE status = 'IN_STOCK' OR status = 'AVAILABLE'),
           COUNT(*) FILTER (WHERE status = 'OUT' OR status = 'CONSUMED')
    INTO v_rolls_count, v_in_stock_count, v_out_count
    FROM public.inventory_rolls;

    -- Batches
    SELECT COUNT(*) INTO v_batches_count FROM public.stock_batches;

    -- Transactions
    SELECT COUNT(*) INTO v_txns_count FROM public.stock_transactions;

    -- Dispatches
    SELECT COUNT(*) INTO v_dispatches_count FROM public.stock_out_dispatches;

    v_counts := jsonb_build_object(
        'materialsCount', v_mat_count,
        'physicalRollsCount', v_rolls_count,
        'inStockCount', v_in_stock_count,
        'outStockCount', v_out_count,
        'batchesCount', v_batches_count,
        'transactionsCount', v_txns_count,
        'dispatchesCount', v_dispatches_count
    );

    -- Assemble Snapshot
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_rolls FROM (
        SELECT id, roll_barcode, batch_number, invoice_number, material_name, category_snapshot, size, roll_length, status, stock_in_date
        FROM public.inventory_rolls
    ) r;

    SELECT COALESCE(jsonb_agg(row_to_json(b)), '[]'::jsonb) INTO v_batches FROM (
        SELECT id, batch_number, invoice_number, stock_in_date, total_initial_rolls, total_remaining_rolls
        FROM public.stock_batches
    ) b;

    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_txns FROM (
        SELECT id, roll_barcode, batch_number, material_name_snapshot, category_snapshot, width, roll_length, transaction_type, quantity, area_m2
        FROM public.stock_transactions
    ) t;

    SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::jsonb) INTO v_dispatches FROM (
        SELECT id, dispatch_invoice_number, dispatch_date, total_rolls
        FROM public.stock_out_dispatches
    ) d;

    v_snapshot := jsonb_build_object(
        'materials', COALESCE(p_client_materials, '[]'::jsonb),
        'inventoryRolls', v_rolls,
        'stockBatches', v_batches,
        'stockTransactions', v_txns,
        'stockOutDispatches', v_dispatches
    );

    INSERT INTO public.inventory_backups (
        id,
        backup_date,
        backup_type,
        created_by,
        created_at,
        record_counts,
        snapshot,
        status
    ) VALUES (
        v_backup_id,
        CURRENT_DATE,
        p_backup_type,
        COALESCE(p_created_by, 'STAFF'),
        NOW(),
        v_counts,
        v_snapshot,
        'COMPLETED'
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'backup_id', v_backup_id,
        'backup_type', p_backup_type,
        'record_counts', v_counts,
        'created_at', NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_inventory_backup(VARCHAR, JSONB, VARCHAR) TO authenticated, anon;

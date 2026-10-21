-- ====================================================================
-- RollPrint IMS - Migration 005: Secure Inventory Access & RLS Lockdown
-- Purpose:
-- 1. Revoke insecure global grants from anon / PUBLIC
-- 2. Enable Row Level Security (RLS) on all inventory tables
-- 3. Grant authenticated staff read access
-- 4. Block direct client UPDATE / DELETE on inventory & audit history
-- 5. Harden execute_roll_dispatch (SECURITY DEFINER + search_path + auth check)
-- 6. Add atomic execute_stock_in_batch RPC for authenticated Stock IN
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. REVOKE INSECURE GLOBAL PERMISSIONS INTRODUCED IN 004
-- --------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, PUBLIC;

-- --------------------------------------------------------------------
-- 2. ENABLE ROW LEVEL SECURITY (RLS) ON ALL INVENTORY TABLES
-- --------------------------------------------------------------------
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_rolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_out_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_out_dispatch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs_or_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------
-- 3. GRANT MINIMUM USAGE & SELECT PRIVILEGES TO AUTHENTICATED ROLE
-- --------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated;

-- Allow authenticated users to READ catalog and inventory
GRANT SELECT ON public.materials TO authenticated;
GRANT SELECT ON public.categories TO authenticated;
GRANT SELECT ON public.suppliers TO authenticated;
GRANT SELECT ON public.material_variants TO authenticated;
GRANT SELECT ON public.stock_batches TO authenticated;
GRANT SELECT ON public.stock_batch_items TO authenticated;
GRANT SELECT ON public.inventory_rolls TO authenticated;
GRANT SELECT ON public.stock_transactions TO authenticated;
GRANT SELECT ON public.stock_out_dispatches TO authenticated;
GRANT SELECT ON public.stock_out_dispatch_items TO authenticated;
GRANT SELECT ON public.system_settings TO authenticated;
GRANT SELECT ON public.user_profiles TO authenticated;

-- Allow authenticated users to manage materials catalog (Create / Edit only, NO DELETE)
GRANT INSERT, UPDATE ON public.materials TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- --------------------------------------------------------------------
-- 4. DROP ANY LEFTOVER PERMISSIVE POLICIES
-- --------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- --------------------------------------------------------------------
-- 5. DEFINE STRICT RLS POLICIES FOR AUTHENTICATED USERS
-- --------------------------------------------------------------------

-- MATERIALS: Read for all authenticated staff; Insert/Update for authenticated staff
CREATE POLICY "authenticated_materials_select"
    ON public.materials FOR SELECT
    TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_materials_insert"
    ON public.materials FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_materials_update"
    ON public.materials FOR UPDATE
    TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

-- CATEGORIES & SUPPLIERS & VARIANTS: Read-only for authenticated staff
CREATE POLICY "authenticated_categories_select"
    ON public.categories FOR SELECT
    TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_suppliers_select"
    ON public.suppliers FOR SELECT
    TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_variants_select"
    ON public.material_variants FOR SELECT
    TO authenticated
    USING (auth.uid() IS NOT NULL);

-- INVENTORY TABLES: READ-ONLY VIA REST FOR AUTHENTICATED USERS
-- All mutations (IN / OUT) MUST proceed through audited SECURITY DEFINER RPCs!
-- No INSERT, UPDATE, or DELETE policies exist for inventory_rolls, stock_batches,
-- stock_batch_items, stock_transactions, stock_out_dispatches, or stock_out_dispatch_items.
CREATE POLICY "authenticated_stock_batches_select"
    ON public.stock_batches FOR SELECT
    TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_stock_batch_items_select"
    ON public.stock_batch_items FOR SELECT
    TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_inventory_rolls_select"
    ON public.inventory_rolls FOR SELECT
    TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_stock_transactions_select"
    ON public.stock_transactions FOR SELECT
    TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_stock_out_dispatches_select"
    ON public.stock_out_dispatches FOR SELECT
    TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_stock_out_dispatch_items_select"
    ON public.stock_out_dispatch_items FOR SELECT
    TO authenticated
    USING (auth.uid() IS NOT NULL);

-- Ensure updated_at column exists on stock_batches
ALTER TABLE public.stock_batches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- --------------------------------------------------------------------
-- 6. HARDEN POS STOCK OUT RPC: execute_roll_dispatch
-- - Checks authenticated caller: auth.uid() IS NOT NULL
-- - SECURITY DEFINER with fixed search_path = public, pg_temp
-- - Explicit schema qualification
-- - REVOKE from PUBLIC and anon; GRANT to authenticated
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_roll_dispatch(
    p_out_invoice VARCHAR,
    p_out_date DATE,
    p_roll_barcodes TEXT[]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total_requested INT;
    v_locked_count INT;
    v_dispatch_id UUID;
    v_roll RECORD;
    v_conflict_barcode TEXT;
    v_user_id UUID;
BEGIN
    -- 1. Security Check: Authenticated Staff Required
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: authenticated staff session required.';
    END IF;

    -- Ensure user exists in user_profiles to satisfy foreign key constraint on stock_transactions
    INSERT INTO public.user_profiles (id, email, full_name, role)
    SELECT
        v_user_id,
        COALESCE(u.email, 'staff@rollprint.com'),
        COALESCE(u.raw_user_meta_data->>'full_name', 'Warehouse Staff'),
        'OPERATOR'::user_role
    FROM auth.users u
    WHERE u.id = v_user_id
    ON CONFLICT (id) DO NOTHING;

    -- 2. Validation checks
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

    -- 3. Lock all requested rolls to prevent concurrent dispatch race conditions
    PERFORM id
    FROM public.inventory_rolls
    WHERE roll_barcode = ANY(p_roll_barcodes)
    FOR UPDATE;

    GET DIAGNOSTICS v_locked_count = ROW_COUNT;

    IF v_locked_count <> v_total_requested THEN
        RAISE EXCEPTION 'One or more scanned roll barcodes do not exist in the database.';
    END IF;

    -- 4. Check for any roll that has ALREADY been stocked out
    SELECT roll_barcode INTO v_conflict_barcode
    FROM public.inventory_rolls
    WHERE roll_barcode = ANY(p_roll_barcodes)
      AND status = 'OUT'
    LIMIT 1;

    IF v_conflict_barcode IS NOT NULL THEN
        RAISE EXCEPTION 'This physical roll has already been stocked out: %', v_conflict_barcode;
    END IF;

    -- 5. Create Master Dispatch Record
    INSERT INTO public.stock_out_dispatches (
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

    -- 6. Process each roll atomically
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
        FROM public.inventory_rolls
        WHERE roll_barcode = ANY(p_roll_barcodes)
    LOOP
        -- Mark roll as OUT
        UPDATE public.inventory_rolls
        SET
            status = 'OUT',
            stock_out_date = p_out_date,
            stock_out_invoice_number = TRIM(p_out_invoice),
            remaining_length = 0,
            updated_at = NOW()
        WHERE id = v_roll.id;

        -- Record Dispatch Audit Line Item
        INSERT INTO public.stock_out_dispatch_items (
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
            UPDATE public.stock_batch_items
            SET remaining_roll_quantity = GREATEST(0, remaining_roll_quantity - 1)
            WHERE id = v_roll.batch_item_id;
        END IF;

        -- Create Audit Stock Transaction
        INSERT INTO public.stock_transactions (
            transaction_number,
            transaction_type,
            quantity,
            unit,
            reference_number,
            roll_barcode,
            stock_out_invoice_number,
            stock_out_date,
            original_stock_in_invoice_number,
            performed_by,
            created_at
        ) VALUES (
            'TXN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::text, 1, 8),
            'STOCK_OUT',
            v_roll.roll_length,
            'METRE',
            TRIM(p_out_invoice),
            v_roll.roll_barcode,
            TRIM(p_out_invoice),
            p_out_date,
            COALESCE(v_roll.original_stock_in_invoice_number, v_roll.invoice_number),
            v_user_id,
            NOW()
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'dispatch_id', v_dispatch_id,
        'dispatch_invoice_number', TRIM(p_out_invoice),
        'dispatch_date', p_out_date,
        'total_rolls', v_total_requested
    );
END;
$$;

-- Secure execution permissions for execute_roll_dispatch
REVOKE EXECUTE ON FUNCTION public.execute_roll_dispatch(VARCHAR, DATE, TEXT[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.execute_roll_dispatch(VARCHAR, DATE, TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.execute_roll_dispatch(VARCHAR, DATE, TEXT[]) TO authenticated;

-- --------------------------------------------------------------------
-- 7. SECURE ATOMIC STOCK IN RPC: execute_stock_in_batch
-- - Checks authenticated caller: auth.uid() IS NOT NULL
-- - Validates invoice, date, and line items (width > 0, length > 0, quantity > 0)
-- - Creates batch in stock_batches
-- - Creates line items in stock_batch_items
-- - Creates physical inventory_rolls (one unique barcode per roll)
-- - Creates audit records in stock_transactions
-- - Atomic: all succeed or none succeed
-- - SECURITY DEFINER with fixed search_path = public, pg_temp
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
    v_batch_id UUID;
    v_batch_number VARCHAR(100);
    v_clean_invoice VARCHAR(100);
    v_item RECORD;
    v_item_idx INT := 0;
    v_batch_item_id UUID;
    v_roll_idx INT;
    v_roll_barcode TEXT;
    v_total_rolls_in_batch INT := 0;
    v_material_name TEXT;
    v_category TEXT;
    v_size TEXT;
    v_length NUMERIC;
    v_qty INT;
    v_area NUMERIC;
    v_width_num NUMERIC;
    v_created_rolls TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- 1. Security Check: Authenticated Staff Required
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: authenticated staff session required to perform Stock IN.';
    END IF;

    -- Ensure user exists in user_profiles to satisfy foreign key constraint on stock_transactions
    INSERT INTO public.user_profiles (id, email, full_name, role)
    SELECT
        v_user_id,
        COALESCE(u.email, 'staff@rollprint.com'),
        COALESCE(u.raw_user_meta_data->>'full_name', 'Warehouse Staff'),
        'OPERATOR'::user_role
    FROM auth.users u
    WHERE u.id = v_user_id
    ON CONFLICT (id) DO NOTHING;

    -- 2. Validate Invoice Number
    IF p_invoice_number IS NULL OR TRIM(p_invoice_number) = '' THEN
        RAISE EXCEPTION 'Invoice Number is required for Stock IN.';
    END IF;
    v_clean_invoice := TRIM(p_invoice_number);

    -- 3. Validate Date
    IF p_stock_in_date IS NULL THEN
        p_stock_in_date := CURRENT_DATE;
    END IF;

    -- 4. Validate Items Payload
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Stock IN requires at least one item line.';
    END IF;

    -- 5. Generate Standard Batch Number: DDMMYY<CLEAN_INVOICE>
    v_batch_number := TO_CHAR(p_stock_in_date, 'DDMMYY') || UPPER(REGEXP_REPLACE(v_clean_invoice, '[^a-zA-Z0-9]', '', 'g'));

    -- 6. Check for Duplicate Batch
    IF EXISTS (SELECT 1 FROM public.stock_batches WHERE batch_number = v_batch_number) THEN
        RAISE EXCEPTION 'A batch with number % already exists.', v_batch_number;
    END IF;

    -- 7. Create Master Batch
    INSERT INTO public.stock_batches (
        batch_number,
        invoice_number,
        stock_in_date,
        barcode_value,
        created_at
    ) VALUES (
        v_batch_number,
        v_clean_invoice,
        p_stock_in_date,
        v_batch_number,
        NOW()
    ) RETURNING id INTO v_batch_id;

    -- 8. Loop through each item line
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        material_name TEXT,
        category TEXT,
        size TEXT,
        roll_length NUMERIC,
        quantity INT
    ) LOOP
        v_item_idx := v_item_idx + 1;
        v_material_name := TRIM(v_item.material_name);
        v_category := COALESCE(TRIM(v_item.category), 'Flex PVC');
        v_size := TRIM(v_item.size);
        v_length := v_item.roll_length;
        v_qty := v_item.quantity;

        -- Validation per line
        IF v_material_name IS NULL OR v_material_name = '' THEN
            RAISE EXCEPTION 'Item line %: Material Name is required.', v_item_idx;
        END IF;

        IF v_size IS NULL OR v_size = '' THEN
            RAISE EXCEPTION 'Item line %: Size / Width is required.', v_item_idx;
        END IF;

        IF v_length IS NULL OR v_length <= 0 THEN
            RAISE EXCEPTION 'Item line %: Roll Length must be greater than 0.', v_item_idx;
        END IF;

        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'Item line %: Quantity must be greater than 0 rolls.', v_item_idx;
        END IF;

        -- Calculate Area
        v_width_num := NULLIF(REGEXP_REPLACE(v_size, '[^0-9.]', '', 'g'), '')::NUMERIC;
        IF v_width_num IS NULL THEN
            v_width_num := 1.0;
        END IF;
        v_area := ROUND(v_width_num * v_length * v_qty, 2);

        -- Insert Batch Line Item
        INSERT INTO public.stock_batch_items (
            batch_id,
            material_name_snapshot,
            category_snapshot,
            width,
            roll_length,
            initial_roll_quantity,
            remaining_roll_quantity,
            area_m2,
            created_at
        ) VALUES (
            v_batch_id,
            v_material_name,
            v_category,
            v_size,
            v_length,
            v_qty,
            v_qty,
            v_area,
            NOW()
        ) RETURNING id INTO v_batch_item_id;

        -- Generate Individual Physical Rolls
        FOR v_roll_idx IN 1..v_qty LOOP
            -- Blueprint Unique Barcode Format: <BATCH_NUMBER>-<ITEM_LINE_PAD2>-<ROLL_PAD3>
            v_roll_barcode := v_batch_number || '-' || LPAD(v_item_idx::TEXT, 2, '0') || '-' || LPAD(v_roll_idx::TEXT, 3, '0');

            -- Enforce Unique Barcode Check
            IF EXISTS (SELECT 1 FROM public.inventory_rolls WHERE roll_barcode = v_roll_barcode) THEN
                RAISE EXCEPTION 'Generated roll barcode % already exists in database.', v_roll_barcode;
            END IF;

            INSERT INTO public.inventory_rolls (
                roll_barcode,
                barcode,
                batch_id,
                batch_item_id,
                batch_number,
                invoice_number,
                original_stock_in_invoice_number,
                roll_number,
                material_name,
                category_snapshot,
                size,
                roll_length,
                initial_length,
                remaining_length,
                status,
                stock_in_date,
                received_date,
                created_at,
                updated_at
            ) VALUES (
                v_roll_barcode,
                v_roll_barcode,
                v_batch_id,
                v_batch_item_id,
                v_batch_number,
                v_clean_invoice,
                v_clean_invoice,
                v_roll_idx,
                v_material_name,
                v_category,
                v_size,
                v_length,
                v_length,
                v_length,
                'IN_STOCK',
                p_stock_in_date,
                p_stock_in_date,
                NOW(),
                NOW()
            );

            v_created_rolls := array_append(v_created_rolls, v_roll_barcode);
            v_total_rolls_in_batch := v_total_rolls_in_batch + 1;

            -- Create Audit Transaction
            INSERT INTO public.stock_transactions (
                transaction_number,
                transaction_type,
                quantity,
                unit,
                reference_number,
                roll_barcode,
                original_stock_in_invoice_number,
                performed_by,
                created_at
            ) VALUES (
                'TXN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::text, 1, 8),
                'STOCK_IN',
                v_length,
                'METRE',
                v_clean_invoice,
                v_roll_barcode,
                v_clean_invoice,
                v_user_id,
                NOW()
            );
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'batch_id', v_batch_id,
        'batch_number', v_batch_number,
        'invoice_number', v_clean_invoice,
        'stock_in_date', p_stock_in_date,
        'total_rolls', v_total_rolls_in_batch,
        'roll_barcodes', v_created_rolls
    );
END;
$$;

-- Secure execution permissions for execute_stock_in_batch
REVOKE EXECUTE ON FUNCTION public.execute_stock_in_batch(VARCHAR, DATE, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.execute_stock_in_batch(VARCHAR, DATE, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.execute_stock_in_batch(VARCHAR, DATE, JSONB) TO authenticated;

-- --------------------------------------------------------------------
-- 8. AUTO-CONFIRM STAFF ACCOUNTS & SYNC USER PROFILES
-- Ensures internal warehouse staff can sign in immediately without
-- requiring external email delivery configuration.
-- --------------------------------------------------------------------
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
WHERE email IS NOT NULL;

INSERT INTO public.user_profiles (id, email, full_name, role)
SELECT
    id,
    COALESCE(email, 'staff@rollprint.com'),
    COALESCE(raw_user_meta_data->>'full_name', 'Warehouse Staff'),
    'OPERATOR'::user_role
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ====================================================================
-- END OF MIGRATION 005
-- ====================================================================

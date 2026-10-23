-- ====================================================================
-- MIGRATION 007: DYNAMIC MATERIAL MATRIX & PERSISTENT DISPLAY ORDER
-- RollPrint IMS - Phase 2 Dashboard Matrix Dynamic Synchronization
--
-- Enables deterministic material ordering and remote synchronization
-- for Material Master catalog, dashboard table groups, and variant columns.
-- ====================================================================

-- 1. Add display_order and dashboard_group to existing materials table if present
ALTER TABLE IF EXISTS public.materials 
    ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 100,
    ADD COLUMN IF NOT EXISTS dashboard_group VARCHAR(50) NOT NULL DEFAULT 'FLEX_ROLL';

-- 2. Create authoritative material_catalog table for full multi-variant persistence
CREATE TABLE IF NOT EXISTS public.material_catalog (
    id VARCHAR(100) PRIMARY KEY,
    material_name VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL,
    summary_group VARCHAR(50) NOT NULL DEFAULT 'FLEX_ROLL',
    dashboard_group VARCHAR(50) NOT NULL DEFAULT 'FLEX_ROLL',
    variant_size VARCHAR(50) NOT NULL,
    roll_length_mtr NUMERIC(10, 2) NOT NULL DEFAULT 70,
    secondary_variant VARCHAR(50),
    unit VARCHAR(20) NOT NULL DEFAULT 'Rolls',
    barcode VARCHAR(150) NOT NULL UNIQUE,
    display_order INTEGER NOT NULL DEFAULT 100,
    min_stock NUMERIC(10, 2) NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Enable RLS and Grant Permissions to Authenticated Users
ALTER TABLE public.material_catalog ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_catalog TO authenticated;

DROP POLICY IF EXISTS "authenticated_material_catalog_all" ON public.material_catalog;
CREATE POLICY "authenticated_material_catalog_all"
    ON public.material_catalog FOR ALL
    TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Fast deterministic ordering indexes
CREATE INDEX IF NOT EXISTS idx_material_catalog_order 
    ON public.material_catalog (dashboard_group, display_order, material_name);

CREATE INDEX IF NOT EXISTS idx_material_catalog_lookup 
    ON public.material_catalog (material_name, variant_size);

-- 5. RPC to safely batch upsert materials
CREATE OR REPLACE FUNCTION public.save_material_catalog(
    p_items JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_item JSONB;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: authenticated session required.';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.material_catalog (
            id,
            material_name,
            category,
            summary_group,
            dashboard_group,
            variant_size,
            roll_length_mtr,
            secondary_variant,
            unit,
            barcode,
            display_order,
            min_stock,
            active,
            updated_at
        ) VALUES (
            v_item->>'id',
            v_item->>'materialName',
            v_item->>'category',
            COALESCE(v_item->>'summaryGroup', 'FLEX_ROLL'),
            COALESCE(v_item->>'dashboardGroup', v_item->>'summaryGroup', 'FLEX_ROLL'),
            v_item->>'variantSize',
            COALESCE((v_item->>'rollLengthMtr')::NUMERIC, 70),
            v_item->>'secondaryVariant',
            COALESCE(v_item->>'unit', 'Rolls'),
            v_item->>'barcode',
            COALESCE((v_item->>'displayOrder')::INTEGER, 100),
            COALESCE((v_item->>'minStock')::NUMERIC, 0),
            COALESCE((v_item->>'active')::BOOLEAN, TRUE),
            NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
            material_name = EXCLUDED.material_name,
            category = EXCLUDED.category,
            summary_group = EXCLUDED.summary_group,
            dashboard_group = EXCLUDED.dashboard_group,
            variant_size = EXCLUDED.variant_size,
            roll_length_mtr = EXCLUDED.roll_length_mtr,
            secondary_variant = EXCLUDED.secondary_variant,
            unit = EXCLUDED.unit,
            barcode = EXCLUDED.barcode,
            display_order = EXCLUDED.display_order,
            min_stock = EXCLUDED.min_stock,
            active = EXCLUDED.active,
            updated_at = NOW();
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Material catalog updated successfully',
        'count', jsonb_array_length(p_items)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_material_catalog(JSONB) TO authenticated;

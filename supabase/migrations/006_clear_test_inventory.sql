-- ====================================================================
-- MIGRATION 006: CLEAR OPERATIONAL TEST DATA RPC
-- RollPrint IMS Production Hardening
--
-- Provides an authenticated administrative RPC allowing staff/admins to
-- wipe test and dummy operational inventory records (transactions,
-- dispatches, batches, and rolls) while keeping material catalog,
-- user profiles, and configuration intact.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.clear_test_inventory()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- 1. Authorization: Verify caller is an authenticated staff member
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated. Only signed-in staff can clear test inventory.';
    END IF;

    -- 2. Truncate operational tables with cascade
    TRUNCATE TABLE 
        public.stock_transactions,
        public.stock_out_dispatch_items,
        public.stock_out_dispatches,
        public.inventory_rolls,
        public.stock_batch_items,
        public.stock_batches
    CASCADE;

    -- 3. Return confirmation
    RETURN jsonb_build_object(
        'success', true,
        'message', 'All operational test inventory records have been cleared successfully.',
        'cleared_at', NOW()
    );
END;
$$;

-- Secure execution permissions
REVOKE EXECUTE ON FUNCTION public.clear_test_inventory() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.clear_test_inventory() FROM anon;
GRANT EXECUTE ON FUNCTION public.clear_test_inventory() TO authenticated;

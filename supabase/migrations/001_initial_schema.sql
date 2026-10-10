-- ====================================================================
-- RollPrint IMS - Phase 1 Initial Schema Migration
-- Production-Ready Roll-Based Printing Material Inventory System
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUMS
CREATE TYPE user_role AS ENUM (
    'ADMIN',
    'STORE_MANAGER',
    'OPERATOR'
);

CREATE TYPE roll_status AS ENUM (
    'AVAILABLE',
    'OPEN',
    'CONSUMED',
    'DAMAGED',
    'HOLD'
);

CREATE TYPE transaction_type AS ENUM (
    'OPENING',
    'STOCK_IN',
    'STOCK_OUT',
    'RETURN',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
    'DAMAGE',
    'TRANSFER'
);

CREATE TYPE adjustment_reason_type AS ENUM (
    'DAMAGED_MATERIAL',
    'MEASUREMENT_MISMATCH',
    'LOST_MATERIAL',
    'DATA_CORRECTION',
    'PHYSICAL_AUDIT_CORRECTION',
    'OTHER'
);

CREATE TYPE job_status AS ENUM (
    'PENDING',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED'
);

-- 3. SEQUENCES FOR HUMAN-READABLE IDENTIFIERS
CREATE SEQUENCE IF NOT EXISTS barcode_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS txn_seq START 10001;
CREATE SEQUENCE IF NOT EXISTS job_seq START 5001;

-- 4. USER PROFILES TABLE (Mirrors & extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY, -- references auth.users(id) in Supabase
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'OPERATOR',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. SUPPLIERS TABLE
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL UNIQUE,
    contact_person VARCHAR(100),
    phone VARCHAR(50),
    email VARCHAR(100),
    address TEXT,
    tax_id VARCHAR(50),
    notes TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. MATERIALS TABLE
CREATE TABLE IF NOT EXISTS materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_category_material_name UNIQUE (category_id, name)
);

-- 8. MATERIAL VARIANTS / SKUS TABLE
CREATE TABLE IF NOT EXISTS material_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
    sku VARCHAR(100) NOT NULL UNIQUE,
    width_ft NUMERIC(8, 2),
    width_m NUMERIC(8, 3),
    standard_roll_length NUMERIC(10, 2) NOT NULL,
    unit VARCHAR(20) NOT NULL DEFAULT 'METRE', -- METRE, YARD, FEET
    minimum_stock NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_positive_length CHECK (standard_roll_length > 0),
    CONSTRAINT chk_non_negative_min_stock CHECK (minimum_stock >= 0),
    CONSTRAINT chk_has_width CHECK (width_ft IS NOT NULL OR width_m IS NOT NULL)
);

-- 9. JOBS / ORDERS TABLE
CREATE TABLE IF NOT EXISTS jobs_or_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_number VARCHAR(50) NOT NULL UNIQUE,
    customer_name VARCHAR(150) NOT NULL,
    description TEXT,
    status job_status NOT NULL DEFAULT 'PENDING',
    notes TEXT,
    created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. INVENTORY ROLLS TABLE (Track each physical roll)
CREATE TABLE IF NOT EXISTS inventory_rolls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_variant_id UUID NOT NULL REFERENCES material_variants(id) ON DELETE RESTRICT,
    barcode VARCHAR(100) NOT NULL UNIQUE,
    batch_number VARCHAR(100),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    initial_length NUMERIC(10, 2) NOT NULL,
    remaining_length NUMERIC(10, 2) NOT NULL,
    status roll_status NOT NULL DEFAULT 'AVAILABLE',
    received_date DATE NOT NULL DEFAULT CURRENT_DATE,
    unit_cost NUMERIC(12, 2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_positive_initial_length CHECK (initial_length > 0),
    CONSTRAINT chk_non_negative_remaining CHECK (remaining_length >= 0),
    CONSTRAINT chk_valid_remaining_bounds CHECK (remaining_length <= initial_length + 50.00) -- allows minor positive adjustment
);

-- 11. STOCK TRANSACTIONS TABLE (Immutable audit trail)
CREATE TABLE IF NOT EXISTS stock_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_number VARCHAR(50) NOT NULL UNIQUE,
    transaction_type transaction_type NOT NULL,
    material_variant_id UUID NOT NULL REFERENCES material_variants(id) ON DELETE RESTRICT,
    inventory_roll_id UUID NOT NULL REFERENCES inventory_rolls(id) ON DELETE RESTRICT,
    quantity NUMERIC(10, 2) NOT NULL,
    unit VARCHAR(20) NOT NULL DEFAULT 'METRE',
    job_id UUID REFERENCES jobs_or_orders(id) ON DELETE SET NULL,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    reference_number VARCHAR(100), -- Invoice No, Delivery Challan, Job Ref
    notes TEXT,
    performed_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_transaction_positive_qty CHECK (quantity > 0)
);

-- 12. STOCK ADJUSTMENTS TABLE (Detailed log of adjustments)
CREATE TABLE IF NOT EXISTS stock_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_roll_id UUID NOT NULL REFERENCES inventory_rolls(id) ON DELETE RESTRICT,
    transaction_id UUID NOT NULL REFERENCES stock_transactions(id) ON DELETE CASCADE,
    adjustment_type VARCHAR(50) NOT NULL, -- 'INCREASE', 'DECREASE', 'DAMAGE', 'AUDIT'
    reason adjustment_reason_type NOT NULL DEFAULT 'OTHER',
    previous_length NUMERIC(10, 2) NOT NULL,
    new_length NUMERIC(10, 2) NOT NULL,
    difference_quantity NUMERIC(10, 2) NOT NULL,
    performed_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. SYSTEM SETTINGS TABLE
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================================
-- INDEXES FOR PERFORMANCE
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category_id);
CREATE INDEX IF NOT EXISTS idx_variants_material ON material_variants(material_id);
CREATE INDEX IF NOT EXISTS idx_variants_sku ON material_variants(sku);
CREATE INDEX IF NOT EXISTS idx_rolls_variant ON inventory_rolls(material_variant_id);
CREATE INDEX IF NOT EXISTS idx_rolls_barcode ON inventory_rolls(barcode);
CREATE INDEX IF NOT EXISTS idx_rolls_status ON inventory_rolls(status);
CREATE INDEX IF NOT EXISTS idx_rolls_supplier ON inventory_rolls(supplier_id);
CREATE INDEX IF NOT EXISTS idx_transactions_roll ON stock_transactions(inventory_roll_id);
CREATE INDEX IF NOT EXISTS idx_transactions_variant ON stock_transactions(material_variant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON stock_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON stock_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_job ON stock_transactions(job_id);

-- ====================================================================
-- AUTOMATIC ROLL STATUS SYNCHRONIZATION FUNCTION & TRIGGER
-- ====================================================================
CREATE OR REPLACE FUNCTION fn_sync_roll_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Do not override explicit DAMAGED or HOLD unless length goes to 0
    IF NEW.remaining_length = 0 THEN
        NEW.status := 'CONSUMED';
    ELSIF NEW.status NOT IN ('DAMAGED', 'HOLD') THEN
        IF NEW.remaining_length >= NEW.initial_length THEN
            NEW.status := 'AVAILABLE';
        ELSE
            NEW.status := 'OPEN';
        END IF;
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_roll_status ON inventory_rolls;
CREATE TRIGGER trg_sync_roll_status
    BEFORE INSERT OR UPDATE OF remaining_length, status
    ON inventory_rolls
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_roll_status();

-- ====================================================================
-- BARCODE GENERATOR HELPER FUNCTION
-- ====================================================================
CREATE OR REPLACE FUNCTION fn_generate_roll_barcode()
RETURNS TEXT AS $$
DECLARE
    next_val BIGINT;
BEGIN
    next_val := nextval('barcode_seq');
    RETURN 'RL-' || LPAD(next_val::TEXT, 8, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_generate_transaction_number()
RETURNS TEXT AS $$
DECLARE
    next_val BIGINT;
BEGIN
    next_val := nextval('txn_seq');
    RETURN 'TXN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(next_val::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_generate_job_number()
RETURNS TEXT AS $$
DECLARE
    next_val BIGINT;
BEGIN
    next_val := nextval('job_seq');
    RETURN 'JOB-' || LPAD(next_val::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- ====================================================================
-- 14. STOCK BATCHES TABLE (Linear Code128 Batch Tracking)
-- ====================================================================
CREATE TABLE IF NOT EXISTS stock_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_number VARCHAR(100) NOT NULL UNIQUE,
    material_name VARCHAR(150) NOT NULL,
    category VARCHAR(100),
    variant_size VARCHAR(50) NOT NULL,
    roll_length_mtr NUMERIC(10, 2) NOT NULL,
    initial_roll_quantity INTEGER NOT NULL DEFAULT 1,
    current_remaining_roll_quantity INTEGER NOT NULL DEFAULT 1,
    invoice_number VARCHAR(100) NOT NULL,
    stock_in_date DATE NOT NULL DEFAULT CURRENT_DATE,
    barcode_value VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_batches_number ON stock_batches(batch_number);
CREATE INDEX IF NOT EXISTS idx_stock_batches_invoice ON stock_batches(invoice_number);


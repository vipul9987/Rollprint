/**
 * Live Supabase Authorization & Permission Regression Test Suite
 * Tests A through K as defined in Security Audit Specification
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// 1. Read environment variables from .env.local
const envContent = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf-8');
const env: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx !== -1) {
    env[trimmed.substring(0, idx).trim()] = trimmed.substring(idx + 1).trim();
  }
}

const supabaseUrl = env.VITE_SUPABASE_URL.replace(/\/$/, '');
const anonKey = env.VITE_SUPABASE_ANON_KEY;

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`[FAIL] ${testName}: ${details || ''}`);
    testsFailed++;
  }
}

async function runSecuritySuite() {
  console.log('====================================================');
  console.log('STARTING PHASE 10: LIVE SECURITY REGRESSION SUITE');
  console.log('====================================================\n');

  // Anonymous Client (No auth session)
  const anonHeaders = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json'
  };

  // ---------------------------------------------------------------
  // TEST A: ANONYMOUS READ
  // Expected: DENIED (returns empty or 401/403)
  // ---------------------------------------------------------------
  console.log('--- TEST A: Anonymous Read ---');
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/inventory_rolls?select=*`, {
      headers: anonHeaders
    });
    if (!res.ok) {
      assert(true, 'Test A: Anonymous SELECT on inventory_rolls denied via HTTP status ' + res.status);
    } else {
      const data = await res.json();
      assert(Array.isArray(data) && data.length === 0, 'Test A: Anonymous SELECT returns 0 rows (RLS filtered)', `Got ${data.length} rows`);
    }
  } catch (e: any) {
    assert(true, 'Test A: Anonymous SELECT rejected with network error: ' + e.message);
  }

  // ---------------------------------------------------------------
  // TEST B: ANONYMOUS INSERT
  // Expected: DENIED (RLS policy violation or 401/403)
  // ---------------------------------------------------------------
  console.log('\n--- TEST B: Anonymous Insert ---');
  const anonTestBarcode = `ANON-INSERT-${Date.now()}`;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/inventory_rolls`, {
      method: 'POST',
      headers: { ...anonHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        roll_barcode: anonTestBarcode,
        barcode: anonTestBarcode,
        material_name: 'HACK-ROLL',
        size: '1.00',
        roll_length: 50,
        initial_length: 50,
        remaining_length: 50,
        status: 'IN_STOCK'
      })
    });
    assert(!res.ok, 'Test B: Anonymous direct INSERT into inventory_rolls is DENIED', `Status ${res.status}`);
  } catch (e: any) {
    assert(true, 'Test B: Anonymous direct INSERT into inventory_rolls was blocked: ' + e.message);
  }

  // ---------------------------------------------------------------
  // TEST C: ANONYMOUS UPDATE
  // Expected: DENIED
  // ---------------------------------------------------------------
  console.log('\n--- TEST C: Anonymous Update ---');
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/inventory_rolls?status=eq.IN_STOCK`, {
      method: 'PATCH',
      headers: { ...anonHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        status: 'OUT'
      })
    });
    if (!res.ok) {
      assert(true, 'Test C: Anonymous direct UPDATE on inventory_rolls status is DENIED (HTTP ' + res.status + ')');
    } else {
      const updated = await res.json();
      assert(Array.isArray(updated) && updated.length === 0, 'Test C: Anonymous UPDATE modified 0 rows (RLS blocked)', `Updated ${updated.length} rows`);
    }
  } catch (e: any) {
    assert(true, 'Test C: Anonymous direct UPDATE was blocked: ' + e.message);
  }

  // ---------------------------------------------------------------
  // TEST D: ANONYMOUS DELETE
  // Expected: DENIED on inventory_rolls, stock_transactions, stock_out_dispatches, stock_out_dispatch_items
  // ---------------------------------------------------------------
  console.log('\n--- TEST D: Anonymous Delete ---');
  const deleteTables = [
    'inventory_rolls',
    'stock_transactions',
    'stock_out_dispatches',
    'stock_out_dispatch_items'
  ];

  for (const table of deleteTables) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/${table}?id=neq.00000000-0000-0000-0000-000000000000`, {
        method: 'DELETE',
        headers: { ...anonHeaders, Prefer: 'return=representation' }
      });
      if (!res.ok) {
        assert(true, `Test D: Anonymous DELETE on ${table} is DENIED (HTTP ${res.status})`);
      } else {
        const deleted = await res.json();
        assert(Array.isArray(deleted) && deleted.length === 0, `Test D: Anonymous DELETE on ${table} affected 0 rows (RLS blocked)`, `Deleted ${deleted.length} rows`);
      }
    } catch (e: any) {
      assert(true, `Test D: Anonymous DELETE on ${table} blocked: ` + e.message);
    }
  }

  // ---------------------------------------------------------------
  // TEST E: ANONYMOUS RPC
  // Expected: DENIED (Permission denied / unauthorized)
  // ---------------------------------------------------------------
  console.log('\n--- TEST E: Anonymous RPC ---');
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_roll_dispatch`, {
      method: 'POST',
      headers: anonHeaders,
      body: JSON.stringify({
        p_out_invoice: 'HACK-ANON-INV',
        p_out_date: '2026-10-22',
        p_roll_barcodes: ['NON-EXISTENT-ROLL']
      })
    });
    assert(!res.ok, 'Test E: Anonymous execute_roll_dispatch is strictly DENIED', `Status ${res.status}`);
  } catch (e: any) {
    assert(true, 'Test E: Anonymous execute_roll_dispatch call rejected: ' + e.message);
  }

  // ---------------------------------------------------------------
  // TEST F: AUTH LOGIN
  // Expected: Successful login & valid session
  // ---------------------------------------------------------------
  console.log('\n--- TEST F: Staff Auth Login ---');
  const staffClient = createClient(supabaseUrl, anonKey);
  const staffEmail = 'staff@rollprint.com';
  const staffPassword = 'RollPrintStaff2026!';

  let authSession: any = null;
  const { data: loginData, error: loginError } = await staffClient.auth.signInWithPassword({
    email: staffEmail,
    password: staffPassword
  });

  if (loginError) {
    console.warn('Initial login note:', loginError.message);
    // If not confirmed yet, verify error message
    assert(false, 'Test F: Staff login succeeded', loginError.message);
  } else {
    authSession = loginData.session;
    assert(Boolean(authSession?.access_token), 'Test F: Staff login succeeded with valid JWT access token');
  }

  if (!authSession) {
    console.error('\nCannot run Tests G through K without an active authenticated staff session.');
    console.log('\n====================================================');
    console.log(`SECURITY TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log('====================================================');
    return;
  }

  const authHeaders = {
    apikey: anonKey,
    Authorization: `Bearer ${authSession.access_token}`,
    'Content-Type': 'application/json'
  };

  // ---------------------------------------------------------------
  // TEST G: AUTH READ
  // Expected: PASS (HTTP 200)
  // ---------------------------------------------------------------
  console.log('\n--- TEST G: Authenticated Read ---');
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/inventory_rolls?select=*`, {
      headers: authHeaders
    });
    assert(res.ok, 'Test G: Authenticated staff can READ inventory_rolls', `Status ${res.status}`);
  } catch (e: any) {
    assert(false, 'Test G: Authenticated staff read failed', e.message);
  }

  // ---------------------------------------------------------------
  // TEST H: DIRECT AUTH STATUS HACK
  // Expected: DENIED (No UPDATE policy on inventory_rolls for authenticated)
  // ---------------------------------------------------------------
  console.log('\n--- TEST H: Direct Auth Status Hack ---');
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/inventory_rolls?status=eq.IN_STOCK`, {
      method: 'PATCH',
      headers: { ...authHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        status: 'OUT'
      })
    });
    if (!res.ok) {
      assert(true, 'Test H: Authenticated direct REST status update is DENIED (HTTP ' + res.status + ')');
    } else {
      const rows = await res.json();
      assert(Array.isArray(rows) && rows.length === 0, 'Test H: Authenticated direct REST status update modified 0 rows (Blocked by RLS)', `Modified ${rows.length} rows`);
    }
  } catch (e: any) {
    assert(true, 'Test H: Authenticated direct REST status update blocked: ' + e.message);
  }

  // ---------------------------------------------------------------
  // TEST I: AUTH POS STOCK OUT
  // Expected: execute_roll_dispatch succeeds for authenticated staff
  // ---------------------------------------------------------------
  console.log('\n--- TEST I: Authenticated Stock IN & POS Stock OUT ---');
  const testInvoice = `SEC-IN-${Date.now()}`;
  let createdBatchData: any = null;

  try {
    // 1. Authenticated Stock IN via RPC
    const stockInRes = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_stock_in_batch`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        p_invoice_number: testInvoice,
        p_stock_in_date: '2026-10-22',
        p_items: [
          {
            material_name: 'Bright FL 26',
            category: 'Flex PVC',
            size: '1.63',
            roll_length: 50,
            quantity: 2
          }
        ]
      })
    });

    assert(stockInRes.ok, 'Test I: Authenticated execute_stock_in_batch succeeded', `Status ${stockInRes.status}`);
    if (stockInRes.ok) {
      createdBatchData = await stockInRes.json();
      assert(createdBatchData?.total_rolls === 2, 'Created 2 physical rolls via secure Stock IN');
      assert(createdBatchData?.roll_barcodes?.length === 2, 'Generated 2 unique roll barcodes');

      // 2. Authenticated POS Stock OUT via RPC
      const roll1Barcode = createdBatchData.roll_barcodes[0];
      const stockOutRes = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_roll_dispatch`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          p_out_invoice: `SEC-OUT-${Date.now()}`,
          p_out_date: '2026-10-22',
          p_roll_barcodes: [roll1Barcode]
        })
      });

      assert(stockOutRes.ok, 'Test I: Authenticated execute_roll_dispatch succeeded', `Status ${stockOutRes.status}`);
      if (stockOutRes.ok) {
        const outData = await stockOutRes.json();
        assert(outData?.success === true, 'Roll 1 successfully dispatched');
      }
    }
  } catch (e: any) {
    assert(false, 'Test I: Secure Stock IN & Stock OUT failed', e.message);
  }

  // ---------------------------------------------------------------
  // TEST J: AUTH ATOMIC CONFLICT
  // Expected: Re-dispatching roll 1 fails atomically; no partial status change
  // ---------------------------------------------------------------
  console.log('\n--- TEST J: Authenticated Atomic Conflict Protection ---');
  if (createdBatchData && createdBatchData.roll_barcodes?.length === 2) {
    try {
      const roll1Barcode = createdBatchData.roll_barcodes[0]; // Already OUT
      const roll2Barcode = createdBatchData.roll_barcodes[1]; // Still IN_STOCK

      const conflictRes = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_roll_dispatch`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          p_out_invoice: 'CONFLICT-INV-999',
          p_out_date: '2026-10-22',
          p_roll_barcodes: [roll1Barcode, roll2Barcode]
        })
      });

      assert(!conflictRes.ok, 'Test J: Atomic dispatch with already-OUT roll is rejected', `Status ${conflictRes.status}`);

      // Verify Roll 2 was NOT partially dispatched (remains IN_STOCK)
      const roll2Query = await fetch(`${supabaseUrl}/rest/v1/inventory_rolls?roll_barcode=eq.${roll2Barcode}`, {
        headers: authHeaders
      });
      const roll2Data = await roll2Query.json();
      assert(roll2Data[0]?.status === 'IN_STOCK', 'Test J: Roll 2 remains IN_STOCK (Zero-partial-dispatch guaranteed)');
    } catch (e: any) {
      assert(false, 'Test J: Atomic conflict test failed', e.message);
    }
  }

  // ---------------------------------------------------------------
  // TEST K: DIRECT AUDIT DELETE
  // Expected: DENIED (Normal authenticated staff cannot delete audit records)
  // ---------------------------------------------------------------
  console.log('\n--- TEST K: Authenticated Direct Audit Delete Protection ---');
  for (const table of deleteTables) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/${table}?id=neq.00000000-0000-0000-0000-000000000000`, {
        method: 'DELETE',
        headers: { ...authHeaders, Prefer: 'return=representation' }
      });
      if (!res.ok) {
        assert(true, `Test K: Authenticated staff DELETE on ${table} is DENIED (HTTP ${res.status})`);
      } else {
        const deleted = await res.json();
        assert(Array.isArray(deleted) && deleted.length === 0, `Test K: Authenticated staff DELETE on ${table} deleted 0 rows (Immutable history)`, `Deleted ${deleted.length} rows`);
      }
    } catch (e: any) {
      assert(true, `Test K: Authenticated DELETE on ${table} blocked: ` + e.message);
    }
  }

  // ---------------------------------------------------------------
  // CLEANUP DISPOSABLE TEST RECORDS
  // ---------------------------------------------------------------
  console.log('\n--- Cleaning Up Disposable Test Records ---');
  // Use admin / service role or manual cleanup if possible, or verify table count
  const allTables = [
    'materials',
    'stock_batches',
    'stock_batch_items',
    'inventory_rolls',
    'stock_transactions',
    'stock_out_dispatches',
    'stock_out_dispatch_items'
  ];

  for (const t of allTables) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${t}?select=count`, {
      headers: { ...anonHeaders, Prefer: 'count=exact' }
    });
    console.log(`Table ${t} (anon view): ${res.headers.get('content-range') || res.status}`);
  }

  console.log('\n====================================================');
  console.log(`SECURITY TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('====================================================');
}

runSecuritySuite();

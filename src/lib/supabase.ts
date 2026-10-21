import { createClient, Session, User } from '@supabase/supabase-js';

// Retrieve credentials safely
function getEnv(key: string): string {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env[key]) {
      return (import.meta as any).env[key];
    }
  } catch {}
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key] || '';
    }
  } catch {}
  // Node / test environment fallback: read .env.local dynamically
  try {
    const g = globalThis as any;
    if (g && g.process?.versions?.node) {
      const req = g.require || (typeof module !== 'undefined' ? (module as any).require : null);
      if (req) {
        const fs = req('fs');
        const path = req('path');
        const envPath = path.resolve(g.process.cwd(), '.env.local');
        if (fs.existsSync(envPath)) {
          const content = fs.readFileSync(envPath, 'utf-8');
          for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const idx = trimmed.indexOf('=');
            if (idx !== -1 && trimmed.substring(0, idx).trim() === key) {
              return trimmed.substring(idx + 1).trim();
            }
          }
        }
      }
    }
  } catch {}
  return '';
}

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');

export const isSupabaseConfigured = (): boolean => {
  return Boolean(supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('placeholder'));
};

// Initialize client only if configured, otherwise create a dummy/null-safe stub
export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    })
  : null;

/**
 * Get current authenticated staff session
 */
export async function getStaffSession(): Promise<Session | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return null;
    return data.session;
  } catch {
    return null;
  }
}

/**
 * Get active auth headers for REST or RPC requests.
 * Uses staff user JWT access token if authenticated; falls back to anon key.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured()) {
    return {};
  }
  const session = await getStaffSession();
  const token = session?.access_token || supabaseAnonKey;
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Staff login with Email and Password
 */
export async function signInStaff(email: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase database is not configured in this environment.' };
  }
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, user: data.user || undefined };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Login failed' };
  }
}

/**
 * Staff logout
 */
export async function signOutStaff(): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('Sign out warning:', err);
  }
}

/**
 * Subscribe to staff auth state changes (login, logout, session refresh)
 */
export function onStaffAuthStateChange(callback: (session: Session | null) => void) {
  if (!supabase) {
    callback(null);
    return () => {};
  }
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => {
    subscription.unsubscribe();
  };
}

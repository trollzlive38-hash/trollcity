import { createClient } from "@supabase/supabase-js";
import { attachIntegrations } from "./integrationCore";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseFunctionsUrl = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL; // Optional override for dev/tunnels

// Derive the dedicated functions host from the main Supabase URL if not explicitly provided.
// Example: https://<ref>.supabase.co -> https://<ref>.functions.supabase.co
function deriveFunctionsUrl(baseUrl) {
  try {
    const u = new URL(baseUrl);
    const host = u.hostname; // e.g., qaffpsbiciegxxonsxzl.supabase.co
    const isSupabaseCo = host.endsWith("supabase.co");
    if (!isSupabaseCo) return null;
    const [projectRef] = host.split(".");
    if (!projectRef) return null;
    return `https://${projectRef}.functions.supabase.co`;
  } catch (_) {
    return null;
  }
}

// If an explicit functions URL is provided but points to the main Supabase domain,
// normalize it to the dedicated functions subdomain.
function normalizeFunctionsUrl(explicitUrl, baseUrl) {
  try {
    if (explicitUrl) {
      const u = new URL(explicitUrl);
      const host = u.hostname;
      const isSupabaseCo = host.endsWith("supabase.co");
      const isFunctionsHost = host.includes(".functions.");
      if (isSupabaseCo && !isFunctionsHost) {
        const [projectRef] = host.split(".");
        u.hostname = `${projectRef}.functions.supabase.co`;
        return u.toString().replace(/\/$/, "");
      }
      return explicitUrl.replace(/\/$/, "");
    }
    const derived = deriveFunctionsUrl(baseUrl);
    return derived ? derived : undefined;
  } catch (_) {
    const derived = deriveFunctionsUrl(baseUrl);
    return derived ? derived : undefined;
  }
}

// Build a safe stub when env vars are missing to avoid crashing the app.
function buildSupabaseStub() {
  const result = { data: null, error: new Error("Supabase not configured") };
  const makeQuery = () => {
    const thenable = {
      select: () => thenable,
      insert: () => thenable,
      update: () => thenable,
      delete: () => thenable,
      match: () => thenable,
      eq: () => thenable,
      order: () => thenable,
      limit: () => thenable,
      single: async () => result,
      then: (resolve) => resolve(result),
      catch: () => thenable,
    };
    return thenable;
  };

  const stub = {
    __isConfigured: false,
    auth: {
      getUser: async () => ({ data: { user: null }, error: new Error("Supabase not configured") }),
      signOut: async () => ({ error: null }),
    },
    from: () => makeQuery(),
    rpc: async () => ({ data: null, error: new Error("Supabase not configured") }),
    storage: {
      from: () => ({
        upload: async () => ({ error: new Error("Supabase not configured") }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
        createSignedUrl: async () => ({ data: { signedUrl: "" }, error: new Error("Supabase not configured") }),
      }),
    },
    integrations: {},
  };
  console.error(
    "Supabase URL or Anon Key is missing. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment."
  );
  if (typeof window !== "undefined") {
    window.__SUPABASE_CONFIG_ERROR__ = true;
  }
  return stub;
}

// Create real client when configured; otherwise use stub
let client;
if (supabaseUrl && supabaseAnonKey) {
  client = createClient(supabaseUrl, supabaseAnonKey, {
    functions: normalizeFunctionsUrl(supabaseFunctionsUrl, supabaseUrl)
      ? { url: normalizeFunctionsUrl(supabaseFunctionsUrl, supabaseUrl) }
      : undefined,
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  client.__isConfigured = true;
  try {
    console.info("[Supabase] URL:", supabaseUrl);
    const fnUrl = normalizeFunctionsUrl(supabaseFunctionsUrl, supabaseUrl);
    if (fnUrl) console.info("[Supabase] Functions URL:", fnUrl);
  } catch (_) {}
} else {
  client = buildSupabaseStub();
}

export const supabase = client;

// Attach local integrations (Core) if not provided
attachIntegrations(supabase);

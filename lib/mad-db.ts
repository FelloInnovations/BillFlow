import postgres from "postgres";

// Direct Postgres connection to access mad schema
// Uses MAD_SUPABASE_URL (postgresql:// connection string)
// bypasses PostgREST — can access all schemas including mad

const madDbUrl = process.env.MAD_SUPABASE_URL;

if (!madDbUrl) {
  throw new Error("MAD_SUPABASE_URL environment variable is not set");
}

export const madDb = postgres(madDbUrl, {
  ssl: "require",
  max: 3,
  idle_timeout: 30,
  connect_timeout: 10,
});

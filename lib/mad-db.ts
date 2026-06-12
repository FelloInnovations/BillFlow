import postgres from "postgres";

let _madDb: ReturnType<typeof postgres> | null = null;

export function getMadDb(): ReturnType<typeof postgres> {
  if (_madDb) return _madDb;
  const url = process.env.MAD_SUPABASE_URL;
  if (!url) throw new Error("MAD_SUPABASE_URL is not set");
  _madDb = postgres(url, { ssl: "require", max: 3, idle_timeout: 30 });
  return _madDb;
}

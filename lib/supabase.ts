import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

// Server-only client (never import this in client components)
export const supabase = createClient(supabaseUrl, supabaseKey);

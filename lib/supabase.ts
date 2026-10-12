import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://noumrtldxzmtqrfmydwz.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_H3rT__cBnF3fk5QAHUFjVg_Tf1vI9Cs";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

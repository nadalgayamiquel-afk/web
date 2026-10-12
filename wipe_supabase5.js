
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function wipe() {
  const { error } = await supabase.from("sesiones_dia").delete().not("id", "is", null);
  if (error) {
    console.error("Error wiping sesiones_dia:", error);
  } else {
    console.log("Wiped sesiones_dia successfully");
  }
}
wipe();

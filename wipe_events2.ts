
import { supabase } from "./lib/supabase";
async function run() {
  const { error } = await supabase
    .from("sesiones_dia")
    .update({
      evento_1: null,
      evento_2: null,
      evento_3: null,
      evento_4: null,
      evento_5: null,
      evento_6: null,
      evento_am: null
    })
    .neq("id", "12345");
  if (error) console.error(error);
  else console.log("Successfully wiped events from DB");
}
run();

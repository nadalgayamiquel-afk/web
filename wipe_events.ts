import { config } from 'dotenv';
config({ path: '.env.local' });
import { supabase } from './lib/supabase';

async function wipe() {
  console.log("Wiping sesiones_dia...");
  const { data, error } = await supabase
    .from('sesiones_dia')
    .update({
      evento: null,
      evento_principal: null,
      evento_am: null,
      evento_pm: null,
      evento_1: null,
      evento_2: null,
      evento_3: null,
      evento_4: null,
      evento_5: null,
      evento_6: null
    })
    .lt('fecha', '2026-10-01');

  if (error) {
    console.error("Error wiping sesiones_dia:", error);
  } else {
    console.log("Wiped sesiones_dia successfully");
  }

  console.log("Wiping sesiones_dia_bloques...");
  const { error: err2 } = await supabase
    .from('sesiones_dia_bloques')
    .delete()
    .lt('fecha', '2026-10-01');

  if (err2) {
    console.error("Error wiping sesiones_dia_bloques:", err2);
  } else {
    console.log("Wiped sesiones_dia_bloques successfully");
  }
}

wipe();

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ndbvfirqxpbtwvrjjrxz.supabase.co";
const supabaseKey = "sb_publishable__vhdV9nSN8V8T1x3ZL2ehw_izRw3qhE";

export const supabase = createClient(supabaseUrl, supabaseKey);

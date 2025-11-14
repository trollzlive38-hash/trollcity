import { supabase } from "@/api/supabaseClient";

export async function getCurrentUserProfile() {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .limit(1)
      .single();
    if (error) return null;
    return data || null;
  } catch (_) {
    return null;
  }
}


import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const env = import.meta.env || {};
const supabaseUrl = env.VITE_SUPABASE_URL || window.__SUPABASE_URL__ || '';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || window.__SUPABASE_ANON_KEY__ || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.');
}

const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        detectSessionInUrl: true
      }
    })
  : null;

export default supabase;

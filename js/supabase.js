// Conexión única con Supabase
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const configurado = !SUPABASE_URL.includes('TU-PROYECTO') && !SUPABASE_KEY.startsWith('PEGAR');

export const sb = configurado
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

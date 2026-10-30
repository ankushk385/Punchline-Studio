import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export function userClient(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization) throw new Error('Missing authorization header');
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('EXPO_PUBLIC_SUPABASE_URL') ?? '';
  const supabaseKey =
    Deno.env.get('SUPABASE_ANON_KEY') ??
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
    Deno.env.get('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ??
    Deno.env.get('EXPO_PUBLIC_SUPABASE_ANON_KEY') ??
    '';
  return createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
}

export function adminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('EXPO_PUBLIC_SUPABASE_URL') ?? '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';
  return createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
}

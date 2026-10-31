import { RECORDING_BUCKET } from './recording-storage';
import { isSupabaseConfigured, supabase } from './supabase';

export interface ServiceHealth { supabaseConfigured: boolean; authenticated: boolean; storage: 'reachable' | 'unavailable' | 'not-checked'; gemini: 'connected' | 'unavailable' | 'not-checked'; checkedAt: string; }
export async function checkServiceHealth(): Promise<ServiceHealth> {
  const checkedAt = new Date().toISOString();
  if (!isSupabaseConfigured) return { supabaseConfigured: false, authenticated: false, storage: 'not-checked', gemini: 'not-checked', checkedAt };
  const { data } = await supabase.auth.getSession(); if (!data.session) return { supabaseConfigured: true, authenticated: false, storage: 'not-checked', gemini: 'not-checked', checkedAt };
  const [storageResult, functionResult] = await Promise.allSettled([
    supabase.storage.from(RECORDING_BUCKET).list(data.session.user.id, { limit: 1 }),
    supabase.functions.invoke('ai-chat', { body: { action: 'health' } }),
  ]);
  const storage = storageResult.status === 'fulfilled' && !storageResult.value.error ? 'reachable' : 'unavailable';
  const gemini = functionResult.status === 'fulfilled' && !functionResult.value.error && functionResult.value.data?.ok ? 'connected' : 'unavailable';
  return { supabaseConfigured: true, authenticated: true, storage, gemini, checkedAt };
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { PerformanceSession, SessionJokeEvent, SessionJokeReview } from '@/domain/performance';

const prefix = '@punchline:performance';
export interface PerformanceSnapshot { sessions: PerformanceSession[]; events: SessionJokeEvent[]; reviews: SessionJokeReview[]; }
const empty: PerformanceSnapshot = { sessions: [], events: [], reviews: [] };
const keys = (userId: string) => ({ sessions: `${prefix}:sessions:${userId}`, events: `${prefix}:events:${userId}`, reviews: `${prefix}:reviews:${userId}` });
const parse = <T,>(raw: string | null, fallback: T): T => { try { return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } };

export async function loadPerformanceSnapshot(userId: string): Promise<PerformanceSnapshot> {
  const storageKeys = keys(userId); const values = await AsyncStorage.multiGet([storageKeys.sessions, storageKeys.events, storageKeys.reviews]);
  return { sessions: parse(values[0][1], []), events: parse(values[1][1], []), reviews: parse(values[2][1], []) };
}
export async function savePerformanceSnapshot(userId: string, snapshot: PerformanceSnapshot): Promise<void> {
  const storageKeys = keys(userId); await AsyncStorage.multiSet([[storageKeys.sessions, JSON.stringify(snapshot.sessions)], [storageKeys.events, JSON.stringify(snapshot.events)], [storageKeys.reviews, JSON.stringify(snapshot.reviews)]]);
}
export async function clearPerformanceSnapshot(userId: string): Promise<void> { const storageKeys = keys(userId); await AsyncStorage.multiRemove(Object.values(storageKeys)); }

export async function fetchPerformanceSnapshot(userId: string): Promise<PerformanceSnapshot> {
  const [sessions, events, reviews] = await Promise.all([
    supabase.from('standup_performance_sessions').select('*').eq('user_id', userId),
    supabase.from('standup_session_joke_events').select('*').eq('user_id', userId),
    supabase.from('standup_session_joke_reviews').select('*').eq('user_id', userId),
  ]);
  if (sessions.error) throw sessions.error; if (events.error) throw events.error; if (reviews.error) throw reviews.error;
  const camel = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value]));
  return { sessions: (sessions.data ?? []).map(row => camel(row) as unknown as PerformanceSession), events: (events.data ?? []).map(row => camel(row) as unknown as SessionJokeEvent), reviews: (reviews.data ?? []).map(row => camel(row) as unknown as SessionJokeReview) };
}

const tableFor = { performanceSession: 'standup_performance_sessions', sessionEvent: 'standup_session_joke_events', sessionReview: 'standup_session_joke_reviews' } as const;
export async function pushPerformanceEntity(userId: string, type: keyof typeof tableFor, value: Record<string, unknown>, operation: 'upsert' | 'delete'): Promise<void> {
  const table = tableFor[type]; const id = String(value.id);
  if (operation === 'delete') { const result = await supabase.from(table).delete().eq('id', id).eq('user_id', userId); if (result.error) throw result.error; return; }
  const snake = Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), item]));
  const result = await supabase.from(table).upsert({ ...snake, user_id: userId }, { onConflict: 'id' }); if (result.error) throw result.error;
}

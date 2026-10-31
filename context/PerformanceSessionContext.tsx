import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useData } from './DataContext';
import { createUuid, orderMarkers, validateReview, type PerformanceSession, type SessionJokeEvent, type SessionJokeReview } from '@/domain/performance';
import { fetchPerformanceSnapshot, loadPerformanceSnapshot, savePerformanceSnapshot, type PerformanceSnapshot } from '@/lib/performance-session-repository';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { getSyncQueue } from '@/lib/sync-queue';
import type { SyncEntityType } from '@/lib/sync-types';

interface CreateSessionInput { gigId?: string; setlistId: string; audienceType: PerformanceSession['audienceType']; recordAudio: boolean; showTeleprompter: boolean; }
interface PerformanceContextValue {
  sessions: PerformanceSession[]; events: SessionJokeEvent[]; reviews: SessionJokeReview[]; loading: boolean;
  createSession: (input: CreateSessionInput) => Promise<PerformanceSession>;
  updateSession: (id: string, changes: Partial<PerformanceSession>) => Promise<void>;
  markJoke: (input: Omit<SessionJokeEvent, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'eventType'>) => Promise<SessionJokeEvent>;
  correctJokeMarker: (eventId: string, changes: Pick<SessionJokeEvent, 'jokeId' | 'jokeVersionId' | 'setlistPosition'>) => Promise<void>;
  saveReview: (input: Omit<SessionJokeReview, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<SessionJokeReview>;
  createRevisionFromReview: (reviewId: string) => Promise<string>;
  finishSession: (id: string, recordingId?: string) => Promise<void>;
}
const Context = createContext<PerformanceContextValue | null>(null);
const newer = <T extends { id: string; updatedAt: string }>(local: T[], cloud: T[]) => { const map = new Map(cloud.map(item => [item.id, item])); for (const item of local) { const other = map.get(item.id); if (!other || item.updatedAt >= other.updatedAt) map.set(item.id, item); } return Array.from(map.values()); };

export function PerformanceSessionProvider({ children }: { children: ReactNode }) {
  const { jokes, updateJoke } = useData(); const [snapshot, setSnapshot] = useState<PerformanceSnapshot>({ sessions: [], events: [], reviews: [] }); const [loading, setLoading] = useState(true);
  const userId = useRef('local'); const snapshotRef = useRef(snapshot); useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);

  const loadForUser = useCallback(async (nextUserId: string) => {
    userId.current = nextUserId; setLoading(true); setSnapshot({ sessions: [], events: [], reviews: [] });
    const local = await loadPerformanceSnapshot(nextUserId); let merged = local;
    if (nextUserId !== 'local' && isSupabaseConfigured) { try { const cloud = await fetchPerformanceSnapshot(nextUserId); merged = { sessions: newer(local.sessions, cloud.sessions), events: newer(local.events, cloud.events), reviews: newer(local.reviews, cloud.reviews) }; await savePerformanceSnapshot(nextUserId, merged); } catch { /* Offline is expected; local remains authoritative. */ } }
    if (userId.current === nextUserId) { snapshotRef.current = merged; setSnapshot(merged); setLoading(false); }
  }, []);

  useEffect(() => {
    let mounted = true; void supabase.auth.getSession().then(({ data }) => { if (mounted) void loadForUser(data.session?.user.id ?? 'local'); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { if (mounted) void loadForUser(session?.user.id ?? 'local'); });
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, [loadForUser]);

  const persist = useCallback(async (next: PerformanceSnapshot) => { snapshotRef.current = next; setSnapshot(next); await savePerformanceSnapshot(userId.current, next); }, []);
  const queue = useCallback(async (entityType: SyncEntityType, entityId: string, payload: unknown, mutatedAt: string) => { if (userId.current === 'local' || !isSupabaseConfigured) return; await getSyncQueue(userId.current).enqueue({ entityType, entityId, operation: 'upsert', payload, mutatedAt }); }, []);

  const createSession = useCallback(async (input: CreateSessionInput) => { const now = new Date().toISOString(); const session: PerformanceSession = { ...input, id: createUuid(), userId: userId.current, status: 'setup', startedAt: now, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', createdAt: now, updatedAt: now }; const next = { ...snapshotRef.current, sessions: [session, ...snapshotRef.current.sessions] }; await persist(next); await queue('performanceSession', session.id, session, now); return session; }, [persist, queue]);
  const updateSession = useCallback(async (id: string, changes: Partial<PerformanceSession>) => { const now = new Date().toISOString(); let updated: PerformanceSession | undefined; const sessions = snapshotRef.current.sessions.map(item => { if (item.id !== id) return item; updated = { ...item, ...changes, updatedAt: now }; return updated; }); await persist({ ...snapshotRef.current, sessions }); if (updated) await queue('performanceSession', id, updated, now); }, [persist, queue]);
  const markJoke = useCallback(async (input: Omit<SessionJokeEvent, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'eventType'>) => { const now = new Date().toISOString(); const event: SessionJokeEvent = { ...input, id: createUuid(), userId: userId.current, eventType: 'marker', createdAt: now, updatedAt: now }; const events = orderMarkers([...snapshotRef.current.events, event]); await persist({ ...snapshotRef.current, events }); await queue('sessionEvent', event.id, event, now); return event; }, [persist, queue]);
  const correctJokeMarker = useCallback(async (eventId: string, changes: Pick<SessionJokeEvent, 'jokeId' | 'jokeVersionId' | 'setlistPosition'>) => { const now = new Date().toISOString(); let updated: SessionJokeEvent | undefined; const events = orderMarkers(snapshotRef.current.events.map(item => { if (item.id !== eventId) return item; updated = { ...item, ...changes, eventType: 'correction', updatedAt: now }; return updated; })); await persist({ ...snapshotRef.current, events }); if (updated) await queue('sessionEvent', eventId, updated, now); }, [persist, queue]);
  const saveReview = useCallback(async (input: Omit<SessionJokeReview, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: string }) => { const errors = validateReview(input); if (errors.length) throw new Error(errors.join(' ')); const now = new Date().toISOString(); const existing = input.id ? snapshotRef.current.reviews.find(item => item.id === input.id) : undefined; const review: SessionJokeReview = { ...existing, ...input, id: existing?.id ?? createUuid(), userId: userId.current, createdAt: existing?.createdAt ?? now, updatedAt: now }; const reviews = existing ? snapshotRef.current.reviews.map(item => item.id === existing.id ? review : item) : [...snapshotRef.current.reviews, review]; await persist({ ...snapshotRef.current, reviews }); await queue('sessionReview', review.id, review, now); return review; }, [persist, queue]);
  const createRevisionFromReview = useCallback(async (reviewId: string) => { const review = snapshotRef.current.reviews.find(item => item.id === reviewId); if (!review) throw new Error('Review not found.'); const joke = jokes.find(item => item.id === review.jokeId); if (!joke) throw new Error('Joke not found.'); const now = new Date().toISOString(); const revisionId = createUuid(); const nextVersion = Math.max(0, ...joke.versions.map(version => version.version)) + 1; await updateJoke(joke.id, { versions: [...joke.versions, { id: revisionId, version: nextVersion, setup: joke.setup, punchline: joke.punchline, tag: joke.tag, callback: joke.callback, createdAt: now, note: `Revision from performance review${review.note ? `: ${review.note}` : ''}` }] }); await saveReview({ ...review, id: review.id, revisionJokeVersionId: revisionId }); return revisionId; }, [jokes, saveReview, updateJoke]);
  const finishSession = useCallback(async (id: string, recordingId?: string) => { await updateSession(id, { status: 'review', endedAt: new Date().toISOString(), recordingId }); }, [updateSession]);

  const value = useMemo(() => ({ sessions: snapshot.sessions, events: snapshot.events, reviews: snapshot.reviews, loading, createSession, updateSession, markJoke, correctJokeMarker, saveReview, createRevisionFromReview, finishSession }), [snapshot, loading, createSession, updateSession, markJoke, correctJokeMarker, saveReview, createRevisionFromReview, finishSession]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePerformanceSessions() { const value = useContext(Context); if (!value) throw new Error('usePerformanceSessions must be used inside PerformanceSessionProvider'); return value; }

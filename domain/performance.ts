import type { CrowdType, Joke, JokeVersion } from '@/context/DataContext';

export type PerformanceSessionStatus = 'setup' | 'live' | 'review' | 'complete' | 'abandoned';
export type ReviewDecision = 'keep' | 'rework' | 'undecided';

export interface PerformanceSession {
  id: string; userId: string; gigId?: string; setlistId: string; recordingId?: string;
  audienceType: CrowdType; status: PerformanceSessionStatus; recordAudio: boolean; showTeleprompter: boolean;
  startedAt: string; endedAt?: string; timezone: string; notes?: string; createdAt: string; updatedAt: string;
}
export interface SessionJokeEvent {
  id: string; userId: string; sessionId: string; jokeId: string; jokeVersionId?: string;
  setlistPosition: number; timestampMs: number; recordingTimestampMs: number;
  eventType: 'start' | 'marker' | 'correction' | 'end'; createdAt: string; updatedAt: string;
}
export interface SessionJokeReview {
  id: string; userId: string; sessionId: string; jokeId: string; jokeVersionId?: string; eventId?: string;
  rating?: number; laughScore?: number; audienceType?: CrowdType; decision: ReviewDecision; note?: string;
  reactionNote?: string; segmentStartMs?: number; gigId?: string; setlistId?: string;
  revisionJokeVersionId?: string; createdAt: string; updatedAt: string;
}

export function createUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16); const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function validateSessionSetup(input: { setlistId?: string; audienceType?: CrowdType }): string[] {
  const errors: string[] = [];
  if (!input.setlistId) errors.push('Choose a setlist.');
  if (!input.audienceType) errors.push('Choose an audience.');
  return errors;
}

export function validateReview(input: Pick<SessionJokeReview, 'rating' | 'laughScore'>): string[] {
  const errors: string[] = [];
  if (input.rating !== undefined && (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)) errors.push('Rating must be from 1 to 5.');
  if (input.laughScore !== undefined && (!Number.isFinite(input.laughScore) || input.laughScore < 0 || input.laughScore > 100)) errors.push('Laugh score must be from 0 to 100.');
  return errors;
}

export function orderMarkers(events: SessionJokeEvent[]): SessionJokeEvent[] {
  return [...events].sort((a, b) => a.timestampMs - b.timestampMs || a.setlistPosition - b.setlistPosition || a.id.localeCompare(b.id));
}

export function correctMarker(events: SessionJokeEvent[], eventId: string, timestampMs: number): SessionJokeEvent[] {
  const now = new Date().toISOString();
  return orderMarkers(events.map(event => event.id === eventId ? { ...event, timestampMs: Math.max(0, timestampMs), recordingTimestampMs: Math.max(0, timestampMs), eventType: 'correction', updatedAt: now } : event));
}

export interface VersionOutcome {
  version: JokeVersion; performances: number; ratingAverage: number | null; ratingSamples: number;
  laughAverage: number | null; laughSamples: number; audiences: string[]; recentNotes: string[]; insufficientData: boolean;
}
export function compareVersionOutcomes(joke: Joke, reviews: SessionJokeReview[]): VersionOutcome[] {
  return joke.versions.map(version => {
    const samples = reviews.filter(review => review.jokeId === joke.id && review.jokeVersionId === version.id);
    const rated = samples.filter(review => review.rating !== undefined); const laughed = samples.filter(review => review.laughScore !== undefined);
    return {
      version, performances: samples.length,
      ratingAverage: rated.length ? rated.reduce((sum, item) => sum + (item.rating ?? 0), 0) / rated.length : null, ratingSamples: rated.length,
      laughAverage: laughed.length ? laughed.reduce((sum, item) => sum + (item.laughScore ?? 0), 0) / laughed.length : null, laughSamples: laughed.length,
      audiences: Array.from(new Set(samples.map(item => item.audienceType).filter(Boolean) as string[])),
      recentNotes: samples.filter(item => item.note).slice(-3).map(item => item.note as string), insufficientData: samples.length < 3,
    };
  });
}

export interface SoundPacerState { smoothedDb: number; noiseFloorDb: number; speaking: boolean; silenceMs: number; calibrated: boolean; }
export interface SoundPacerOptions { sensitivity: number; sampleMs: number; graceMs: number; smoothing?: number; }
export const initialSoundPacerState = (noiseFloorDb = -60): SoundPacerState => ({ smoothedDb: noiseFloorDb, noiseFloorDb, speaking: false, silenceMs: 0, calibrated: false });
export function soundThreshold(noiseFloorDb: number, sensitivity: number): number {
  return Math.min(-18, noiseFloorDb + 18 - Math.max(0, Math.min(1, sensitivity)) * 12);
}
export function updateSoundPacer(state: SoundPacerState, meteringDb: number | undefined, options: SoundPacerOptions): SoundPacerState {
  if (meteringDb === undefined || !Number.isFinite(meteringDb)) return { ...state, speaking: false, silenceMs: state.silenceMs + options.sampleMs };
  const smoothing = options.smoothing ?? 0.28; const smoothedDb = state.smoothedDb + (meteringDb - state.smoothedDb) * smoothing;
  const energy = smoothedDb > soundThreshold(state.noiseFloorDb, options.sensitivity); const silenceMs = energy ? 0 : state.silenceMs + options.sampleMs;
  return { ...state, smoothedDb, speaking: energy || (state.speaking && silenceMs < options.graceMs), silenceMs };
}
export function calibratedNoiseFloor(samples: number[]): number {
  const finite = samples.filter(Number.isFinite).sort((a, b) => a - b); if (!finite.length) return -60;
  return finite[Math.min(finite.length - 1, Math.floor(finite.length * 0.7))];
}
export function pacedPixelsPerSecond(baseSpeed: number, state: SoundPacerState): number {
  if (state.speaking) return baseSpeed; if (state.silenceMs < 900) return baseSpeed * 0.35; return 0;
}

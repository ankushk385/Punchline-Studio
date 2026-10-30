import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { Upload } from 'tus-js-client';

import type { Recording } from '@/context/DataContext';
import { requireSupabaseConfiguration, supabase } from '@/lib/supabase';

export const RECORDING_BUCKET = 'standup-recordings';
const CHUNK_SIZE = 6 * 1024 * 1024;

function extensionFor(uri: string, mimeType?: string) {
  const match = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  if (match?.[1]) return match[1].toLowerCase();
  if (mimeType === 'audio/webm') return 'webm';
  if (mimeType === 'audio/aac') return 'aac';
  return 'm4a';
}

function mimeTypeFor(extension: string) {
  if (extension === 'webm') return 'audio/webm';
  if (extension === 'aac') return 'audio/aac';
  return 'audio/mp4';
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((tag): tag is string => typeof tag === 'string');
}

async function upsertRecordingMetadata(
  userId: string,
  recording: Recording,
  storagePath: string,
  mimeType: string,
) {
  const { error } = await supabase.from('standup_recordings').upsert({
    id: recording.id,
    user_id: userId,
    name: recording.name,
    storage_path: storagePath,
    duration_ms: Math.max(0, Math.round(recording.duration)),
    mime_type: mimeType,
    joke_id: recording.jokeId ?? null,
    idea_id: recording.ideaId ?? null,
    setlist_id: recording.setlistId ?? null,
    kind: recording.kind ?? 'performance',
    is_best_take: Boolean(recording.isBestTake),
    notes: recording.notes ?? '',
    tags: normalizeTags(recording.tags),
    created_at: recording.createdAt,
    updated_at: recording.updatedAt ?? new Date().toISOString(),
    deleted_at: null,
  }, { onConflict: 'id' });
  if (error) throw error;
}

async function uploadFile(uri: string, storagePath: string, mimeType: string, onProgress?: (fraction: number) => void) {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) throw new Error('Log in before uploading recordings.');

  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('The local audio file could not be read.');
    const blob = await response.blob();
    onProgress?.(0.1);
    const { error } = await supabase.storage
      .from(RECORDING_BUCKET)
      .upload(storagePath, blob, { contentType: mimeType, upsert: true });
    if (error) throw error;
    onProgress?.(1);
    return;
  }

  const file = new File(uri);
  if (!file.exists) throw new Error('The local audio file no longer exists.');

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/upload/resumable',
      headers: {
        authorization: 'Bearer ' + session.access_token,
        apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
        'x-upsert': 'true',
      },
      metadata: {
        bucketName: RECORDING_BUCKET,
        objectName: storagePath,
        contentType: mimeType,
        cacheControl: '3600',
      },
      chunkSize: CHUNK_SIZE,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      removeFingerprintOnSuccess: true,
      onError: reject,
      onProgress: (uploaded, total) => onProgress?.(total ? uploaded / total : 0),
      onSuccess: () => resolve(),
    });

    upload.findPreviousUploads()
      .then(previous => {
        if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      })
      .catch(reject);
  });
}

export async function uploadRecording(
  recording: Recording,
  onProgress?: (fraction: number) => void,
) {
  requireSupabaseConfiguration();
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) throw new Error('Log in before uploading recordings.');

  const extension = extensionFor(recording.uri, recording.mimeType);
  const mimeType = recording.mimeType || mimeTypeFor(extension);
  const storagePath = session.user.id + '/' + recording.id + '.' + extension;

  await uploadFile(recording.uri, storagePath, mimeType, onProgress);
  await upsertRecordingMetadata(session.user.id, recording, storagePath, mimeType);
  return { storagePath, mimeType };
}

/**
 * Metadata-only update for cloud-backed recordings (rename, notes, tags, best
 * take). The audio object is untouched.
 */
export async function updateCloudRecordingMetadata(recording: Recording) {
  requireSupabaseConfiguration();
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) throw new Error('Log in before updating recordings.');
  if (!recording.cloudPath) throw new Error('This recording has no cloud copy yet.');
  const extension = extensionFor(recording.cloudPath, recording.mimeType);
  const mimeType = recording.mimeType || mimeTypeFor(extension);
  await upsertRecordingMetadata(session.user.id, recording, recording.cloudPath, mimeType);
}

export async function getSignedRecordingUrl(storagePath: string) {
  requireSupabaseConfiguration();
  const { data, error } = await supabase.storage
    .from(RECORDING_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Hard-deletes the private audio object and its metadata row, then records a
 * tombstone so a stale offline device cannot resurrect the recording.
 */
export async function deleteCloudRecording(id: string, storagePath?: string) {
  requireSupabaseConfiguration();
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) throw new Error('Log in before deleting recordings.');

  if (storagePath) {
    const { error } = await supabase.storage.from(RECORDING_BUCKET).remove([storagePath]);
    if (error) throw error;
  }
  const { error } = await supabase
    .from('standup_recordings')
    .delete()
    .eq('id', id)
    .eq('user_id', session.user.id);
  if (error) throw error;

  const { error: tombstoneError } = await supabase
    .from('standup_recording_tombstones')
    .upsert({
      user_id: session.user.id,
      recording_id: id,
      deleted_at: new Date().toISOString(),
    }, { onConflict: 'user_id,recording_id' });
  if (tombstoneError) throw tombstoneError;
}

export async function fetchCloudRecordings(userId?: string): Promise<Recording[]> {
  requireSupabaseConfiguration();
  let query = supabase
    .from('standup_recordings')
    .select('*')
    .order('updated_at', { ascending: false });
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id,
    name: row.name,
    uri: '',
    duration: Number(row.duration_ms),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
    jokeId: row.joke_id ?? undefined,
    ideaId: row.idea_id ?? undefined,
    setlistId: row.setlist_id ?? undefined,
    kind: row.kind ?? 'performance',
    isBestTake: Boolean(row.is_best_take),
    notes: row.notes ?? '',
    tags: normalizeTags(row.tags),
    cloudPath: row.storage_path,
    mimeType: row.mime_type,
    uploadStatus: row.deleted_at ? 'local' : 'synced',
    uploadProgress: 1,
  } as Recording));
}

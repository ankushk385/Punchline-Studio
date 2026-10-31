import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { requireSupabaseConfiguration, supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

const APP_SCHEME = 'punchlinestudio';
export const authRedirectTo = Linking.createURL('auth/callback', { scheme: APP_SCHEME });

function getOAuthParams(url: string) {
  const parsed = new URL(url);
  const query = parsed.searchParams;
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  return {
    code: query.get('code'),
    accessToken: query.get('access_token') ?? fragment.get('access_token'),
    refreshToken: query.get('refresh_token') ?? fragment.get('refresh_token'),
    error:
      query.get('error_description') ??
      fragment.get('error_description') ??
      query.get('error') ??
      fragment.get('error'),
  };
}

export async function createSessionFromUrl(url: string) {
  requireSupabaseConfiguration();
  const params = getOAuthParams(url);
  if (params.error) throw new Error(params.error);

  if (params.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw error;
    return data.session;
  }

  if (params.accessToken && params.refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: params.accessToken,
      refresh_token: params.refreshToken,
    });
    if (error) throw error;
    return data.session;
  }

  return null;
}

export async function signInWithGoogle() {
  requireSupabaseConfiguration();
  const redirectTo = authRedirectTo;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Google sign-in could not be started.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === 'success') {
    const session = await createSessionFromUrl(result.url);
    if (!session) throw new Error('Google sign-in did not return a session.');
    return session;
  }
  if (result.type === 'cancel' || result.type === 'dismiss') return null;
  throw new Error('Google sign-in did not complete.');
}


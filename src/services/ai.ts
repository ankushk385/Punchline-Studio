import { supabase } from '@/lib/supabase';

export type AiChatResponse = {
  response: string;
  provider: string;
  model: string;
};

export async function callAiChat(prompt: string, context?: string, type?: 'premise' | 'jokes' | 'feedback' | 'general'): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.functions.invoke<AiChatResponse>('ai-chat', { body: { prompt, context, type } });
  if (error) throw error;
  if (!data?.response) throw new Error('The AI assistant did not return a response.');
  return data.response;
}

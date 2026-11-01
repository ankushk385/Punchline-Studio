import { corsHeaders, error, json } from '../_shared/http.ts';
import { userClient } from '../_shared/clients.ts';

type RequestBody = { prompt?: string; context?: string; type?: 'premise' | 'jokes' | 'feedback' | 'general'; action?: 'health' };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return error('method_not_allowed', 'Use POST.', 405);
  try {
    if (!request.headers.get('Authorization')) {
      return error('unauthorized', 'A valid user session is required.', 401);
    }
    const client = userClient(request);
    const { data: claims } = await client.auth.getClaims();
    let userId = claims?.claims?.sub || (claims as any)?.sub;
    if (!userId) {
      const { data: userData } = await client.auth.getUser();
      userId = userData?.user?.id;
    }
    if (!userId) return error('unauthorized', 'A valid user session is required.', 401);

    const body = await request.json() as RequestBody;
    const providerKey = Deno.env.get('GEMINI_API_KEY') ?? Deno.env.get('GOOGLE_API_KEY');
    const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-lite-latest';
    if (!providerKey) return error('provider_unavailable', 'The AI provider is not configured.', 503);
    if (body.action === 'health') return json({ ok: true, provider: 'gemini', checkedAt: new Date().toISOString() });

    const prompt = body.prompt?.trim() ?? '';
    if (!prompt || prompt.length > 4000) return error('invalid_prompt', 'Prompt must contain 1 to 4,000 characters.');

    const systemInstruction = `You are a helpful stand-up comedy assistant for Punchline Studio.
Be practical, specific, and actionable.
Give concrete suggestions with examples when helpful.
Keep responses concise but useful.`;

    const userText = body.context ? `Context:\n${body.context}\n\nRequest:\n${prompt}` : prompt;

    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${providerKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: { maxOutputTokens: 800, temperature: 0.8 },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Gemini error:', errText);
      return error('provider_error', 'The AI assistant is temporarily unavailable.', 503);
    }

    const data = await resp.json();
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!answer) return error('empty_provider_response', 'The AI assistant returned no usable response.', 503);

    return json({ response: answer, provider: 'gemini', model });
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : 'Unknown ai-chat error');
    return error('internal_error', 'The AI assistant could not complete the request.', 500);
  }
});

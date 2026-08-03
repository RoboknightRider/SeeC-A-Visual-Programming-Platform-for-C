export type AIProvider = 'gemini' | 'local';

export interface ChatMessage {
  sender?: 'user' | 'ai' | string;
  text?: string;
}

interface AIRequestPayload {
  prompt?: string;
  messages?: Array<{ sender?: string; text?: string }>;
  systemInstruction?: string;
}

interface ParsedAIRequestPayload {
  prompt: string;
  messages?: Array<{ sender?: string; text?: string }>;
  systemInstruction?: string;
}

interface GeminiServerClient {
  models: {
    generateContent: (args: {
      model: string;
      contents: string;
      config: { systemInstruction: string };
    }) => Promise<{ text?: string }>;
  };
}

export interface AIResponse {
  text: string;
  usedProvider: AIProvider;
}

export function normalizeGeminiApiKey(rawKey?: string): string | null {
  const key = rawKey?.trim();
  const normalizedKey = key?.replace(/^['"]|['"]$/g, '');
  return normalizedKey || null;
}

export function parseAIRequestPayload(body: AIRequestPayload): ParsedAIRequestPayload | { error: string } {
  const { prompt, messages, systemInstruction } = body;
  if (!prompt || typeof prompt !== 'string') {
    return { error: 'A prompt is required.' };
  }

  return { prompt, messages, systemInstruction };
}

function buildFallbackNotice(reason: string): string {
  return `Gemini is temporarily unavailable (${reason}), so I switched to Local AI for this reply.`;
}

function getGeminiFailureReason(status: number, apiError?: string): string {
  if (status === 429) return 'quota or rate limit reached';
  if (status === 401 || status === 403) return 'authentication or permission error';
  if (status === 500) return 'Gemini API key is not configured on the server';
  if (status >= 500) return 'Gemini service error';
  if (apiError && apiError.trim()) return apiError;
  return `request failed with status ${status}`;
}

export const SYSTEM_INSTRUCTION = `You are SeeC Tutor, a practical C programming assistant focused on C programming and computer science.`;

export async function generateGeminiServerResponse(
  geminiClient: GeminiServerClient,
  prompt: string,
  _messages: ChatMessage[] = [],
  systemInstruction: string = SYSTEM_INSTRUCTION
): Promise<string> {
  const response = await geminiClient.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      systemInstruction,
    },
  });

  return response.text || 'No response received.';
}

export async function generateLocalServerResponse(
  prompt: string,
  messages: ChatMessage[] = [],
  endpoint: string,
  systemInstruction?: string
): Promise<string> {
  const formattedMessages = [
    ...(systemInstruction?.trim() ? [{ role: 'system' as const, content: systemInstruction }] : []),
    ...(messages || [])
      .filter((message) => message?.sender && typeof message.text === 'string')
      .map((message) => ({
        role: message.sender === 'user' ? 'user' : 'assistant',
        content: message.text || '',
      })) as Array<{ role: 'user' | 'assistant'; content: string }>,
    { role: 'user' as const, content: prompt },
  ];

  const localResponse = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: formattedMessages,
    }),
  });

  if (!localResponse.ok) {
    throw new Error(`Local AI request failed with status ${localResponse.status}`);
  }

  const data = await localResponse.json();
  return data.choices?.[0]?.message?.content || 'No local response generated.';
}

export async function askLocalAI(
  prompt: string,
  messages: ChatMessage[] = [],
  systemInstruction?: string
): Promise<string> {
  try {
    const response = await fetch('/api/local-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        messages,
        systemInstruction,
      }),
    });

    if (!response.ok) {
      throw new Error('Local AI unavailable');
    }

    const data = await response.json();
    return data.text || data.response || 'No response received.';
  } catch (error) {
    return 'Error connecting to local SeeC Tutor AI.';
  }
}

export async function askGemini(
  prompt: string,
  messages: Array<{ sender: 'user' | 'ai'; text: string }> = []
): Promise<AIResponse> {
  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, messages, systemInstruction: SYSTEM_INSTRUCTION }),
    });
    const raw = await response.text();
    let data: Record<string, unknown> = {};
    if (raw.trim()) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object') {
          data = parsed as Record<string, unknown>;
        } else {
          data = { error: raw };
        }
      } catch {
        data = { error: raw };
      }
    }

    const text = typeof data.text === 'string' ? data.text : undefined;
    const directError = typeof data.error === 'string' ? data.error : undefined;
    const nestedError = data.error && typeof data.error === 'object'
      ? (data.error as Record<string, unknown>).message
      : undefined;
    const messageError = typeof data.message === 'string' ? data.message : undefined;
    const apiError = directError || (typeof nestedError === 'string' ? nestedError : undefined) || messageError;

    if (!response.ok) {
      const reason = getGeminiFailureReason(response.status, apiError);
      const fallbackText = await askLocalAI(prompt, messages, SYSTEM_INSTRUCTION);
      return {
        text: `${buildFallbackNotice(reason)}\n\n${fallbackText}`,
        usedProvider: 'local',
      };
    }

    return { text: text || 'No response received.', usedProvider: 'gemini' };
  } catch (error) {
    const reason = typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'internet appears to be offline'
      : 'network error while contacting Gemini';
    const fallbackText = await askLocalAI(prompt, messages, SYSTEM_INSTRUCTION);
    return {
      text: `${buildFallbackNotice(reason)}\n\n${fallbackText}`,
      usedProvider: 'local',
    };
  }
}

export async function askAI(
  prompt: string,
  messages: Array<{ sender: 'user' | 'ai'; text: string }> = [],
  provider: AIProvider = 'gemini'
): Promise<AIResponse> {
  if (provider === 'local') {
    const text = await askLocalAI(prompt, messages);
    return { text, usedProvider: 'local' };
  }

  return await askGemini(prompt, messages);
}
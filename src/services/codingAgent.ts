export type AIProvider = 'gemini' | 'local';

export interface AIResponse {
  text: string;
  usedProvider: AIProvider;
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

export const SYSTEM_INSTRUCTION = `
You are SeeC Tutor, a practical C programming assistant.

Rules:
1. Focus on C programming and computer science.
2. If the user asks for an example, provide correct, compilable C code in a fenced code block.
3. If the user provides a compiler/runtime error, explain the likely cause and show a fixed code snippet.
4. Keep explanations concise and actionable.
5. Never output meta labels like "Error Type", "Explanation", "User", or "Assistant".
`;

export async function askLocalAI(
  prompt: string,
  messages: Array<{ sender?: string; text?: string }> = [],
  systemInstruction?: string
): Promise<string> {
  try {
    const response = await fetch('/api/local-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        messages,
        systemInstruction: systemInstruction || SYSTEM_INSTRUCTION,
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

    const data = (await response.json()) as { text?: string; error?: string };

    if (!response.ok) {
      const reason = getGeminiFailureReason(response.status, data.error);
      const fallbackText = await askLocalAI(prompt, messages, SYSTEM_INSTRUCTION);
      return {
        text: `${buildFallbackNotice(reason)}\n\n${fallbackText}`,
        usedProvider: 'local',
      };
    }

    return { text: data.text || 'No response received.', usedProvider: 'gemini' };
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
    const text = await askLocalAI(prompt, messages, SYSTEM_INSTRUCTION);
    return { text, usedProvider: 'local' };
  }

  return await askGemini(prompt, messages);
}
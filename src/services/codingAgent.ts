export type AIProvider = 'gemini' | 'local';

export interface ChatMessage {
  sender?: 'user' | 'ai' | string;
  text?: string;
}

interface AIRequestPayload {
  prompt?: string;
  messages?: Array<{ sender?: string; text?: string }>;
  systemInstruction?: string;
  contextSummary?: string;
}

interface ParsedAIRequestPayload {
  prompt: string;
  messages?: Array<{ sender?: string; text?: string }>;
  systemInstruction?: string;
  contextSummary?: string;
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
  const { prompt, messages, systemInstruction, contextSummary } = body;
  if (!prompt || typeof prompt !== 'string') {
    return { error: 'A prompt is required.' };
  }

  return { prompt, messages, systemInstruction, contextSummary };
}

export function compactChatHistory(messages: ChatMessage[] = [], maxMessages = 12): ChatMessage[] {
  if (!Array.isArray(messages) || messages.length <= maxMessages) {
    return messages;
  }

  return messages.slice(messages.length - maxMessages);
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

export const SYSTEM_INSTRUCTION = `You are SeeC AI, a friendly, patient, and expert C programming tutor for absolute beginners. 

Your goal is to guide students step-by-step using clear, real-world analogies, clean C code, and simple language without overwhelming technical jargon.

### CORE BEHAVIOR RULES:
1. GREETINGS & CASUAL TALK: Respond naturally and warmly. Do NOT generate code blocks for greetings, identity questions, or simple chat.

2. SCOPE BOUNDARY: You ONLY answer questions related to C programming, computer science fundamentals, or software logic. If a user asks about outside topics (cooking, finance, Python web scraping, generic life advice), politely decline and offer to help with C programming instead.

3. EXPLANATIONS (THE "BIBLE" METHOD): 
   - Start with an intuitive real-world analogy.
   - Break down the syntax step-by-step using clear definitions without heavy jargon.
   - Provide a clean, minimal, working C code example inside standard \`\`\`c markdown blocks.
   - Briefly explain what the code output will be.
   - For each concept, provide its real-world analogy, definition, and a short code snippet. Keep explanations concise and structured so it remains digestible without dragging on unnecessarily.

4. SAFETY & EXPLOITS: Never write or assist with exploits, buffer overflow attacks, keyloggers, auth bypasses, or malicious memory manipulation. Politely decline and explain the safe, intended software development pattern instead.

5. NO HALLUCINATED ATTRIBUTIONS: Do not insult the user or invent fake GitHub handles, creators, or origins unless explicitly specified in system context.
`; 

export async function generateGeminiServerResponse(
  geminiClient: GeminiServerClient,
  prompt: string,
  messages: ChatMessage[] = [],
  systemInstruction: string = SYSTEM_INSTRUCTION,
  contextSummary?: string
): Promise<string> {
  const parts: string[] = [];
  if (systemInstruction?.trim()) {
    parts.push(systemInstruction.trim());
  }
  if (contextSummary?.trim()) {
    parts.push(`Conversation summary:\n${contextSummary.trim()}`);
  }
  if (messages.length > 0) {
    const conversationText = messages
      .map((message) => `${message.sender === 'user' ? 'User' : 'Assistant'}: ${message.text}`)
      .join('\n');
    parts.push(conversationText);
  }
  parts.push(`User: ${prompt}`);

  const contents = parts.join('\n\n');
  const response = await geminiClient.models.generateContent({
    model: 'gemini-2.5-flash',
    contents,
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
  systemInstruction?: string,
  contextSummary?: string
): Promise<string> {
  const safeMessages = compactChatHistory(messages, 12);
  const formattedMessages = [
    ...(systemInstruction?.trim() ? [{ role: 'system' as const, content: systemInstruction }] : []),    ...(contextSummary?.trim()
      ? [{ role: 'system' as const, content: `Conversation summary:\n${contextSummary.trim()}` }]
      : []),    ...(safeMessages || [])
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
  systemInstruction?: string,
  contextSummary?: string
): Promise<string> {
  try {
    const safeMessages = compactChatHistory(messages, 12);
    const response = await fetch('/api/local-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        messages: safeMessages,
        systemInstruction,
        contextSummary,
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
  messages: Array<{ sender: 'user' | 'ai'; text: string }> = [],
  contextSummary?: string
): Promise<AIResponse> {
  try {
    const safeMessages = compactChatHistory(messages, 12);
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, messages: safeMessages, systemInstruction: SYSTEM_INSTRUCTION, contextSummary }),
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
      const fallbackText = await askLocalAI(prompt, safeMessages, SYSTEM_INSTRUCTION, contextSummary);
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
    const fallbackText = await askLocalAI(prompt, messages, SYSTEM_INSTRUCTION, contextSummary);
    return {
      text: `${buildFallbackNotice(reason)}\n\n${fallbackText}`,
      usedProvider: 'local',
    };
  }
}

export async function askAI(
  prompt: string,
  messages: Array<{ sender: 'user' | 'ai'; text: string }> = [],
  provider: AIProvider = 'gemini',
  contextSummary?: string
): Promise<AIResponse> {
  if (provider === 'local') {
    const text = await askLocalAI(prompt, messages, SYSTEM_INSTRUCTION, contextSummary);
    return { text, usedProvider: 'local' };
  }

  return await askGemini(prompt, messages, contextSummary);
}
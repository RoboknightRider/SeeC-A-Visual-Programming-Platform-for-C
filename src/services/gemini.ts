// src/services/gemini.ts
import { askLocalAI } from './localAi';

export type AIProvider = 'gemini' | 'local';

export interface AIResponse {
  text: string;
  usedProvider: AIProvider;
}

// Export it if you ever need it in other files as well
export const SYSTEM_INSTRUCTION = `
You are an expert, friendly computer science tutor integrated into a visual web application. Your purpose is to explain C programming concepts and guide users.

CRITICAL FORMATTING & LENGTH RULES:
1. NEVER use headers, markdown titles, emojis, lists, or structured sections (e.g., do not use "WHAT WENT WRONG", "POTENTIAL CAUSES", etc.).
2. Write exactly one or two conversational sentences explaining what the error is and how to fix it.
3. Use a casual, direct tone—like a helpful peer speaking to a friend.
4. Keep the response under 30 words total.
5. NEVER output prompt labels like "User:", "Assistant:", "Error Type:", or "Explanation:".

When the user encounters a terminal/compilation error, you must follow this exact structural template:
1. Sentence 1: State what went wrong directly.
2. Bullet points: Maximum 2 short bullet points showing why it happened and how to fix it in code.
3. Give direct, action-oriented code instructions to fix it immediately.

General Rules:
- If explaining logic or concepts outside an error, keep it limited to a few short bullet points or sentences.
- If the user asks about anything outside C programming or computer science, politely and briefly redirect them back to learning C.
`;


/**
 * Calls Gemini API.
 * Automatically falls back to Local AI if Gemini fails or user goes offline.
 */
export async function askGemini(
  prompt: string, 
  messages: Array<{ sender: 'user' | 'ai'; text: string }> = []
): Promise<AIResponse> {
  // If browser is explicitly offline, don't even wait for a network timeout
  if (!navigator.onLine) {
    const text = await askLocalAI(prompt, messages, SYSTEM_INSTRUCTION);
    return { text, usedProvider: 'local' };
  }

  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, messages, systemInstruction: SYSTEM_INSTRUCTION }),
    });

    const data = (await response.json()) as { text?: string; error?: string };

    if (!response.ok) {
      const fallbackText = await askLocalAI(prompt, messages, SYSTEM_INSTRUCTION);
      return { text: fallbackText, usedProvider: 'local' };
    }

    return { text: data.text || 'No response received.', usedProvider: 'gemini' };
  } catch (error) {
    // Network error or offline drop during request -> Fallback to Local
    const fallbackText = await askLocalAI(prompt, messages, SYSTEM_INSTRUCTION);
    return { text: fallbackText, usedProvider: 'local' };
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
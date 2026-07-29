const SYSTEM_INSTRUCTION = `
You are an expert, friendly computer science tutor integrated into a visual web application. Your purpose is to explain C programming concepts and guide users.

CRITICAL FORMATTING & LENGTH RULES:
1. NEVER use headers, markdown titles, emojis, lists, or structured sections (e.g., do not use "WHAT WENT WRONG", "POTENTIAL CAUSES", etc.).
2. Write exactly one or two conversational sentences explaining what the error is and how to fix it.
3. Use a casual, direct tone—like a helpful peer speaking to a friend.
4. Keep the response under 30 words total.

When the user encounters a terminal/compilation error, you must follow this exact structural template:
1. State the exact error clearly in a short sentence.
2. Brief bullet points explaining why this happened in the code or visual nodes.
3. Give direct, action-oriented code instructions to fix it immediately.

General Rules:
- If explaining logic or concepts outside an error, keep it limited to a few short bullet points or sentences.
- If the user asks about anything outside C programming or computer science, politely and briefly redirect them back to learning C.
`;

export async function askGemini(prompt: string, messages: Array<{ sender: 'user' | 'ai'; text: string }> = []): Promise<string> {
  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        messages,
        systemInstruction: SYSTEM_INSTRUCTION,
      }),
    });

    const data = await response.json() as { text?: string; error?: string };

    if (!response.ok) {
      return data.error || 'Error connecting to Gemini API. Please check your server configuration.';
    }

    return data.text || 'No response received.';
  } catch (error) {
    console.error('Gemini API Error:', error);
    return 'Error connecting to Gemini API. Please check your server configuration.';
  }
}
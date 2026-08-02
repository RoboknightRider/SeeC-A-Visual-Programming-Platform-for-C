// src/services/localAi.ts
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
        systemInstruction, 
      })
    });

    if (!response.ok) {
      throw new Error("Local AI unavailable");
    }

    const data = await response.json();
    return data.text || data.response || "No response received.";
  } catch (err) {
    return "Error connecting to local SeeC Tutor AI.";
  }
}
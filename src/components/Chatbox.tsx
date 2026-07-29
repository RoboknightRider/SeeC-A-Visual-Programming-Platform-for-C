import React, { useState, useCallback, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Loader2, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils'; 
import { askGemini } from '../services/gemini';

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
}

interface MessageSegment {
  type: 'text' | 'code';
  content: string;
  language?: string;
}

interface ChatboxProps {
  showChat: boolean;
  setShowChat: (show: boolean) => void;
  initialError?: string;               
  clearInitialError?: () => void;
}

export const Chatbox: React.FC<ChatboxProps> = ({ 
  showChat, 
  setShowChat,
  initialError,        
  clearInitialError    
}) => {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', sender: 'ai', text: "Hello! I am your SeeC AI Assistant. How can I help you today?" }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const parseMessageSegments = useCallback((text: string): MessageSegment[] => {
    const segments: MessageSegment[] = [];
    const regex = /```([\w-]*)\s*([\s\S]*?)```/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const plainText = text.slice(lastIndex, match.index).trim();
        if (plainText) {
          segments.push({ type: 'text', content: plainText });
        }
      }

      const language = match[1]?.trim();
      const codeContent = match[2]?.trim() || '';
      segments.push({ type: 'code', content: codeContent, language: language || undefined });
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      const tail = text.slice(lastIndex).trim();
      if (tail) {
        segments.push({ type: 'text', content: tail });
      }
    }

    return segments;
  }, []);

  const handleCopyCode = useCallback(async (codeKey: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCodeKey(codeKey);
      window.setTimeout(() => {
        setCopiedCodeKey((current) => (current === codeKey ? null : current));
      }, 1200);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  }, []);

  const handleSendMessage = useCallback(async () => {
    const trimmedInput = chatInput.trim();
    if (!trimmedInput || isLoading) return;

    const userText = trimmedInput;
    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: userText
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setChatInput('');
    setIsLoading(true);

    const aiResponseText = await askGemini(userText, nextMessages);

    const aiReply: Message = {
      id: (Date.now() + 1).toString(),
      sender: 'ai',
      text: aiResponseText
    };
    
    setMessages(prev => [...prev, aiReply]);
    setIsLoading(false);
  }, [chatInput, isLoading, messages]);

  const handleAutoSendError = useCallback(async (errorText: string) => {
    setIsLoading(true);

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: `I encountered a compilation/execution error in my C code. Can you analyze this terminal log and guide me on how to fix my flow diagrams?\n\n\`\`\`text\n${errorText}\n\`\`\``
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);

    const aiResponseText = await askGemini(userMessage.text, nextMessages);

    const aiReply: Message = {
      id: (Date.now() + 1).toString(),
      sender: 'ai',
      text: aiResponseText
    };

    setMessages(prev => [...prev, aiReply]);
    setIsLoading(false);
  }, [messages]);

  useEffect(() => {
    if (initialError && initialError.trim() !== "" && showChat && !isLoading) {
      handleAutoSendError(initialError);

      if (clearInitialError) {
        clearInitialError();
      }
    }
  }, [initialError, showChat, isLoading, handleAutoSendError, clearInitialError]);

  if (!showChat) return null;

  return (
    <div className="fixed right-3 bottom-3 w-[min(24rem,calc(100vw-1.5rem))] max-h-[min(42rem,calc(100dvh-1.5rem))] h-[min(28rem,calc(100dvh-1.5rem))] bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-[999] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="text-blue-500 w-5 h-5" />
          <h3 className="text-sm font-bold text-white">SeeC AI Assistant</h3>
        </div>
        <button 
          type="button"
          onClick={() => setShowChat(false)} 
          className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors border border-zinc-800 bg-zinc-950"
        >
          <X size={14} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-black/10 font-sans text-xs flex flex-col">
        {messages.map((msg) => {
          const segments = msg.sender === 'ai' ? parseMessageSegments(msg.text) : [];

          return (
            <div 
              key={msg.id} 
              className={cn(
                "p-3 rounded-lg max-w-[85%] break-words border",
                msg.sender === 'user' 
                  ? "bg-blue-600/20 border-blue-500/40 text-blue-200 self-end" 
                  : "bg-zinc-800/60 border-zinc-700/40 text-zinc-300 self-start"
              )}
            >
              {msg.sender === 'ai' && segments.length > 0 ? (
                <div className="space-y-2">
                  {segments.map((segment, index) => {
                    if (segment.type === 'code') {
                      const codeKey = `${msg.id}-${index}`;
                      return (
                        <div key={codeKey} className="overflow-hidden rounded-md border border-zinc-700 bg-zinc-950">
                          <div className="flex items-center justify-between border-b border-zinc-800 px-2 py-1">
                            <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                              {segment.language || 'code'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyCode(codeKey, segment.content)}
                              className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:text-white"
                            >
                              {copiedCodeKey === codeKey ? <Check size={12} /> : <Copy size={12} />}
                              {copiedCodeKey === codeKey ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                          <pre className="overflow-x-auto p-2">
                            <code className="whitespace-pre-wrap text-[11px] font-mono text-zinc-200">
                              {segment.content}
                            </code>
                          </pre>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={`${msg.id}-text-${index}`}
                        className={cn(
                          "prose prose-invert max-w-none text-xs space-y-1.5",
                          "[_&strong]:font-bold [&_strong]:text-white",
                          "[_&ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4",
                          "[_&code]:bg-zinc-950 [_&code]:px-1.5 [_&code]:py-0.5 [_&code]:rounded [_&code]:font-mono [_&code]:text-[11px]",
                          "[_&pre]:bg-zinc-950 [_&pre]:p-2 [_&pre]:rounded-md [_&pre]:my-2 [_&pre]:overflow-x-auto [_&pre_code]:bg-transparent [_&pre_code]:p-0"
                        )}
                      >
                        <ReactMarkdown>
                          {segment.content}
                        </ReactMarkdown>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  className={cn(
                    "prose prose-invert max-w-none text-xs space-y-1.5",
                    "[_&strong]:font-bold [&_strong]:text-white",
                    "[_&ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4",
                    "[_&code]:bg-zinc-950 [_&code]:px-1.5 [_&code]:py-0.5 [_&code]:rounded [_&code]:font-mono [_&code]:text-[11px]",
                    "[_&pre]:bg-zinc-950 [_&pre]:p-2 [_&pre]:rounded-md [_&pre]:my-2 [_&pre]:overflow-x-auto [_&pre_code]:bg-transparent [_&pre_code]:p-0"
                  )}
                >
                  <ReactMarkdown>
                    {msg.text}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          );
        })}
        
        {isLoading && (
          <div className="bg-zinc-800/40 border border-zinc-700/20 p-3 rounded-lg text-zinc-500 self-start flex items-center gap-2">
            <Loader2 size={12} className="animate-spin text-blue-500" />
            Thinking...
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Field */}
      <div className="px-3 py-2 border-t border-zinc-800 bg-zinc-900/50 flex gap-2 items-center shrink-0">
        <input 
          type="text" 
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSendMessage();
          }}
          disabled={isLoading}
          placeholder={isLoading ? "Thinking..." : "Ask a question..."} 
          className="flex-1 bg-black/40 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSendMessage}
          disabled={!chatInput.trim() || isLoading}
          className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 transition-colors"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
};
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Loader2, Copy, Check, Cpu, Globe, Maximize2, Minimize2, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils'; 
import { askAI, type AIProvider as GeminiAIProvider } from '../services/codingAgent';

type AIProvider = GeminiAIProvider | 'gemini' | 'local';

// 1. Updated Message interface to store provider in message state
interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  provider?: AIProvider; // <-- Stores who answered this specific message
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
  initialCode?: string;               
  clearInitialError?: () => void;
}

interface AIStatusResponse {
  geminiConfigured: boolean;
  local?: {
    executableExists?: boolean;
    modelExists?: boolean;
    processRunning?: boolean;
    available?: boolean;
  };
}

const AI_PROVIDER_SESSION_KEY = 'seec-ai-provider';
const DEFAULT_CHATBOX_WIDTH = 416;
const DEFAULT_CHATBOX_HEIGHT = 448;
const MIN_CHATBOX_WIDTH = 340;
const MIN_CHATBOX_HEIGHT = 320;
const INITIAL_CHAT_MESSAGES: Message[] = [
  { id: '1', sender: 'ai', text: 'Hello! I am your SeeC AI Assistant. How can I help you today?', provider: 'gemini' },
];

const getInitialProvider = (): AIProvider => {
  if (typeof window === 'undefined') {
    return 'gemini';
  }

  const saved = window.sessionStorage.getItem(AI_PROVIDER_SESSION_KEY);
  return saved === 'local' ? 'local' : 'gemini';
};

export const Chatbox: React.FC<ChatboxProps> = ({
  showChat,
  setShowChat,
  initialError,
  initialCode,        
  clearInitialError    
}) => {
  const [messages, setMessages] = useState<Message[]>(INITIAL_CHAT_MESSAGES);
  const [chatInput, setChatInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null);
  const [geminiAvailable, setGeminiAvailable] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chatboxSize, setChatboxSize] = useState({ width: DEFAULT_CHATBOX_WIDTH, height: DEFAULT_CHATBOX_HEIGHT });
  
  const [aiProvider, setAiProvider] = useState<AIProvider>(getInitialProvider);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const resizeStateRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    let isMounted = true;

    const fetchAIStatus = async () => {
      try {
        const response = await fetch('/api/ai-status');
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as AIStatusResponse;
        if (!isMounted) {
          return;
        }

        const configured = Boolean(data.geminiConfigured);
        setGeminiAvailable(configured);
        if (!configured) {
          setAiProvider('local');
        }
      } catch (error) {
        // Keep current defaults if status fetch fails.
      }
    };

    fetchAIStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.sessionStorage.setItem(AI_PROVIDER_SESSION_KEY, aiProvider);
  }, [aiProvider]);

  useEffect(() => {
    if (isFullscreen) {
      resizeStateRef.current = null;
    }
  }, [isFullscreen]);

  useEffect(() => {
    if (!showChat) {
      resizeStateRef.current = null;
    }
  }, [showChat]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const maxWidth = Math.max(MIN_CHATBOX_WIDTH, window.innerWidth - 24);
      const maxHeight = Math.max(MIN_CHATBOX_HEIGHT, window.innerHeight - 24);
      const nextWidth = Math.min(maxWidth, Math.max(MIN_CHATBOX_WIDTH, resizeState.startWidth + (resizeState.startX - event.clientX)));
      const nextHeight = Math.min(maxHeight, Math.max(MIN_CHATBOX_HEIGHT, resizeState.startHeight + (resizeState.startY - event.clientY)));

      setChatboxSize({ width: nextWidth, height: nextHeight });
    };

    const stopResize = () => {
      resizeStateRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
    };
  }, []);

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

  const handleClearChat = useCallback(() => {
    setMessages(INITIAL_CHAT_MESSAGES);
    setChatInput('');
    setCopiedCodeKey(null);
    setIsLoading(false);

    if (clearInitialError) {
      clearInitialError();
    }
  }, [clearInitialError]);

  const handleResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (isFullscreen) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    resizeStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: chatboxSize.width,
      startHeight: chatboxSize.height,
    };
  }, [chatboxSize.height, chatboxSize.width, isFullscreen]);

  // 2. Updated handleSendMessage to save provider into state
  const handleSendMessage = useCallback(async () => {
    const trimmedInput = chatInput.trim();
    if (!trimmedInput || isLoading) return;

    const userText = trimmedInput;
    const currentProvider = aiProvider;

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: userText
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setChatInput('');
    setIsLoading(true);

    const res = await askAI(userText, nextMessages, currentProvider);
    const actualProvider = res.usedProvider || currentProvider;

    const aiReply: Message = {
      id: (Date.now() + 1).toString(),
      sender: 'ai',
      text: res.text,
      provider: actualProvider
    };

    if (currentProvider === 'gemini' && actualProvider === 'local') {
      setAiProvider('local');
    }
    
    setMessages(prev => [...prev, aiReply]);
    setIsLoading(false);
  }, [chatInput, isLoading, messages, aiProvider]);

  // 3. Updated handleAutoSendError to save provider into state
  const handleAutoSendError = useCallback(async (errorText: string) => {
    setIsLoading(true);
    const currentProvider = aiProvider;

    let promptText = `I encountered a compilation/execution error in my C code. Can you analyze this terminal log and guide me on how to fix my flow diagrams?\n\n\`\`\`text\n${errorText}\n\`\`\``;
    if (initialCode && initialCode.trim()) {
      promptText += `\n\nHere's the generated C code:\n\`\`\`c\n${initialCode}\n\`\`\``;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: promptText
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);

    const res = await askAI(userMessage.text, nextMessages, currentProvider);
    const actualProvider = res.usedProvider || currentProvider;

    const aiReply: Message = {
      id: (Date.now() + 1).toString(),
      sender: 'ai',
      text: res.text,
      provider: actualProvider
    };

    if (currentProvider === 'gemini' && actualProvider === 'local') {
      setAiProvider('local');
    }

    setMessages(prev => [...prev, aiReply]);
    setIsLoading(false);
  }, [messages, aiProvider, initialCode]);

  useEffect(() => {
    if (initialError && initialError.trim() !== "" && showChat && !isLoading) {
      handleAutoSendError(initialError);

      if (clearInitialError) {
        clearInitialError();
      }
    }
  }, [initialError, initialCode, showChat, isLoading, handleAutoSendError, clearInitialError]);

  if (!showChat) return null;

  const chatboxStyle = isFullscreen
    ? {
        inset: '12px',
        width: 'auto',
        height: 'auto',
      }
    : {
        width: `${chatboxSize.width}px`,
        height: `${chatboxSize.height}px`,
      };

  return (
    <div
      className={cn(
        "fixed bg-zinc-900 border border-zinc-800 shadow-2xl z-[999] flex flex-col overflow-hidden",
        isFullscreen
          ? "rounded-xl"
          : "right-3 bottom-3 min-w-[340px] min-h-[320px] max-w-[calc(100vw-1.5rem)] max-h-[calc(100dvh-1.5rem)] rounded-xl"
      )}
      style={chatboxStyle}
    >
      
      {/* Header */}
      <div className="p-3 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <MessageSquare className="text-blue-500 w-4 h-4" />
          <h3 className="text-xs font-bold text-white hidden sm:block">SeeC AI</h3>
        </div>

        {/* Radio Switcher */}
        <div className="flex items-center bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-[11px]">
          <label
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-md cursor-pointer transition-all select-none",
              aiProvider === 'gemini'
                ? "bg-zinc-800 text-white font-medium shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <input
              type="radio"
              name="aiProvider"
              value="gemini"
              checked={aiProvider === 'gemini'}
              onChange={() => setAiProvider('gemini')}
              disabled={!geminiAvailable}
              className="sr-only"
            />
            <Globe className="w-3 h-3 text-emerald-400 shrink-0" />
            <span>{geminiAvailable ? 'Online AI' : 'Online AI (Unavailable)'}</span>
          </label>

          <label
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-md cursor-pointer transition-all select-none",
              aiProvider === 'local'
                ? "bg-zinc-800 text-white font-medium shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <input
              type="radio"
              name="aiProvider"
              value="local"
              checked={aiProvider === 'local'}
              onChange={() => setAiProvider('local')}
              className="sr-only"
            />
            <Cpu className="w-3 h-3 text-amber-400 shrink-0" />
            <span>Offline AI</span>
          </label>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleClearChat}
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors border border-zinc-800 bg-zinc-950"
            title="Clear chat history"
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen((current) => !current)}
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors border border-zinc-800 bg-zinc-950"
            title={isFullscreen ? 'Exit full screen' : 'Full screen'}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button 
            type="button"
            onClick={() => setShowChat(false)} 
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors border border-zinc-800 bg-zinc-950"
            title="Close chat"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-black/10 font-sans text-xs flex flex-col">
        {messages.map((msg) => {
          const segments = msg.sender === 'ai' ? parseMessageSegments(msg.text) : [];
          const isUser = msg.sender === 'user';
          
          // 4. Read stored provider from message state
          const isLocal = msg.provider === 'local';

          return (
            <div 
              key={msg.id} 
              className={cn(
                "p-3 rounded-lg max-w-[85%] break-words border transition-colors",
                isUser 
                  ? "bg-blue-600/20 border-blue-500/40 text-blue-200 self-end" 
                  : isLocal
                    ? "bg-amber-950/30 border-amber-500/30 text-amber-100 self-start" // Local AI Style
                    : "bg-emerald-950/30 border-emerald-500/30 text-emerald-100 self-start" // Gemini Style
              )}
            >
              {/* Render Provider Badge for AI messages */}
              {!isUser && (
                <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-semibold tracking-wide uppercase opacity-75">
                  {isLocal ? (
                    <>
                      <Cpu size={11} className="text-amber-400" />
                      <span className="text-amber-400">Offline AI</span>
                    </>
                  ) : (
                    <>
                      <Globe size={11} className="text-emerald-400" />
                      <span className="text-emerald-400">Online AI</span>
                    </>
                  )}
                </div>
              )}

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
                          "[&_strong]:font-bold [&_strong]:text-white",
                          "[&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4",
                          "[&_code]:bg-zinc-950 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-[11px]",
                          "[&_pre]:bg-zinc-950 [&_pre]:p-2 [&_pre]:rounded-md [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0"
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
                    "[&_strong]:font-bold [&_strong]:text-white",
                    "[&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4",
                    "[&_code]:bg-zinc-950 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-[11px]",
                    "[&_pre]:bg-zinc-950 [&_pre]:p-2 [&_pre]:rounded-md [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0"
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
          placeholder={isLoading ? "Thinking..." : `Ask ${aiProvider === 'local' ? 'Offline AI' : 'Online AI'}...`} 
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

      {!isFullscreen && (
        <div
          className="absolute left-0 top-0 z-10 h-full w-full pointer-events-none"
          aria-hidden="true"
        >
          <div
            className="absolute left-0 top-0 h-4 w-4 cursor-nwse-resize pointer-events-auto"
            onPointerDown={handleResizeStart}
            title="Resize chat window"
          />
        </div>
      )}
    </div>
  );
};
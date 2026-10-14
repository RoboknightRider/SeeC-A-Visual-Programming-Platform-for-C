import React, { useState, useCallback, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Loader2, Copy, Check, Cpu, Globe, Maximize2, Minimize2, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils'; 
import { askAI, type AIProvider as GeminiAIProvider } from '../services/codingAgent';

type AIProvider = GeminiAIProvider;

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  provider?: AIProvider;
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

const CHAT_CONFIG = {
  fullscreenInset: 12,
  defaultWidth: 416,
  defaultHeight: 448,
  minWidth: 340,
  minHeight: 320,
  resizeViewportPadding: 24,
  recentMessageCount: 6,
  summaryMessageThreshold: 10,
  copyFeedbackDurationMs: 1200,
  scrollBehavior: 'smooth' as ScrollBehavior,
};

const CHAT_STORAGE_KEYS = {
  provider: 'seec-ai-provider',
  messages: 'seec-chat-messages',
  summary: 'seec-chat-summary',
};

const AI_PROVIDER_LABELS: Record<AIProvider, string> = {
  gemini: 'Online AI',
  local: 'Offline AI',
};

const CHAT_TEXT = {
  title: 'SeeC AI',
  greeting: 'Hello! I am your SeeC AI Assistant. How can I help you today?',
  thinking: 'Thinking...',
  onlineProvider: AI_PROVIDER_LABELS.gemini,
  offlineProvider: AI_PROVIDER_LABELS.local,
  inputPlaceholder: (provider: AIProvider) => `Ask ${AI_PROVIDER_LABELS[provider]}...`,
  copied: 'Copied',
  copy: 'Copy',
  code: 'code',
  clearHistory: 'Clear chat history',
  fullscreen: 'Full screen',
  exitFullscreen: 'Exit full screen',
  closeChat: 'Close chat',
  resizeChat: 'Resize chat window',
};

const MESSAGE_MARKDOWN_CLASSES = cn(
  'prose prose-invert max-w-none text-xs space-y-1.5',
  '[&_strong]:font-bold [&_strong]:text-white',
  '[&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4',
  '[&_code]:bg-zinc-950 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-[11px]',
  '[&_pre]:bg-zinc-950 [&_pre]:p-2 [&_pre]:rounded-md [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0'
);

const INITIAL_CHAT_MESSAGES: Message[] = [
  { id: '1', sender: 'ai', text: CHAT_TEXT.greeting, provider: 'gemini' },
];

function getRecentMessages(allMessages: Message[]): Message[] {
  return allMessages.slice(-CHAT_CONFIG.recentMessageCount);
}

function getMessagesToSummarize(allMessages: Message[]): Message[] {
  const olderMessageCount = allMessages.length - CHAT_CONFIG.recentMessageCount;
  return olderMessageCount > 0 ? allMessages.slice(0, olderMessageCount) : [];
}

function buildSummaryPrompt(messagesToSummarize: Message[], existingSummary: string): string {
  const conversationText = messagesToSummarize
    .map((message) => `${message.sender === 'user' ? 'User' : 'Assistant'}: ${message.text}`)
    .join('\n');

  if (!conversationText) {
    return '';
  }

  if (existingSummary.trim()) {
    return `You already have this summary of the prior conversation:\n${existingSummary.trim()}\n\nUpdate and improve it using the following older chat history. Keep the summary short, focused on the user's goal, what was tried, what failed, and the current situation:\n\n${conversationText}`;
  }

  return `Summarize the following older conversation for future replies. Keep it short, focused on the user's goal, what was tried, what failed, and the current situation:\n\n${conversationText}`;
}

function parseMessageSegments(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  const codeBlockPattern = /```([\w-]*)\s*([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockPattern.exec(text)) !== null) {
    const plainText = text.slice(lastIndex, match.index).trim();
    if (plainText) {
      segments.push({ type: 'text', content: plainText });
    }

    segments.push({
      type: 'code',
      content: match[2]?.trim() || '',
      language: match[1]?.trim() || undefined,
    });
    lastIndex = codeBlockPattern.lastIndex;
  }

  const trailingText = text.slice(lastIndex).trim();
  if (trailingText) {
    segments.push({ type: 'text', content: trailingText });
  }

  return segments;
}

function buildExecutionErrorPrompt(errorText: string, code?: string): string {
  let prompt = `I encountered a compilation/execution error in my C code. Can you analyze this terminal log and guide me on how to fix my flow diagrams?\n\n\`\`\`text\n${errorText}\n\`\`\``;
  if (code?.trim()) {
    prompt += `\n\nHere's the generated C code:\n\`\`\`c\n${code}\n\`\`\``;
  }
  return prompt;
}

const MessageMarkdown = ({ content }: { content: string }) => (
  <div className={MESSAGE_MARKDOWN_CLASSES}>
    <ReactMarkdown>{content}</ReactMarkdown>
  </div>
);

const getInitialProvider = (): AIProvider => {
  if (typeof window === 'undefined') {
    return 'gemini';
  }

  const saved = window.sessionStorage.getItem(CHAT_STORAGE_KEYS.provider);
  return saved === 'local' ? 'local' : 'gemini';
};

const getSavedMessages = (): Message[] => {
  if (typeof window === 'undefined') {
    return INITIAL_CHAT_MESSAGES;
  }

  try {
    const raw = window.localStorage.getItem(CHAT_STORAGE_KEYS.messages);
    if (!raw) {
      return INITIAL_CHAT_MESSAGES;
    }

    const parsed = JSON.parse(raw) as Message[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return INITIAL_CHAT_MESSAGES;
    }

    return parsed;
  } catch {
    return INITIAL_CHAT_MESSAGES;
  }
};

const getSavedSummary = (): string => {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(CHAT_STORAGE_KEYS.summary) || '';
};

export const Chatbox: React.FC<ChatboxProps> = ({
  showChat,
  setShowChat,
  initialError,
  initialCode,        
  clearInitialError    
}) => {
  const [messages, setMessages] = useState<Message[]>(getSavedMessages);
  const [chatInput, setChatInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null);
  const [geminiAvailable, setGeminiAvailable] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chatboxSize, setChatboxSize] = useState({ width: CHAT_CONFIG.defaultWidth, height: CHAT_CONFIG.defaultHeight });
  const [contextSummary, setContextSummary] = useState(getSavedSummary());

  const [aiProvider, setAiProvider] = useState<AIProvider>(getInitialProvider);

  const updateContextSummary = useCallback(async (allMessages: Message[]) => {
    const messagesToSummarize = getMessagesToSummarize(allMessages);
    if (messagesToSummarize.length === 0) {
      return;
    }

    const prompt = buildSummaryPrompt(messagesToSummarize, contextSummary);
    if (!prompt) {
      return;
    }

    const res = await askAI(prompt, [], aiProvider, contextSummary);
    if (res.text && typeof res.text === 'string') {
      setContextSummary(res.text.trim());
    }
  }, [aiProvider, contextSummary]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const resizeStateRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: CHAT_CONFIG.scrollBehavior });
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

    window.sessionStorage.setItem(CHAT_STORAGE_KEYS.provider, aiProvider);
  }, [aiProvider]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(CHAT_STORAGE_KEYS.messages, JSON.stringify(messages));
    window.localStorage.setItem(CHAT_STORAGE_KEYS.summary, contextSummary);
  }, [messages, contextSummary]);

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

      const maxWidth = Math.max(CHAT_CONFIG.minWidth, window.innerWidth - CHAT_CONFIG.resizeViewportPadding);
      const maxHeight = Math.max(CHAT_CONFIG.minHeight, window.innerHeight - CHAT_CONFIG.resizeViewportPadding);
      const nextWidth = Math.min(maxWidth, Math.max(CHAT_CONFIG.minWidth, resizeState.startWidth + (resizeState.startX - event.clientX)));
      const nextHeight = Math.min(maxHeight, Math.max(CHAT_CONFIG.minHeight, resizeState.startHeight + (resizeState.startY - event.clientY)));

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

  const handleCopyCode = useCallback(async (codeKey: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCodeKey(codeKey);
      window.setTimeout(() => {
        setCopiedCodeKey((current) => (current === codeKey ? null : current));
      }, CHAT_CONFIG.copyFeedbackDurationMs);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  }, []);

  const handleClearChat = useCallback(() => {
    setMessages(INITIAL_CHAT_MESSAGES);
    setChatInput('');
    setCopiedCodeKey(null);
    setIsLoading(false);
    setContextSummary('');

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(CHAT_STORAGE_KEYS.messages);
      window.localStorage.removeItem(CHAT_STORAGE_KEYS.summary);
    }

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

  const sendMessage = useCallback(async (userText: string, clearInput = false) => {
    const currentProvider = aiProvider;
    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: userText
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    if (clearInput) {
      setChatInput('');
    }
    setIsLoading(true);

    try {
      const response = await askAI(userText, getRecentMessages(nextMessages), currentProvider, contextSummary);
      const actualProvider = response.usedProvider || currentProvider;
      const aiReply: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: response.text,
        provider: actualProvider,
      };
      const updatedMessages = [...nextMessages, aiReply];

      if (currentProvider === 'gemini' && actualProvider === 'local') {
        setAiProvider('local');
      }

      setMessages(updatedMessages);
      if (updatedMessages.length > CHAT_CONFIG.summaryMessageThreshold) {
        void updateContextSummary(updatedMessages);
      }
    } finally {
      setIsLoading(false);
    }
  }, [aiProvider, contextSummary, messages, updateContextSummary]);

  const handleSendMessage = useCallback(() => {
    const trimmedInput = chatInput.trim();
    if (!trimmedInput || isLoading) {
      return;
    }
    void sendMessage(trimmedInput, true);
  }, [chatInput, isLoading, sendMessage]);

  useEffect(() => {
    if (initialError?.trim() && showChat && !isLoading) {
      void sendMessage(buildExecutionErrorPrompt(initialError, initialCode));
      clearInitialError?.();
    }
  }, [initialError, initialCode, showChat, isLoading, sendMessage, clearInitialError]);

  if (!showChat) return null;

  const chatboxStyle: React.CSSProperties = isFullscreen
    ? {
        inset: `${CHAT_CONFIG.fullscreenInset}px`,
        width: 'auto',
        height: 'auto',
      }
    : {
        width: `${chatboxSize.width}px`,
        height: `${chatboxSize.height}px`,
        minWidth: `${CHAT_CONFIG.minWidth}px`,
        minHeight: `${CHAT_CONFIG.minHeight}px`,
        maxWidth: `calc(100vw - ${CHAT_CONFIG.resizeViewportPadding}px)`,
        maxHeight: `calc(100dvh - ${CHAT_CONFIG.resizeViewportPadding}px)`,
      };

  return (
    <div
      className={cn(
        "fixed bg-zinc-900 border border-zinc-800 shadow-2xl z-[999] flex flex-col overflow-hidden",
        isFullscreen
          ? "rounded-xl"
          : "right-3 bottom-3 rounded-xl"
      )}
      style={chatboxStyle}
    >
      
      {/* Header */}
      <div className="p-3 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <MessageSquare className="text-blue-500 w-4 h-4" />
          <h3 className="text-xs font-bold text-white hidden sm:block">{CHAT_TEXT.title}</h3>
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
            <span>{geminiAvailable ? CHAT_TEXT.onlineProvider : `${CHAT_TEXT.onlineProvider} (Unavailable)`}</span>
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
            <span>{CHAT_TEXT.offlineProvider}</span>
          </label>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleClearChat}
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors border border-zinc-800 bg-zinc-950"
            title={CHAT_TEXT.clearHistory}
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen((current) => !current)}
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors border border-zinc-800 bg-zinc-950"
            title={isFullscreen ? CHAT_TEXT.exitFullscreen : CHAT_TEXT.fullscreen}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button 
            type="button"
            onClick={() => setShowChat(false)} 
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors border border-zinc-800 bg-zinc-950"
            title={CHAT_TEXT.closeChat}
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
                  ? "bg-blue-700 border-blue-600 text-white self-end" 
                  : isLocal
                    ? "bg-amber-950 border-amber-700 text-amber-100 self-start" // Local AI Style
                    : "bg-emerald-950 border-emerald-700 text-emerald-100 self-start" // Gemini Style
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
                              {segment.language || CHAT_TEXT.code}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyCode(codeKey, segment.content)}
                              className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:text-white"
                            >
                              {copiedCodeKey === codeKey ? <Check size={12} /> : <Copy size={12} />}
                              {copiedCodeKey === codeKey ? CHAT_TEXT.copied : CHAT_TEXT.copy}
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

                    return <MessageMarkdown key={`${msg.id}-text-${index}`} content={segment.content} />;
                  })}
                </div>
              ) : (
                <MessageMarkdown content={msg.text} />
              )}
            </div>
          );
        })}
        
        {isLoading && (
          <div className="bg-zinc-800/40 border border-zinc-700/20 p-3 rounded-lg text-zinc-500 self-start flex items-center gap-2">
            <Loader2 size={12} className="animate-spin text-blue-500" />
            {CHAT_TEXT.thinking}
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
          placeholder={isLoading ? CHAT_TEXT.thinking : CHAT_TEXT.inputPlaceholder(aiProvider)}
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
            title={CHAT_TEXT.resizeChat}
          />
        </div>
      )}
    </div>
  );
};
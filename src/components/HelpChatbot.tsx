import { AlertCircle, Bot, MessageCircleQuestion, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { apiFetch } from '../lib/api.ts';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

interface HelpChatbotProps {
  currentView: 'landing' | 'auth' | 'receipt' | 'workspace';
}

function renderInlineFormatting(line: string): React.ReactNode[] {
  const tokens = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((tok, i) => {
    if (tok.startsWith('**') && tok.endsWith('**') && tok.length > 4) {
      return (
        <strong key={i} className="font-semibold">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    if (tok.startsWith('`') && tok.endsWith('`') && tok.length > 2) {
      return (
        <code
          key={i}
          className="px-1 py-0.5 rounded bg-slate-200/80 dark:bg-emerald-950/70 font-mono text-[11px]"
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{tok}</React.Fragment>;
  });
}

function FormattedReply({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i].trim();
    if (!raw) {
      i++;
      continue;
    }

    const headingMatch = raw.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch) {
      elements.push(
        <div key={`h-${i}`} className="font-bold text-[13px] text-[#14201a] dark:text-[#ecf2ee] pt-0.5">
          {renderInlineFormatting(headingMatch[1])}
        </div>
      );
      i++;
      continue;
    }

    if (/^[-*•]\s+/.test(raw)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc pl-4 space-y-1">
          {items.map((item, idx) => (
            <li key={idx}>{renderInlineFormatting(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+[.)]\s+/.test(raw)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="list-decimal pl-4 space-y-1">
          {items.map((item, idx) => (
            <li key={idx}>{renderInlineFormatting(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim().length > 0 &&
      !/^#{1,4}\s+/.test(lines[i].trim()) &&
      !/^[-*•]\s+/.test(lines[i].trim()) &&
      !/^\d+[.)]\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    elements.push(
      <p key={`p-${i}`}>
        {paraLines.map((pl, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <br />}
            {renderInlineFormatting(pl)}
          </React.Fragment>
        ))}
      </p>
    );
  }

  return <div className="space-y-2 text-[13px] leading-relaxed">{elements}</div>;
}

export const HelpChatbot: React.FC<HelpChatbotProps> = ({ currentView }) => {
  const { user, language, t } = useApp();
  const prefersReduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      role: 'model',
      text: t('chat.welcome'),
    },
  ]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].id === 'welcome') {
        return [{ id: 'welcome', role: 'model', text: t('chat.welcome') }];
      }
      return prev;
    });
  }, [t]);

  useEffect(() => {
    if (open) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [open, messages.length, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const suggestedQuestions = useMemo(() => {
    if (user?.role === 'COLLECTOR') {
      return [
        'How do I sell e-waste step by step?',
        'Where do I find my 4-digit handover code?',
        'Why is a recycler showing as partial match?',
        'How do I confirm UPI or cash payment?',
      ];
    }
    if (user?.role === 'RECYCLER') {
      return [
        'How do I get my facility verified?',
        'How do I enter weigh-in kg and handover code?',
        'How do I record UPI or cash payment?',
      ];
    }
    if (user?.role === 'ADMIN') {
      return [
        'How do I verify a pending recycler?',
        'How do I resolve a weight or payment dispute?',
        'How does delivery transport cost work?',
      ];
    }
    if (currentView === 'receipt') {
      return [
        'How is this HMAC signature verified?',
        'Does this receipt count as an EPR certificate?',
        'Why are phone numbers hidden on this receipt?',
      ];
    }
    if (currentView === 'auth') {
      return [
        'How do I sign in or register quickly?',
        'How do I register as a Collector or Recycler?',
        'How does the Demo Login option work?',
      ];
    }
    return [
      'How do I sell my e-waste on this website?',
      'How are price estimates and transport costs calculated?',
      'How do I sign in and start selling?',
      'Is Kabadiwala Connect an EPR recycler?',
    ];
  }, [user?.role, currentView]);

  const contextLabel = user ? user.role : currentView.toUpperCase();

  const sendQuestion = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || busy) return;

    setError(null);
    setLastFailedPrompt(null);
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', text: trimmed };
    const historyPayload = messages
      .filter((m) => m.id !== 'welcome')
      .slice(-12)
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setBusy(true);

    try {
      const res = await apiFetch<{ reply: string }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: trimmed,
          history: historyPayload,
          language,
          currentView: user ? `${user.role.toLowerCase()}-workspace` : currentView,
        }),
      });
      setMessages((prev) => [
        ...prev,
        { id: `m-${Date.now()}`, role: 'model', text: res.reply },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not get a response from Help AI.';
      setError(msg);
      setLastFailedPrompt(trimmed);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendQuestion(input);
  };

  const handleReset = () => {
    setMessages([{ id: 'welcome', role: 'model', text: t('chat.welcome') }]);
    setError(null);
    setLastFailedPrompt(null);
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('chat.title')}
          className="btn-3d-copper fixed bottom-20 lg:bottom-6 right-4 lg:right-6 z-40 min-h-[48px] px-4 py-2.5 rounded-full bg-[#b04a17] hover:bg-[#943b10] text-white font-semibold text-sm inline-flex items-center gap-2 shadow-xl"
        >
          <MessageCircleQuestion className="w-5 h-5 shrink-0" />
          <span>{t('chat.launcher')}</span>
        </button>
      )}

      {open && (
        <motion.section
          role="dialog"
          aria-label={t('chat.title')}
          initial={prefersReduced ? false : { opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-20 lg:bottom-6 right-3 sm:right-6 z-50 w-[calc(100vw-1.5rem)] sm:w-[400px] max-h-[min(74vh,560px)] flex flex-col rounded-2xl border border-slate-200 dark:border-emerald-900/70 bg-white dark:bg-[#15201b] shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <header className="px-4 py-3 bg-[#14201a] text-white flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#b04a17] flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold truncate">{t('chat.title')}</h2>
                  <span className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/10 text-amber-200 shrink-0">
                    {contextLabel}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 truncate">{t('chat.subtitle')}</p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleReset}
                title={t('chat.clear')}
                aria-label={t('chat.clear')}
                className="min-h-[36px] min-w-[36px] rounded-lg hover:bg-white/10 flex items-center justify-center text-slate-200"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close Help AI"
                className="min-h-[36px] min-w-[36px] rounded-lg hover:bg-white/10 flex items-center justify-center text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-[#f8faf9] dark:bg-[#0d1512]">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 ${
                    m.role === 'user'
                      ? 'bg-[#b04a17] text-white rounded-br-sm text-[13px] leading-relaxed'
                      : 'bg-white dark:bg-[#15201b] border border-slate-200 dark:border-emerald-950/60 text-[#14201a] dark:text-[#ecf2ee] rounded-bl-sm shadow-xs'
                  }`}
                >
                  {m.role === 'model' ? <FormattedReply text={m.text} /> : m.text}
                </div>
              </div>
            ))}

            {/* Starter quick questions when chat is fresh */}
            {messages.length <= 1 && !busy && (
              <div className="pt-1 space-y-1.5">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[#b04a17]" />
                  <span>Quick Help Topics</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {suggestedQuestions.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => void sendQuestion(q)}
                      className="text-left text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#15201b] hover:border-[#b04a17] text-slate-700 dark:text-slate-200 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm px-3.5 py-2.5 bg-white dark:bg-[#15201b] border border-slate-200 dark:border-emerald-950/60 text-xs font-mono text-slate-500 dark:text-slate-400">
                  {t('chat.thinking')}
                </div>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-900 dark:text-red-200 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
                {lastFailedPrompt && (
                  <button
                    type="button"
                    onClick={() => void sendQuestion(lastFailedPrompt)}
                    className="font-semibold underline text-[#b04a17]"
                  >
                    Retry question
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Input Composer */}
          <form
            onSubmit={handleSubmit}
            className="p-2.5 border-t border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] flex items-end gap-2 shrink-0"
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendQuestion(input);
                }
              }}
              placeholder={t('chat.placeholder')}
              aria-label={t('chat.placeholder')}
              className="flex-1 min-h-[44px] max-h-24 resize-none rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-[#f8faf9] dark:bg-[#0d1512] px-3 py-2.5 text-sm focus:outline-none focus:border-[#b04a17]"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label={t('chat.send')}
              className="btn-3d-copper min-h-[44px] min-w-[44px] px-3.5 rounded-xl bg-[#b04a17] hover:bg-[#943b10] disabled:opacity-50 text-white inline-flex items-center justify-center shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </motion.section>
      )}
    </>
  );
};

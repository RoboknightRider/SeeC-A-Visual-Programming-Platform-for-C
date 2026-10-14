import React from 'react';
import { Moon, Sun, X } from 'lucide-react';

type Theme = 'dark' | 'light';

export function SettingsDialog({
  open,
  theme,
  onClose,
  onThemeChange,
}: {
  open: boolean;
  theme: Theme;
  onClose: () => void;
  onThemeChange: (theme: Theme) => void;
}) {
  React.useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-5 text-zinc-100 shadow-2xl"
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 id="settings-title" className="text-lg font-semibold">Settings</h2>
            <p className="mt-1 text-sm text-zinc-400">Personalize your SeeC workspace.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            aria-label="Close settings"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-zinc-800 pt-5">
          <div>
            <h3 className="text-sm font-medium">Appearance</h3>
            <p className="mt-1 text-xs text-zinc-400">Choose a light or dark workspace.</p>
          </div>
          <div className="flex shrink-0 rounded-lg border border-zinc-700 bg-zinc-950 p-1" role="group" aria-label="Color theme">
            <button
              type="button"
              onClick={() => onThemeChange('light')}
              aria-pressed={theme === 'light'}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${theme === 'light' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-zinc-100'}`}
            >
              <Sun size={14} /> Light
            </button>
            <button
              type="button"
              onClick={() => onThemeChange('dark')}
              aria-pressed={theme === 'dark'}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${theme === 'dark' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-zinc-100'}`}
            >
              <Moon size={14} /> Dark
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

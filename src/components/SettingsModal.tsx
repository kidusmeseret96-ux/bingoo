import React, { useState, useEffect } from 'react';
import { X, Globe, Moon, Sun, Volume2, Mic, CheckCircle2, Sparkles, User } from 'lucide-react';
import { AppLanguage } from '../../shared/bingo';
import { Translations } from '../utils/i18n';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  t: Translations;
  language: AppLanguage;
  onChangeLanguage: (lang: AppLanguage) => void;
  theme: 'dark' | 'light';
  onChangeTheme: (theme: 'dark' | 'light') => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  autoDaub: boolean;
  onToggleAutoDaub: () => void;
  autoClaim: boolean;
  onToggleAutoClaim: () => void;
  playerName: string;
  isTelegram: boolean;
  onSaveName: (name: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  t,
  language,
  onChangeLanguage,
  theme,
  onChangeTheme,
  soundEnabled,
  onToggleSound,
  voiceEnabled,
  onToggleVoice,
  autoDaub,
  onToggleAutoDaub,
  autoClaim,
  onToggleAutoClaim,
  playerName,
  isTelegram,
  onSaveName,
}) => {
  const [nameInput, setNameInput] = useState(playerName);

  useEffect(() => {
    setNameInput(playerName);
  }, [playerName, open]);

  if (!open) return null;

  const langOptions: Array<{ code: AppLanguage; label: string; sub: string }> = [
    { code: 'en', label: 'English', sub: 'English' },
    { code: 'am', label: 'አማርኛ', sub: 'Amharic' },
    { code: 'om', label: 'Afaan Oromoo', sub: 'Oromo' },
  ];

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = nameInput.trim().slice(0, 24);
    if (clean) onSaveName(clean);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-settings-title"
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto hall-scroll rounded-t-3xl sm:rounded-2xl bg-white dark:bg-[#11182B] border border-slate-200 dark:border-[#243152] text-slate-900 dark:text-slate-50 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-5 py-4 bg-white/95 dark:bg-[#11182B]/95 backdrop-blur-md border-b border-slate-200 dark:border-[#243152]">
          <h2 id="player-settings-title" className="font-display text-lg font-bold">
            {t.settingsTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#18223C] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Language & Voice Selection */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              <Globe className="w-4 h-4" />
              {t.languageLabel}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {langOptions.map((opt) => {
                const active = language === opt.code;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => onChangeLanguage(opt.code)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      active
                        ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/20'
                        : 'bg-slate-50 dark:bg-[#18223C] text-slate-800 dark:text-slate-200 border-slate-200 dark:border-[#243152] hover:border-blue-400'
                    }`}
                  >
                    <div className="font-display font-bold text-sm">{opt.label}</div>
                    <div className={`text-[10px] mt-0.5 ${active ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                      {opt.sub}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Dark / Light Theme */}
          <section className="space-y-2.5">
            <div className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              {t.themeLabel}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => onChangeTheme('dark')}
                className={`min-h-[44px] px-4 py-2.5 rounded-xl border flex items-center justify-center gap-2 text-sm font-semibold cursor-pointer transition-all ${
                  theme === 'dark'
                    ? 'bg-slate-900 text-amber-300 border-blue-500 ring-1 ring-blue-500'
                    : 'bg-slate-50 dark:bg-[#18223C] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#243152]'
                }`}
              >
                <Moon className="w-4 h-4" />
                {t.darkMode}
              </button>
              <button
                type="button"
                onClick={() => onChangeTheme('light')}
                className={`min-h-[44px] px-4 py-2.5 rounded-xl border flex items-center justify-center gap-2 text-sm font-semibold cursor-pointer transition-all ${
                  theme === 'light'
                    ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/20'
                    : 'bg-slate-50 dark:bg-[#18223C] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#243152]'
                }`}
              >
                <Sun className="w-4 h-4" />
                {t.lightMode}
              </button>
            </div>
          </section>

          {/* Audio & Gameplay Toggles */}
          <section className="space-y-2">
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={onToggleVoice}
                className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-[#18223C] border border-slate-200 dark:border-[#243152] flex items-center justify-between gap-3 cursor-pointer"
              >
                <div className="flex items-center gap-3 text-left">
                  <Mic className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="text-sm font-semibold">{t.voiceCaller}</span>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                    voiceEnabled
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {voiceEnabled ? t.on : t.off}
                </span>
              </button>

              <button
                type="button"
                onClick={onToggleSound}
                className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-[#18223C] border border-slate-200 dark:border-[#243152] flex items-center justify-between gap-3 cursor-pointer"
              >
                <div className="flex items-center gap-3 text-left">
                  <Volume2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="text-sm font-semibold">{t.soundEffects}</span>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                    soundEnabled
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {soundEnabled ? t.on : t.off}
                </span>
              </button>

              <button
                type="button"
                onClick={onToggleAutoDaub}
                className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-[#18223C] border border-slate-200 dark:border-[#243152] flex items-center justify-between gap-3 cursor-pointer"
              >
                <div className="flex items-center gap-3 text-left">
                  <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold">{t.autoMark}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{t.autoMarkDesc}</div>
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 ${
                    autoDaub
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {autoDaub ? t.on : t.off}
                </span>
              </button>

              <button
                type="button"
                onClick={onToggleAutoClaim}
                className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-[#18223C] border border-slate-200 dark:border-[#243152] flex items-center justify-between gap-3 cursor-pointer"
              >
                <div className="flex items-center gap-3 text-left">
                  <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold">{t.autoWin}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{t.autoWinDesc}</div>
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 ${
                    autoClaim
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {autoClaim ? t.on : t.off}
                </span>
              </button>
            </div>
          </section>

          {/* Guest Display Name */}
          {!isTelegram && (
            <form onSubmit={handleNameSubmit} className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                <User className="w-3.5 h-3.5 inline mr-1" />
                {t.playerName}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  maxLength={24}
                  className="flex-1 h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-[#18223C] border border-slate-200 dark:border-[#243152] text-sm focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  className="h-11 px-4 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 cursor-pointer"
                >
                  {t.save}
                </button>
              </div>
            </form>
          )}

          {/* Footer */}
          <div className="pt-2 flex justify-end border-t border-slate-200 dark:border-[#243152]">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-6 rounded-xl bg-slate-900 dark:bg-blue-600 text-white text-sm font-semibold hover:opacity-95 cursor-pointer"
            >
              {t.done}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

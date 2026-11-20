import React, { useState } from 'react';
import { Shuffle, SlidersHorizontal, Lock, Check, X, Eye } from 'lucide-react';
import {
  BINGO_LETTERS,
  CartelaEntry,
  GamePhase,
  TOTAL_CARTELAS,
  generateCartelaGrid,
  getColumnRange,
} from '../../shared/bingo';
import { Translations } from '../utils/i18n';

interface CartelaPickerProps {
  phase: GamePhase;
  secondsRemaining: number;
  entries: CartelaEntry[];
  playerId: string;
  stakeBirr: number;
  totalBalance: number;
  isAdmin: boolean;
  t: Translations;
  onSelectCartela: (cartelaNumber: number) => void;
  onSelectCustomCartela: (grid: number[][]) => void;
  onReleaseCartela: (entryId: string) => void;
}

export const CartelaPicker: React.FC<CartelaPickerProps> = ({
  phase,
  secondsRemaining,
  entries,
  playerId,
  stakeBirr,
  totalBalance,
  isAdmin,
  t,
  onSelectCartela,
  onSelectCustomCartela,
  onReleaseCartela,
}) => {
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewNumber, setPreviewNumber] = useState<number | null>(null);
  const [customCols, setCustomCols] = useState<number[][]>(() => {
    const g = generateCartelaGrid(Math.floor(Math.random() * 100) + 1);
    return [0, 1, 2, 3, 4].map((c) => {
      const colVals = [0, 1, 2, 3, 4].map((r) => g[r][c]);
      return c === 2 ? colVals.filter((v) => v !== 0) : colVals;
    });
  });

  const entryByCartela = React.useMemo(() => {
    const map = new Map<number, CartelaEntry>();
    for (const e of entries) {
      if (!e.isCustom) map.set(e.cartelaNumber, e);
    }
    return map;
  }, [entries]);

  const myEntries = React.useMemo(
    () => entries.filter((e) => e.playerId === playerId),
    [entries, playerId]
  );

  const isLocked = phase !== 'OPENING';
  // Admin account can pick unlimited cartelas as long as game has not started
  const canAffordMore = isAdmin || totalBalance >= stakeBirr;

  const previewGrid = React.useMemo(
    () => (previewNumber ? generateCartelaGrid(previewNumber) : null),
    [previewNumber]
  );

  const handleQuickPick = () => {
    if (isLocked || !canAffordMore) return;
    const available: number[] = [];
    for (let i = 1; i <= TOTAL_CARTELAS; i++) {
      if (!entryByCartela.has(i)) available.push(i);
    }
    if (available.length === 0) return;
    const choice = available[Math.floor(Math.random() * available.length)];
    onSelectCartela(choice);
  };

  const toggleCustomNumber = (colIdx: number, num: number) => {
    const maxForCol = colIdx === 2 ? 4 : 5;
    setCustomCols((prev) => {
      const copy = prev.map((arr) => [...arr]);
      const current = copy[colIdx];
      if (current.includes(num)) {
        copy[colIdx] = current.filter((v) => v !== num);
      } else if (current.length < maxForCol) {
        copy[colIdx] = [...current, num];
      } else {
        copy[colIdx] = [...current.slice(1), num];
      }
      return copy;
    });
  };

  const randomizeCustom = () => {
    const seed = Math.floor(Math.random() * 90000) + 101;
    const g = generateCartelaGrid(seed);
    setCustomCols(
      [0, 1, 2, 3, 4].map((c) => {
        const colVals = [0, 1, 2, 3, 4].map((r) => g[r][c]);
        return c === 2 ? colVals.filter((v) => v !== 0) : colVals;
      })
    );
  };

  const isCustomReady = customCols.every((col, idx) => col.length === (idx === 2 ? 4 : 5));

  const submitCustom = () => {
    if (!isCustomReady || isLocked || !canAffordMore) return;
    const grid: number[][] = Array.from({ length: 5 }, () => Array(5).fill(0));
    for (let c = 0; c < 5; c++) {
      if (c === 2) {
        grid[0][2] = customCols[2][0];
        grid[1][2] = customCols[2][1];
        grid[2][2] = 0;
        grid[3][2] = customCols[2][2];
        grid[4][2] = customCols[2][3];
      } else {
        for (let r = 0; r < 5; r++) {
          grid[r][c] = customCols[c][r];
        }
      }
    }
    onSelectCustomCartela(grid);
    setShowCustomBuilder(false);
  };

  return (
    <div className="rounded-2xl bg-white dark:bg-[#11182B] border border-slate-200 dark:border-[#243152] p-3.5 sm:p-5 shadow-sm">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3">
        <div>
          <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white">
            {isLocked ? t.selectionLockedTitle : t.selectCartelaTitle}
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
            {isLocked
              ? t.selectionLockedHint
              : canAffordMore
                ? `${secondsRemaining}s · ${t.pickAsManyAsBalance}`
                : t.insufficientBalance}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            disabled={isLocked || !canAffordMore}
            onClick={handleQuickPick}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl text-xs font-bold bg-amber-400 text-slate-950 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap shadow-sm"
          >
            <Shuffle className="w-3.5 h-3.5" />
            {t.quickPick}
          </button>

          <button
            type="button"
            onClick={() => {
              setPreviewMode((v) => !v);
              setPreviewNumber(null);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
              previewMode
                ? 'bg-blue-600 text-white border-blue-500'
                : 'bg-slate-100 dark:bg-[#18223C] text-slate-800 dark:text-slate-100 border-slate-200 dark:border-[#243152] hover:border-blue-500'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            {t.previewMode}
          </button>

          <button
            type="button"
            disabled={isLocked || (!canAffordMore && !showCustomBuilder)}
            onClick={() => setShowCustomBuilder((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#18223C] text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-[#243152] hover:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {showCustomBuilder ? t.closeBuilder : t.customNumbers}
          </button>
        </div>
      </div>

      {/* Fixed Deterministic Cartela Preview Box */}
      {previewMode && previewNumber && previewGrid && (
        <div className="mb-3.5 p-3 rounded-xl bg-slate-50 dark:bg-[#0B1020] border border-blue-500/40 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-display text-sm font-bold text-slate-900 dark:text-white">
              {t.previewCard} #{previewNumber}
            </div>
            <div className="flex items-center gap-2">
              {!isLocked && !entryByCartela.has(previewNumber) && canAffordMore && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectCartela(previewNumber);
                    setPreviewNumber(null);
                    setPreviewMode(false);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-400 text-slate-950 hover:bg-amber-300 cursor-pointer"
                >
                  {t.lockThisCard} #{previewNumber}
                </button>
              )}
              <button
                type="button"
                onClick={() => setPreviewNumber(null)}
                aria-label="Close preview"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-w-[240px] mx-auto">
            <div className="grid grid-cols-5 gap-1 mb-1">
              {BINGO_LETTERS.map((l) => (
                <div
                  key={l}
                  className="h-6 rounded bg-blue-600 text-white font-display text-xs font-extrabold flex items-center justify-center"
                >
                  {l}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-1">
              {previewGrid.map((row, r) =>
                row.map((val, c) => (
                  <div
                    key={`${r}-${c}`}
                    className={`h-8 rounded flex items-center justify-center font-mono text-xs font-bold tabular-nums ${
                      val === 0
                        ? 'bg-emerald-600 text-white text-[9px]'
                        : 'bg-white dark:bg-[#18223C] text-slate-900 dark:text-white border border-slate-200 dark:border-[#243152]'
                    }`}
                  >
                    {val === 0 ? t.free : val}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Custom Number Builder Drawer */}
      {showCustomBuilder && !isLocked && (
        <div className="mb-3.5 p-3 sm:p-4 rounded-xl bg-slate-50 dark:bg-[#0B1020] border border-slate-200 dark:border-[#243152]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">{t.pickOwnNumbers}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t.pickOwnHint}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={randomizeCustom}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-200 dark:bg-[#18223C] text-slate-800 dark:text-slate-100 hover:opacity-90 cursor-pointer whitespace-nowrap"
              >
                {t.shuffle}
              </button>
              <button
                type="button"
                disabled={!isCustomReady || !canAffordMore}
                onClick={submitCustom}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-400 text-slate-950 hover:bg-amber-300 disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" />
                {t.lockCustomCard}
              </button>
              <button
                type="button"
                onClick={() => setShowCustomBuilder(false)}
                aria-label="Close custom builder"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {BINGO_LETTERS.map((letter, colIdx) => {
              const [min] = getColumnRange(colIdx);
              const req = colIdx === 2 ? 4 : 5;
              const selected = customCols[colIdx];
              const nums = Array.from({ length: 15 }, (_, i) => min + i);
              return (
                <div key={letter} className="flex flex-col gap-1">
                  <div className="text-center py-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 border-b border-slate-200 dark:border-[#243152] tabular-nums">
                    {letter} ({selected.length}/{req})
                  </div>
                  <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
                    {nums.map((n) => {
                      const active = selected.includes(n);
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => toggleCustomNumber(colIdx, n)}
                          className={`h-7 sm:h-8 rounded font-mono text-[11px] sm:text-xs font-bold tabular-nums cursor-pointer transition-colors ${
                            active
                              ? 'bg-amber-400 text-slate-950'
                              : 'bg-white dark:bg-[#18223C] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#243152] hover:border-blue-400'
                          }`}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Compact Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300 mb-2.5 tabular-nums">
        <span>{t.available}: {TOTAL_CARTELAS - entryByCartela.size}</span>
        <span aria-hidden="true">·</span>
        <span className="text-blue-600 dark:text-amber-400 font-bold">
          {t.yours}: {myEntries.length}
        </span>
        <span aria-hidden="true">·</span>
        <span>{t.claimed}: {entries.length}</span>
      </div>

      {/* 1-100 Cartela Grid */}
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 max-h-[360px] overflow-y-auto hall-scroll pr-0.5">
        {Array.from({ length: TOTAL_CARTELAS }, (_, i) => i + 1).map((num) => {
          const taken = entryByCartela.get(num);
          const isMine = taken?.playerId === playerId;
          const isTakenByOther = Boolean(taken) && !isMine;
          const disabled = previewMode ? false : isLocked || isTakenByOther || (!isMine && !canAffordMore);

          return (
            <button
              key={num}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (previewMode) {
                  setPreviewNumber(num);
                  return;
                }
                if (isMine && taken) {
                  onReleaseCartela(taken.entryId);
                } else if (!taken && !isLocked && canAffordMore) {
                  onSelectCartela(num);
                }
              }}
              className={`min-h-[42px] sm:min-h-[44px] rounded-xl font-mono text-sm font-bold tabular-nums flex flex-col items-center justify-center transition-all duration-150 ${
                previewMode && previewNumber === num
                  ? 'bg-blue-600 text-white ring-2 ring-blue-400 cursor-pointer'
                  : isMine
                    ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 cursor-pointer shadow-sm'
                    : isTakenByOther
                      ? 'bg-slate-100 dark:bg-[#0B1020] text-slate-300 dark:text-slate-600 border border-slate-200/70 dark:border-[#1E2945] cursor-not-allowed'
                      : isLocked || !canAffordMore
                        ? 'bg-slate-100 dark:bg-[#0E1528] text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-[#1E2945] cursor-not-allowed'
                        : 'bg-slate-50 dark:bg-[#18223C] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-[#243152] hover:border-blue-500 dark:hover:border-blue-400 active:scale-95 cursor-pointer'
              }`}
            >
              <span>{num}</span>
              {isMine && <span className="text-[9px] font-sans font-extrabold uppercase tracking-tight leading-none">{t.you}</span>}
              {isTakenByOther && !isLocked && <Lock className="w-2.5 h-2.5 opacity-50 mt-0.5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

import React from 'react';
import { BINGO_LETTERS, getColumnRange } from '../../shared/bingo';
import { Translations } from '../utils/i18n';

interface MasterBoardProps {
  calledNumbers: number[];
  currentBall: number | null;
  t: Translations;
  compact?: boolean;
}

export const MasterBoard: React.FC<MasterBoardProps> = ({
  calledNumbers,
  currentBall,
  t,
  compact = false,
}) => {
  const calledSet = React.useMemo(() => new Set(calledNumbers), [calledNumbers]);

  const colHeaderColors = [
    'bg-rose-600 text-white',
    'bg-amber-500 text-slate-950',
    'bg-emerald-600 text-white',
    'bg-blue-600 text-white',
    'bg-violet-600 text-white',
  ];

  return (
    <div
      className={`rounded-2xl bg-white dark:bg-[#11182B] border border-slate-200 dark:border-[#243152] shadow-sm ${
        compact ? 'p-2 sm:p-3.5' : 'p-4 sm:p-5'
      }`}
    >
      <div className={`flex items-center justify-between gap-2 ${compact ? 'mb-2' : 'mb-3'}`}>
        <h2
          className={`font-display font-bold text-slate-900 dark:text-white truncate ${
            compact ? 'text-xs sm:text-sm' : 'text-base sm:text-lg'
          }`}
        >
          {t.board75Title}
        </h2>
        <span className="font-mono text-[11px] font-bold text-blue-600 dark:text-amber-400 tabular-nums shrink-0">
          {calledNumbers.length}/75
        </span>
      </div>

      {/* All 75 numbers rendered simultaneously in 5 columns x 15 rows — zero swiping required */}
      <div className={`grid grid-cols-5 ${compact ? 'gap-1 sm:gap-1.5' : 'gap-1.5 sm:gap-2'}`}>
        {BINGO_LETTERS.map((letter, colIdx) => {
          const [min] = getColumnRange(colIdx);
          const nums = Array.from({ length: 15 }, (_, i) => min + i);
          return (
            <div key={letter} className={`flex flex-col ${compact ? 'gap-0.5 sm:gap-1' : 'gap-1.5'}`}>
              <div
                className={`rounded-md flex items-center justify-center font-display font-extrabold ${colHeaderColors[colIdx]} ${
                  compact ? 'h-5 sm:h-7 text-[11px] sm:text-sm' : 'h-8 text-base'
                }`}
              >
                {letter}
              </div>
              {nums.map((n) => {
                const isCalled = calledSet.has(n);
                const isCurrent = currentBall === n;
                return (
                  <div
                    key={n}
                    className={`rounded-md flex items-center justify-center font-mono font-bold tabular-nums transition-colors duration-150 ${
                      compact
                        ? 'h-[21px] sm:h-7 text-[11px] sm:text-xs'
                        : 'h-8 sm:h-9 text-xs sm:text-sm'
                    } ${
                      isCurrent
                        ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 shadow-sm'
                        : isCalled
                          ? 'bg-blue-600 text-white dark:bg-blue-500 dark:text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-[#18223C] text-slate-400 dark:text-slate-500 border border-slate-200/80 dark:border-[#243152]'
                    }`}
                  >
                    {n}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

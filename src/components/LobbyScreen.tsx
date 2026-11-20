import React from 'react';
import { ArrowRight, Pause, Play, Clock, Users } from 'lucide-react';
import { RoomSummary, getBallLetter } from '../../shared/bingo';
import { Translations } from '../utils/i18n';

interface LobbyScreenProps {
  rooms: RoomSummary[];
  t: Translations;
  onJoinRoom: (stakeBirr: number) => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  rooms,
  t,
  onJoinRoom,
}) => {
  return (
    <div className="max-w-3xl mx-auto py-3 sm:py-8 space-y-4 sm:space-y-6">
      <div className="text-center sm:text-left">
        <h1 className="font-display text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          {t.lobbyTitle}
        </h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {rooms.map((room) => {
          const isOpen = room.phase === 'OPENING';
          return (
            <button
              key={room.stakeBirr}
              type="button"
              onClick={() => onJoinRoom(room.stakeBirr)}
              className="group text-left rounded-2xl bg-white dark:bg-[#11182B] border border-slate-200 dark:border-[#243152] hover:border-blue-500 dark:hover:border-amber-400 p-4 sm:p-6 transition-all duration-150 active:scale-[0.98] cursor-pointer flex flex-col justify-between gap-4 shadow-md shadow-slate-900/5 dark:shadow-black/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {t.round} #{room.roundNumber}
                  </div>
                  <div className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                    {room.stakeBirr} {t.birr}
                  </div>
                </div>

                <div
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold tabular-nums border ${
                    room.isPaused
                      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/40'
                      : isOpen
                        ? 'bg-amber-400 text-slate-950 border-amber-300'
                        : 'bg-blue-600/10 dark:bg-blue-500/20 text-blue-700 dark:text-blue-200 border-blue-500/30'
                  }`}
                >
                  {room.isPaused ? (
                    <span className="inline-flex items-center gap-1">
                      <Pause className="w-3 h-3" /> {t.paused}
                    </span>
                  ) : isOpen ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {room.secondsRemaining}s
                    </span>
                  ) : room.phase === 'CALLING' ? (
                    <span className="inline-flex items-center gap-1">
                      <Play className="w-3 h-3" />{' '}
                      {room.currentBall
                        ? `${getBallLetter(room.currentBall)}-${room.currentBall}`
                        : `${room.calledCount}/75`}
                    </span>
                  ) : (
                    <span>{t.nextIn} {room.secondsRemaining}s</span>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-[#243152] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    {room.displayedPlayersCount} {t.players}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-600 dark:text-amber-400 font-bold">
                    {t.pool}: {room.prizePool} {t.birr}
                  </span>
                </div>

                <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-amber-400 group-hover:translate-x-0.5 transition-transform whitespace-nowrap">
                  {t.enterRoom}
                  <ArrowRight className="w-4 h-4" />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

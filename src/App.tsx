import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Trophy,
  LayoutGrid,
  Award,
  Sparkles,
  WifiOff,
  ShieldCheck,
  ArrowLeft,
  PauseCircle,
  Settings,
  Sun,
  Moon,
  Users,
  Coins,
  Wallet,
} from 'lucide-react';
import {
  AppLanguage,
  ClientMessage,
  INITIAL_DEPOSIT_BIRR,
  LeaderboardEntry,
  LobbySnapshot,
  PlayerIdentity,
  PlayerWallet,
  PublicGameState,
  RoundWinner,
  ServerMessage,
  getBallLetter,
  getLocalizedCallText,
} from '../shared/bingo';
import {
  initTelegramMiniApp,
  resolvePlayerIdentity,
  saveGuestName,
  triggerHaptic,
} from './utils/telegram';
import { soundEngine } from './utils/sound';
import { TRANSLATIONS } from './utils/i18n';
import { CartelaCard } from './components/CartelaCard';
import { CartelaPicker } from './components/CartelaPicker';
import { MasterBoard } from './components/MasterBoard';
import { HostGuideModal } from './components/HostGuideModal';
import { LobbyScreen } from './components/LobbyScreen';
import { AdminModal } from './components/AdminModal';
import { SettingsModal } from './components/SettingsModal';

type ActiveTab = 'play' | 'winners';

function getStoredTheme(): 'dark' | 'light' {
  try {
    const saved = localStorage.getItem('cartela_theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // ignore storage errors
  }
  return 'dark';
}

function getStoredLanguage(): AppLanguage {
  try {
    const paramLang = new URLSearchParams(window.location.search).get('lang');
    if (paramLang === 'en' || paramLang === 'am' || paramLang === 'om') {
      localStorage.setItem('cartela_lang', paramLang);
      return paramLang;
    }
    const saved = localStorage.getItem('cartela_lang');
    if (saved === 'en' || saved === 'am' || saved === 'om') return saved;
  } catch {
    // ignore storage errors
  }
  return 'am';
}

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(getStoredTheme);
  const [language, setLanguage] = useState<AppLanguage>(getStoredLanguage);
  const t = TRANSLATIONS[language];

  const [player, setPlayer] = useState<PlayerIdentity | null>(null);
  const [wallet, setWallet] = useState<PlayerWallet>({
    depositedBalance: INITIAL_DEPOSIT_BIRR,
    wonBalance: 0,
  });

  const [lobby, setLobby] = useState<LobbySnapshot | null>(null);
  const [selectedStake, setSelectedStake] = useState<number | null>(null);
  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [wsConnected, setWsConnected] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [queuedByRoom, setQueuedByRoom] = useState<Record<number, number[]>>({});
  const [adminWallets, setAdminWallets] = useState<
    Array<{ playerId: string; name: string; wallet: PlayerWallet }>
  >([]);
  const [adminRecentWinners, setAdminRecentWinners] = useState<RoundWinner[]>([]);
  const [adminLeaderboard, setAdminLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isCustomWinners, setIsCustomWinners] = useState(false);
  const [isCustomLeaderboard, setIsCustomLeaderboard] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showHostModal, setShowHostModal] = useState(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>('play');
  const [focusedEntryId, setFocusedEntryId] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [autoDaub, setAutoDaub] = useState(true);
  const [autoClaim, setAutoClaim] = useState(true);
  const [manualMarks, setManualMarks] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const playerRef = useRef<PlayerIdentity | null>(null);
  const selectedStakeRef = useRef<number | null>(null);
  const soundRef = useRef(soundEnabled);
  const voiceRef = useRef(voiceEnabled);
  const autoClaimRef = useRef(autoClaim);
  const languageRef = useRef<AppLanguage>(language);
  const lastBeepSecRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const brandTapRef = useRef<{ count: number; lastAt: number }>({ count: 0, lastAt: 0 });

  soundRef.current = soundEnabled;
  voiceRef.current = voiceEnabled;
  autoClaimRef.current = autoClaim;
  playerRef.current = player;
  selectedStakeRef.current = selectedStake;
  languageRef.current = language;

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      localStorage.setItem('cartela_theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem('cartela_lang', language);
    } catch {
      // ignore
    }
  }, [language]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('admin') === '1') {
        setShowAdminModal(true);
      }
    }
  }, []);

  const showNotice = (type: 'ok' | 'error', text: string) => {
    setToast({ type, text });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2800);
  };

  useEffect(() => {
    initTelegramMiniApp();
    resolvePlayerIdentity().then((id) => {
      setPlayer(id);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const msg: ClientMessage = {
          type: 'auth',
          player: id,
          autoClaim: autoClaimRef.current,
          language: languageRef.current,
        };
        wsRef.current.send(JSON.stringify(msg));
      }
    });
  }, []);

  useEffect(() => {
    let alive = true;
    let reconnectTimer: number | null = null;
    let attempt = 0;

    const connect = () => {
      if (!alive) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setWsConnected(true);
        if (playerRef.current) {
          ws.send(
            JSON.stringify({
              type: 'auth',
              player: playerRef.current,
              autoClaim: autoClaimRef.current,
              language: languageRef.current,
            } satisfies ClientMessage)
          );
        }
        if (selectedStakeRef.current !== null) {
          ws.send(
            JSON.stringify({
              type: 'join_room',
              stakeBirr: selectedStakeRef.current,
            } satisfies ClientMessage)
          );
        }
      };

      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(ev.data) as ServerMessage;
        } catch {
          return;
        }

        if (msg.type === 'lobby:sync') {
          setLobby(msg.lobby);
          return;
        }

        if (msg.type === 'wallet:sync') {
          setWallet(msg.wallet);
          return;
        }

        if (msg.type === 'language:sync') {
          setLanguage(msg.language);
          return;
        }

        if (msg.type === 'state:sync') {
          setClockOffsetMs(msg.state.serverTime - Date.now());
          setGameState(msg.state);
          return;
        }

        if (msg.type === 'phase:changed') {
          setClockOffsetMs(msg.state.serverTime - Date.now());
          setGameState(msg.state);
          if (msg.state.phase === 'OPENING') {
            setManualMarks(new Set());
            lastBeepSecRef.current = null;
          }
          if (msg.state.phase === 'CALLING') {
            triggerHaptic('medium');
          }
          return;
        }

        if (msg.type === 'ball:called') {
          setGameState((prev) =>
            prev && prev.stakeBirr === msg.stakeBirr
              ? {
                  ...prev,
                  currentBall: msg.ball,
                  calledNumbers: msg.calledNumbers,
                  remainingBallCount: msg.remainingBallCount,
                }
              : prev
          );
          if (soundRef.current) soundEngine.playBallPop();
          if (voiceRef.current) soundEngine.speakBall(msg.ball, languageRef.current);
          triggerHaptic('light');
          return;
        }

        if (msg.type === 'entries:updated') {
          setGameState((prev) =>
            prev && prev.stakeBirr === msg.stakeBirr
              ? {
                  ...prev,
                  entries: msg.entries,
                  uniquePlayersCount: msg.uniquePlayersCount,
                  prizePool: msg.prizePool,
                }
              : prev
          );
          return;
        }

        if (msg.type === 'presence:updated') {
          setLobby((prev) => (prev ? { ...prev, onlineCount: msg.onlineCount } : prev));
          setGameState((prev) =>
            prev
              ? {
                  ...prev,
                  onlineCount: msg.onlineCount,
                  playersInRoom: msg.playersInRoom ?? prev.playersInRoom,
                }
              : prev
          );
          return;
        }

        if (msg.type === 'round:ended') {
          setClockOffsetMs(msg.state.serverTime - Date.now());
          setGameState(msg.state);
          if (msg.state.winners.length > 0) {
            if (soundRef.current) soundEngine.playBingoFanfare();
            if (voiceRef.current) {
              const first = msg.state.winners[0];
              soundEngine.speakWinner(first.playerName, first.prizeAmount, languageRef.current);
            }
            triggerHaptic('success');
          }
          return;
        }

        if (msg.type === 'admin:status') {
          setIsAdmin(msg.isAdmin);
          setQueuedByRoom(msg.queuedByRoom || {});
          if (msg.wallets) setAdminWallets(msg.wallets);
          if (msg.recentWinners) setAdminRecentWinners(msg.recentWinners);
          if (msg.leaderboard) setAdminLeaderboard(msg.leaderboard);
          if (typeof msg.isCustomWinners === 'boolean') setIsCustomWinners(msg.isCustomWinners);
          if (typeof msg.isCustomLeaderboard === 'boolean') setIsCustomLeaderboard(msg.isCustomLeaderboard);
          if (msg.message) {
            showNotice(msg.isAdmin ? 'ok' : 'error', msg.message);
          }
          return;
        }

        if (msg.type === 'action:error') {
          triggerHaptic('error');
          showNotice('error', msg.message);
          if (msg.message.includes('room was closed')) {
            setSelectedStake(null);
            setGameState(null);
          }
          return;
        }

        if (msg.type === 'action:ok') {
          triggerHaptic('success');
          showNotice('ok', msg.message);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!alive) return;
        const delay = Math.min(3000, 800 + attempt * 600);
        attempt += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      alive = false;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!gameState) return;
    if (gameState.isPaused) {
      setSecondsLeft(gameState.secondsRemaining);
      return;
    }

    const updateCountdown = () => {
      const serverNow = Date.now() + clockOffsetMs;
      const rem = Math.max(0, Math.ceil((gameState.phaseEndsAt - serverNow) / 1000));
      setSecondsLeft(rem);

      if (
        gameState.phase === 'OPENING' &&
        rem > 0 &&
        rem <= 5 &&
        lastBeepSecRef.current !== rem
      ) {
        lastBeepSecRef.current = rem;
        if (soundRef.current) soundEngine.playCountdownTick();
      }
    };
    updateCountdown();
    const id = window.setInterval(updateCountdown, 250);
    return () => window.clearInterval(id);
  }, [
    gameState?.phase,
    gameState?.phaseEndsAt,
    gameState?.isPaused,
    gameState?.secondsRemaining,
    clockOffsetMs,
  ]);

  const sendAction = (msg: ClientMessage) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      showNotice('error', t.reconnecting);
      return;
    }
    wsRef.current.send(JSON.stringify(msg));
  };

  const handleJoinRoom = (stakeBirr: number) => {
    setSelectedStake(stakeBirr);
    setActiveTab('play');
    setManualMarks(new Set());
    sendAction({ type: 'join_room', stakeBirr });
  };

  const handleLeaveRoom = () => {
    setSelectedStake(null);
    setGameState(null);
    sendAction({ type: 'leave_room' });
  };

  const handleToggleAutoClaim = () => {
    const next = !autoClaim;
    setAutoClaim(next);
    sendAction({ type: 'set_auto_claim', autoClaim: next });
  };

  const handleSaveName = (clean: string) => {
    if (!player) return;
    saveGuestName(clean);
    const updated: PlayerIdentity = { ...player, name: clean };
    setPlayer(updated);
    sendAction({ type: 'auth', player: updated, autoClaim });
    showNotice('ok', `${t.playingAs} ${clean}`);
  };

  const handleBrandClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const now = Date.now();
    if (now - brandTapRef.current.lastAt < 1200) {
      brandTapRef.current.count += 1;
    } else {
      brandTapRef.current.count = 1;
    }
    brandTapRef.current.lastAt = now;

    if (brandTapRef.current.count >= 5) {
      brandTapRef.current.count = 0;
      setShowAdminModal(true);
      return;
    }
    handleLeaveRoom();
  };

  const calledSet = useMemo(
    () => new Set(gameState?.calledNumbers || []),
    [gameState?.calledNumbers]
  );

  const myEntries = useMemo(
    () => (gameState?.entries || []).filter((e) => e.playerId === player?.id),
    [gameState?.entries, player?.id]
  );

  useEffect(() => {
    if (myEntries.length === 0) {
      setFocusedEntryId(null);
    } else if (!focusedEntryId || !myEntries.some((e) => e.entryId === focusedEntryId)) {
      setFocusedEntryId(myEntries[0].entryId);
    }
  }, [myEntries, focusedEntryId]);

  const activeEntry = useMemo(
    () => myEntries.find((e) => e.entryId === focusedEntryId) || myEntries[0] || null,
    [myEntries, focusedEntryId]
  );

  const recentBalls = useMemo(() => {
    const list = gameState?.calledNumbers || [];
    return list.slice(-4).reverse();
  }, [gameState?.calledNumbers]);

  const handleToggleManualMark = (num: number) => {
    if (!calledSet.has(num)) {
      showNotice('error', `${getBallLetter(num)}-${num} ${t.notCalledYet}`);
      return;
    }
    if (soundEnabled) soundEngine.playDaub();
    triggerHaptic('light');
    setManualMarks((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

  const ballColorClass = (num: number) => {
    if (num <= 15) return 'bg-rose-600 text-white border-rose-300/60';
    if (num <= 30) return 'bg-amber-500 text-slate-950 border-amber-200/70';
    if (num <= 45) return 'bg-emerald-600 text-white border-emerald-300/60';
    if (num <= 60) return 'bg-blue-600 text-white border-blue-300/60';
    return 'bg-violet-600 text-white border-violet-300/60';
  };

  const totalBalance = wallet.depositedBalance + wallet.wonBalance;
  const selectionProgressPct =
    gameState?.phase === 'OPENING' ? Math.max(0, Math.min(100, (secondsLeft / 30) * 100)) : 0;

  const currentCallLocalized = gameState?.currentBall
    ? getLocalizedCallText(gameState.currentBall, language)
    : null;

  const displayedOnline = gameState?.onlineCount ?? lobby?.onlineCount ?? 1;

  return (
    <div className="min-h-screen bg-[#F4F6FB] dark:bg-[#090E1A] text-slate-900 dark:text-slate-50 flex flex-col transition-colors duration-150 overflow-x-hidden">
      {/* FULLSCREEN WINNER TAKEOVER (Fills whole screen for every player when Bingo hits) */}
      {selectedStake !== null && gameState?.phase === 'ENDED' && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-5 text-center bg-gradient-to-br from-blue-900 via-indigo-950 to-slate-950 text-white"
          role="alert"
          aria-live="assertive"
        >
          <div className="max-w-xl w-full space-y-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-amber-400 text-slate-950 shadow-2xl shadow-amber-400/30 mx-auto">
              <Trophy className="w-11 h-11" />
            </div>

            {gameState.winners.length > 0 ? (
              <div className="space-y-4">
                <h1 className="font-display text-4xl sm:text-6xl font-extrabold tracking-tight text-amber-300 leading-none">
                  {t.winnerBanner}
                </h1>
                <div className="space-y-3">
                  {gameState.winners.map((w) => (
                    <div
                      key={`${w.playerId}-${w.cartelaNumber}`}
                      className="p-5 sm:p-6 rounded-3xl bg-white/10 border-2 border-amber-400/70 backdrop-blur-md space-y-2 shadow-2xl"
                    >
                      <div className="font-display text-3xl sm:text-5xl font-extrabold text-white break-words">
                        {w.playerName}
                      </div>
                      <div className="font-mono text-3xl sm:text-5xl font-extrabold text-amber-300 tabular-nums">
                        +{w.prizeAmount} {t.birr}
                      </div>
                      <div className="text-xs sm:text-sm font-semibold text-blue-100/90">
                        {w.isCustom ? t.customCartela : `${t.cartelaNum} #${w.cartelaNumber}`} · {w.patternName}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="font-display text-xl sm:text-3xl font-bold text-white">
                {t.roundNoWinner}
              </p>
            )}

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 font-mono text-sm sm:text-base font-bold text-amber-200 tabular-nums">
              <Sparkles className="w-4 h-4" />
              {t.nextGameStarting} {secondsLeft}s...
            </div>
          </div>
        </div>
      )}

      {/* Clean 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 h-12 sm:h-14 bg-white/90 dark:bg-[#090E1A]/90 backdrop-blur-md border-b border-slate-200 dark:border-[#243152]">
        <div className="max-w-7xl mx-auto h-full px-3 sm:px-6 flex items-center justify-between gap-2">
          <a
            href="#top"
            onClick={handleBrandClick}
            className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-blue-600 dark:text-amber-400 whitespace-nowrap shrink-0 select-none"
          >
            {t.brandName}
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600 dark:text-slate-300">
            <button
              type="button"
              onClick={handleLeaveRoom}
              className={`hover:text-blue-600 dark:hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedStake === null ? 'text-blue-600 dark:text-amber-400' : ''
              }`}
            >
              {t.chooseStake}
            </button>
            {selectedStake !== null && (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab('play')}
                  className={`hover:text-blue-600 dark:hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'play' ? 'text-blue-600 dark:text-amber-400' : ''
                  }`}
                >
                  {t.liveHall}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('winners')}
                  className={`hover:text-blue-600 dark:hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'winners' ? 'text-blue-600 dark:text-amber-400' : ''
                  }`}
                >
                  {t.winners}
                </button>
              </>
            )}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowAdminModal(true)}
                className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-bold bg-amber-400 text-slate-950 hover:bg-amber-300 transition-colors whitespace-nowrap cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {t.adminControls}
              </button>
            )}

            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              aria-label={theme === 'dark' ? t.lightMode : t.darkMode}
              className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-100 dark:bg-[#11182B] border border-slate-200 dark:border-[#243152] text-slate-700 dark:text-amber-300 flex items-center justify-center hover:border-blue-500 cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              aria-label={t.settings}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-500 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="hidden xs:inline sm:inline">{t.settings}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Non-blocking Toast Banner */}
      {toast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-3 w-full max-w-sm pointer-events-none">
          <div
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xl border text-center ${
              toast.type === 'error'
                ? 'bg-rose-600 text-white border-rose-400'
                : 'bg-slate-900 dark:bg-blue-600 text-white border-slate-700 dark:border-blue-400'
            }`}
          >
            {toast.text}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-2.5 sm:px-6 pt-2.5 sm:pt-4 pb-20 md:pb-8 space-y-3 sm:space-y-4">
        {/* Clean Sub-header: Online Count / Room Info + Wallet (Deposited first, then Won) */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-[#243152]">
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 tabular-nums">
            {!wsConnected && (
              <span className="inline-flex items-center gap-1 text-rose-500 font-semibold">
                <WifiOff className="w-3.5 h-3.5" /> {t.reconnecting}
              </span>
            )}
            {selectedStake !== null ? (
              <>
                <button
                  type="button"
                  onClick={handleLeaveRoom}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-[#11182B] border border-slate-200 dark:border-[#243152] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-blue-500 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {t.changeStake}
                </button>
                <span className="font-bold text-blue-600 dark:text-amber-400">
                  {gameState?.stakeBirr ?? selectedStake} {t.birr}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  #{gameState?.roundNumber ?? 1}
                </span>
                {player?.name && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[120px] sm:max-w-none">
                      {player.name}
                    </span>
                  </>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2">
                {player?.name && (
                  <>
                    <span className="font-bold text-slate-900 dark:text-white truncate max-w-[170px] sm:max-w-none">
                      {t.welcome}, {player.name}
                    </span>
                    <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
                  </>
                )}
                <span className="font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                  {displayedOnline} {t.online}
                </span>
              </div>
            )}
          </div>

          {/* Wallet: Deposited FIRST, then Won */}
          <div className="flex items-center gap-2 text-[11px] sm:text-xs font-mono tabular-nums bg-white dark:bg-[#11182B] border border-slate-200 dark:border-[#243152] rounded-xl px-2.5 py-1.5 shadow-xs">
            <Wallet className="w-3.5 h-3.5 text-blue-600 dark:text-amber-400 shrink-0" />
            <span>
              <span className="font-sans text-slate-500 dark:text-slate-400">{t.deposited}:</span>{' '}
              <strong className="text-slate-900 dark:text-white">{wallet.depositedBalance}</strong>
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">|</span>
            <span>
              <span className="font-sans text-slate-500 dark:text-slate-400">{t.won}:</span>{' '}
              <strong className="text-emerald-600 dark:text-emerald-400">{wallet.wonBalance}</strong>
            </span>
          </div>
        </div>

        {/* ENTRY SCREEN */}
        {selectedStake === null ? (
          <LobbyScreen
            rooms={lobby?.rooms || []}
            t={t}
            onJoinRoom={handleJoinRoom}
          />
        ) : (
          <>
            {/* Paused Banner when Admin freezes the room */}
            {gameState?.isPaused && (
              <div className="rounded-xl bg-rose-600/15 border border-rose-500/40 px-3.5 py-2.5 flex items-center gap-2 text-xs sm:text-sm font-semibold text-rose-700 dark:text-rose-200">
                <PauseCircle className="w-4 h-4 shrink-0" />
                {t.pausedByAdmin}
              </div>
            )}

            {/* PLAY TAB */}
            {activeTab === 'play' && (
              <>
                {/* OPENING PHASE (30 -> 0): Mobile-optimized wallet + countdown + CartelaPicker */}
                {gameState?.phase === 'OPENING' && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-4 items-start">
                    <div className="lg:col-span-5 space-y-3.5">
                      <section className="rounded-2xl bg-white dark:bg-[#11182B] border border-slate-200 dark:border-[#243152] p-3.5 sm:p-5 space-y-3 shadow-sm">
                        <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-[#0B1020] border border-slate-200 dark:border-[#243152]">
                          <div>
                            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              {t.deposited}
                            </div>
                            <div className="font-mono text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">
                              {wallet.depositedBalance} {t.birr}
                            </div>
                          </div>
                          <div className="border-l border-slate-200 dark:border-[#243152] pl-2.5">
                            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              {t.won}
                            </div>
                            <div className="font-mono text-base sm:text-lg font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                              {wallet.wonBalance} {t.birr}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-bold text-blue-600 dark:text-amber-400">
                              {gameState.stakeBirr} {t.birr} · {t.selectionOpen}
                            </div>
                            <h1 className="font-display text-lg sm:text-2xl font-extrabold text-slate-900 dark:text-white mt-0.5">
                              {t.pickBeforeZero}
                            </h1>
                          </div>
                          <div className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-900 dark:bg-[#0B1020] border-2 border-amber-400 flex flex-col items-center justify-center">
                            <span className="font-mono text-xl sm:text-2xl font-extrabold text-amber-400 tabular-nums leading-none">
                              {secondsLeft}
                            </span>
                            <span className="text-[9px] font-semibold text-slate-300 mt-0.5">{t.sec}</span>
                          </div>
                        </div>

                        <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-[#0B1020] overflow-hidden">
                          <div
                            className="h-full bg-amber-400 transition-all duration-300"
                            style={{ width: `${selectionProgressPct}%` }}
                          />
                        </div>

                        <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300">
                          {t.timerExplain}
                        </p>
                      </section>

                      {myEntries.length > 0 && (
                        <div className="space-y-3">
                          {myEntries.map((entry) => (
                            <CartelaCard
                              key={entry.entryId}
                              entry={entry}
                              phase={gameState.phase}
                              calledSet={calledSet}
                              currentBall={gameState.currentBall}
                              manualMarks={manualMarks}
                              autoDaub={autoDaub}
                              t={t}
                              onToggleMark={handleToggleManualMark}
                              onRelease={(id) => sendAction({ type: 'release_cartela', entryId: id })}
                              onClaimBingo={(id) => sendAction({ type: 'claim_bingo', entryId: id })}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="lg:col-span-7">
                      <CartelaPicker
                        phase={gameState.phase}
                        secondsRemaining={secondsLeft}
                        entries={gameState.entries}
                        playerId={player?.id || ''}
                        stakeBirr={gameState.stakeBirr}
                        totalBalance={totalBalance}
                        isAdmin={isAdmin}
                        t={t}
                        onSelectCartela={(num) => sendAction({ type: 'select_cartela', cartelaNumber: num })}
                        onSelectCustomCartela={(grid) => sendAction({ type: 'select_custom_cartela', grid })}
                        onReleaseCartela={(id) => sendAction({ type: 'release_cartela', entryId: id })}
                      />
                    </div>
                  </div>
                )}

                {/* CALLING PHASE:
                    1. Top bar: Players count + Net Prize Pool (after house commission)
                    2. Above split: Called Numbers (current ball, recent balls, X/75)
                    3. Side-by-side split (NO swiping): Left = All 75 numbers | Right = Player's Cartela(s) */}
                {(gameState?.phase === 'CALLING' || gameState?.phase === 'ENDED') && (
                  <div className="space-y-2.5 sm:space-y-3.5">
                    {/* 1. Players Count + Net Bet Pool */}
                    <section className="grid grid-cols-2 gap-2 sm:gap-4">
                      <div className="rounded-xl sm:rounded-2xl bg-white dark:bg-[#11182B] border border-slate-200 dark:border-[#243152] px-3 py-2 sm:px-5 sm:py-3 flex items-center justify-between gap-2 shadow-xs">
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                            {t.players}
                          </div>
                          <div className="font-mono text-base sm:text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                            {gameState.displayedPlayersCount ?? gameState.uniquePlayersCount}
                          </div>
                        </div>
                        <Users className="w-4 h-4 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400 shrink-0" />
                      </div>

                      <div className="rounded-xl sm:rounded-2xl bg-white dark:bg-[#11182B] border border-slate-200 dark:border-[#243152] px-3 py-2 sm:px-5 sm:py-3 flex items-center justify-between gap-2 shadow-xs">
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                            {t.betPoolNet}
                          </div>
                          <div className="font-mono text-base sm:text-2xl font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">
                            {gameState.prizePool} {t.birr}
                          </div>
                        </div>
                        <Coins className="w-4 h-4 sm:w-6 sm:h-6 text-amber-500 shrink-0" />
                      </div>
                    </section>

                    {/* 2. Called Numbers Header */}
                    <section className="rounded-xl sm:rounded-2xl bg-white dark:bg-[#11182B] border border-slate-200 dark:border-[#243152] px-3 py-2.5 sm:p-4 shadow-xs">
                      <div className="flex items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {gameState.currentBall ? (
                            <div
                              className={`shrink-0 w-12 h-12 sm:w-16 sm:h-16 rounded-full border-3 sm:border-4 flex flex-col items-center justify-center shadow-md ${ballColorClass(
                                gameState.currentBall
                              )}`}
                            >
                              <span className="text-[9px] sm:text-[10px] font-display font-extrabold leading-none opacity-90">
                                {getBallLetter(gameState.currentBall)}
                              </span>
                              <span className="font-mono text-lg sm:text-2xl font-extrabold leading-none tabular-nums mt-0.5">
                                {gameState.currentBall}
                              </span>
                            </div>
                          ) : (
                            <div className="shrink-0 w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-slate-100 dark:bg-[#18223C] border-2 border-slate-300 dark:border-[#243152] flex items-center justify-center font-mono text-xs">
                              ...
                            </div>
                          )}

                          <div className="min-w-0">
                            <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-amber-400 truncate">
                              {t.callingNow} · {gameState.calledNumbers.length}/75 {t.drawnOf75}
                            </div>
                            <div className="font-display text-base sm:text-2xl font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                              {gameState.currentBall && currentCallLocalized
                                ? currentCallLocalized.display
                                : t.waitingFirstBall}
                            </div>
                          </div>
                        </div>

                        {/* Recent Called Balls */}
                        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                          {recentBalls.map((b, idx) => (
                            <div
                              key={b}
                              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full border flex flex-col items-center justify-center font-mono font-bold tabular-nums ${
                                idx === 0
                                  ? `${ballColorClass(b)} ring-2 ring-amber-400`
                                  : 'bg-slate-100 dark:bg-[#18223C] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#243152]'
                              }`}
                            >
                              <span className="text-[7px] sm:text-[8px] leading-none opacity-80">{getBallLetter(b)}</span>
                              <span className="text-[11px] sm:text-xs leading-tight">{b}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>

                    {/* 3. Side-by-Side Split: LEFT = All 75 Numbers | RIGHT = Player's Cartela(s) */}
                    <div className="grid grid-cols-12 gap-2 sm:gap-4 items-start">
                      <div className="col-span-6">
                        <MasterBoard
                          calledNumbers={gameState.calledNumbers}
                          currentBall={gameState.currentBall}
                          t={t}
                          compact
                        />
                      </div>

                      <div className="col-span-6 space-y-2">
                        {myEntries.length > 0 ? (
                          <>
                            {myEntries.length > 1 && (
                              <div className="flex flex-wrap items-center gap-1">
                                {myEntries.map((e, i) => (
                                  <button
                                    key={e.entryId}
                                    type="button"
                                    onClick={() => setFocusedEntryId(e.entryId)}
                                    className={`px-2 py-1 rounded-lg font-mono text-[11px] font-bold cursor-pointer border transition-colors ${
                                      activeEntry?.entryId === e.entryId
                                        ? 'bg-amber-400 text-slate-950 border-amber-300'
                                        : 'bg-white dark:bg-[#11182B] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#243152]'
                                    }`}
                                  >
                                    {e.isCustom ? `${t.tapForCard} ${i + 1}` : `#${e.cartelaNumber}`}
                                  </button>
                                ))}
                              </div>
                            )}

                            {activeEntry && (
                              <CartelaCard
                                entry={activeEntry}
                                phase={gameState.phase}
                                calledSet={calledSet}
                                currentBall={gameState.currentBall}
                                manualMarks={manualMarks}
                                autoDaub={autoDaub}
                                t={t}
                                compact
                                onToggleMark={handleToggleManualMark}
                                onRelease={(id) => sendAction({ type: 'release_cartela', entryId: id })}
                                onClaimBingo={(id) => sendAction({ type: 'claim_bingo', entryId: id })}
                              />
                            )}
                          </>
                        ) : (
                          <div className="rounded-2xl bg-white dark:bg-[#11182B] border border-slate-200 dark:border-[#243152] p-3 sm:p-5 text-center space-y-1">
                            <h2 className="font-display text-xs sm:text-base font-bold text-slate-900 dark:text-white">
                              {t.spectatingTitle}
                            </h2>
                            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                              {t.spectatingHint}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* WINNERS & LEADERBOARD TAB */}
            {activeTab === 'winners' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
                <section className="rounded-2xl bg-white dark:bg-[#11182B] border border-slate-200 dark:border-[#243152] p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-display text-lg font-bold">{t.recentWinnersAll}</h2>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {gameState?.gamesPlayed ?? 0} {t.roundsInRoom}
                    </span>
                  </div>
                  {!gameState || gameState.recentWinners.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t.noWinnersYet}</p>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-[#243152]">
                      {gameState.recentWinners.map((w, i) => (
                        <div key={`${w.roundNumber}-${w.playerId}-${i}`} className="py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-sm truncate">{w.playerName}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {w.stakeBirr} {t.birr} · {t.round} #{w.roundNumber} · {w.isCustom ? t.customCartela : `#${w.cartelaNumber}`} · {w.patternName}
                            </div>
                          </div>
                          <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">
                            +{w.prizeAmount} {t.birr}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl bg-white dark:bg-[#11182B] border border-slate-200 dark:border-[#243152] p-4 sm:p-5">
                  <h2 className="font-display text-lg font-bold mb-3">{t.leaderboard}</h2>
                  {!gameState || gameState.leaderboard.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t.leaderboardEmpty}</p>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-[#243152]">
                      {gameState.leaderboard.map((entry, idx) => (
                        <div key={entry.playerId} className="py-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono text-xs font-bold text-slate-500 w-5 tabular-nums">
                              {idx + 1}.
                            </span>
                            <span className="font-semibold text-sm truncate">{entry.playerName}</span>
                          </div>
                          <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums shrink-0">
                            {entry.wins} {entry.wins === 1 ? t.winSingular : t.winPlural} · {entry.totalBirrWon} {t.birr}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      {selectedStake !== null && (
        <nav
          aria-label="Mobile Navigation"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#090E1A]/95 backdrop-blur-md border-t border-slate-200 dark:border-[#243152]"
        >
          <div className="grid grid-cols-3 items-center h-14 pb-safe">
            <button
              type="button"
              onClick={() => setActiveTab('play')}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                activeTab === 'play' ? 'text-blue-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="text-[11px] font-semibold tracking-tight">{t.liveHall}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('winners')}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                activeTab === 'winners' ? 'text-blue-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Award className="w-4 h-4" />
              <span className="text-[11px] font-semibold tracking-tight">{t.winners}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-slate-500 dark:text-slate-400 cursor-pointer"
            >
              <Settings className="w-4 h-4" />
              <span className="text-[11px] font-semibold tracking-tight">{t.settings}</span>
            </button>
          </div>
        </nav>
      )}

      {/* Normal Player Settings Modal */}
      <SettingsModal
        open={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        t={t}
        language={language}
        onChangeLanguage={(next) => {
          setLanguage(next);
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'set_language', language: next } satisfies ClientMessage));
          }
        }}
        theme={theme}
        onChangeTheme={setTheme}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((v) => !v)}
        voiceEnabled={voiceEnabled}
        onToggleVoice={() => setVoiceEnabled((v) => !v)}
        autoDaub={autoDaub}
        onToggleAutoDaub={() => setAutoDaub((v) => !v)}
        autoClaim={autoClaim}
        onToggleAutoClaim={handleToggleAutoClaim}
        playerName={player?.name || ''}
        isTelegram={Boolean(player?.isTelegram)}
        onSaveName={handleSaveName}
      />

      {/* Hidden Owner Admin Modal */}
      <AdminModal
        open={showAdminModal}
        onClose={() => setShowAdminModal(false)}
        isAdmin={isAdmin}
        rooms={lobby?.rooms || []}
        activeStake={selectedStake}
        calledNumbersByActiveRoom={gameState?.calledNumbers || []}
        queuedByRoom={queuedByRoom}
        wallets={adminWallets}
        recentWinners={adminRecentWinners.length > 0 ? adminRecentWinners : gameState?.recentWinners || []}
        leaderboard={adminLeaderboard.length > 0 ? adminLeaderboard : gameState?.leaderboard || []}
        isCustomWinners={isCustomWinners}
        isCustomLeaderboard={isCustomLeaderboard}
        settings={
          lobby?.settings || {
            stakes: [10, 20],
            commissionPercent: 20,
            callIntervalSeconds: 3.5,
            onlineCountOverride: null,
          }
        }
        liveOnlineCount={displayedOnline}
        onUnlockAdmin={(pin) => sendAction({ type: 'admin_auth', pin })}
        onPauseRoom={(stakeBirr, paused) => sendAction({ type: 'admin_pause', stakeBirr, paused })}
        onStopRound={(stakeBirr) => sendAction({ type: 'admin_stop_round', stakeBirr })}
        onEndRound={(stakeBirr) => sendAction({ type: 'admin_end_round', stakeBirr })}
        onQueueNumbers={(stakeBirr, numbers) => sendAction({ type: 'admin_queue_numbers', stakeBirr, numbers })}
        onCallNow={(stakeBirr, number) => sendAction({ type: 'admin_call_now', stakeBirr, number })}
        onUpdateSettings={(commissionPercent, callIntervalSeconds) =>
          sendAction({ type: 'admin_update_settings', commissionPercent, callIntervalSeconds })
        }
        onSetOnlineCount={(count) => sendAction({ type: 'admin_set_online_count', count })}
        onSetRoomPlayersCount={(stakeBirr, count) =>
          sendAction({ type: 'admin_set_room_players_count', stakeBirr, count })
        }
        onSetTakeCartelas={(stakeBirr, count) =>
          sendAction({ type: 'admin_set_take_cartelas', stakeBirr, count })
        }
        onResetRounds={(stakeBirr, roundNumber, gamesPlayed) =>
          sendAction({ type: 'admin_reset_rounds', stakeBirr, roundNumber, gamesPlayed })
        }
        onSetWinners={(recentWinners, leaderboard) =>
          sendAction({ type: 'admin_set_winners', recentWinners, leaderboard })
        }
        onAddStake={(stakeBirr) => sendAction({ type: 'admin_add_stake', stakeBirr })}
        onRemoveStake={(stakeBirr) => sendAction({ type: 'admin_remove_stake', stakeBirr })}
        onTopupWallet={(playerId, amount) => sendAction({ type: 'admin_topup_wallet', playerId, amount })}
        onOpenHostGuide={() => setShowHostModal(true)}
      />

      {/* Hosting & Telegram Bot Setup Drawer (accessible only from Admin) */}
      <HostGuideModal
        open={showHostModal}
        onClose={() => setShowHostModal(false)}
        botConfigured={Boolean(lobby?.botConfigured || gameState?.botConfigured)}
      />
    </div>
  );
}

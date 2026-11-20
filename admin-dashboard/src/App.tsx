import React, { useEffect, useMemo, useState } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle,
  ArrowLeftRight,
  Download,
  Gift,
  Landmark,
  LayoutDashboard,
  LogOut,
  Megaphone,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import type { DashboardSnapshot, PlayerRecord, RoundRecord, TransactionRecord } from './types';
import { ButtonsConfigurator } from './components/ButtonsConfigurator';

type NavTab = 'overview' | 'rounds' | 'players' | 'transactions' | 'referrals' | 'broadcast' | 'bot';

interface SavedConnection {
  url: string;
  anonKey: string;
  pin: string;
}

const STORAGE_KEY = 'zemen_admin_supabase_v1';

const PRESET_BANK_ORDER: Array<{ key: string; label: string }> = [
  { key: 'telebirr', label: 'Telebirr' },
  { key: 'cbe', label: 'CBE' },
  { key: 'cbe_birr', label: 'CBE Birr' },
  { key: 'abyssinia', label: 'Abyssinia Bank' },
  { key: 'awash', label: 'Awash Bank' },
  { key: 'kaffi', label: 'Kaffi' },
  { key: 'ebirr', label: 'E-Birr' },
  { key: 'coop', label: 'Coop' },
];

const BANK_LABEL_MAP: Record<string, string> = Object.fromEntries(
  PRESET_BANK_ORDER.map((b) => [b.key, b.label])
);

function resolveBankDisplay(tx: TransactionRecord): string {
  if (tx.bank_key && BANK_LABEL_MAP[tx.bank_key]) {
    return BANK_LABEL_MAP[tx.bank_key];
  }
  return tx.button_label || 'Unspecified';
}

function loadInitialConnection(): SavedConnection {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  const envAnon = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedConnection>;
      return {
        url: envUrl || parsed.url || '',
        anonKey: envAnon || parsed.anonKey || '',
        pin: parsed.pin || '',
      };
    }
  } catch {
    // ignore
  }
  return { url: envUrl, anonKey: envAnon, pin: '' };
}

function fmtBirr(n: number | null | undefined): string {
  const num = Number(n || 0);
  return `${num.toLocaleString('en-US', { maximumFractionDigits: 2 })} Birr`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface BankSummaryRow {
  bankKey: string;
  bankLabel: string;
  depositCount: number;
  depositBirr: number;
  withdrawCount: number;
  withdrawBirr: number;
  pendingCount: number;
  netBirr: number;
  lastActivity: string | null;
}

export default function App() {
  const init = useMemo(loadInitialConnection, []);
  const [urlInput, setUrlInput] = useState(init.url);
  const [anonInput, setAnonInput] = useState(init.anonKey);
  const [pinInput, setPinInput] = useState(init.pin);

  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [activePin, setActivePin] = useState('');
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  const [tab, setTab] = useState<NavTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [txFilterType, setTxFilterType] = useState<'all' | 'deposit' | 'withdraw'>('all');
  const [txFilterStatus, setTxFilterStatus] = useState<string>('all');
  const [txFilterBank, setTxFilterBank] = useState<string>('all');

  const [adjustPlayer, setAdjustPlayer] = useState<PlayerRecord | null>(null);
  const [adjustDepDelta, setAdjustDepDelta] = useState('');
  const [adjustWonDelta, setAdjustWonDelta] = useState('');

  const [signupBonusInput, setSignupBonusInput] = useState('20');
  const [deposit50BonusInput, setDeposit50BonusInput] = useState('20');
  const [depositBonusInput, setDepositBonusInput] = useState('20');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [confirmClearScope, setConfirmClearScope] = useState<string | null>(null);

  const flashNotice = (msg: string) => {
    setNoticeMsg(msg);
    window.setTimeout(() => setNoticeMsg(null), 3500);
  };

  const fetchSnapshot = async (sb: SupabaseClient, pin: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await sb.rpc('admin_get_dashboard', { p_pin: pin });
      if (error) throw new Error(error.message || 'Failed to authenticate with Supabase.');
      const snap = data as DashboardSnapshot;
      setSnapshot(snap);
      setSignupBonusInput(String(snap.settings.referral_signup_bonus ?? 20));
      setDeposit50BonusInput(String(snap.settings.referral_deposit_50_bonus ?? 20));
      setDepositBonusInput(String(snap.settings.referral_deposit_bonus ?? 20));
      setClient(sb);
      setActivePin(pin);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ url: urlInput.trim(), anonKey: anonInput.trim(), pin })
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to connect to Supabase.');
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (init.url && init.anonKey && init.pin) {
      const sb = createClient(init.url, init.anonKey);
      void fetchSnapshot(sb, init.pin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = urlInput.trim();
    const k = anonInput.trim();
    const p = pinInput.trim();
    if (!u || !k || !p) {
      setErrorMsg('Enter Supabase URL, Supabase Anon Key, and Admin PIN.');
      return;
    }
    const sb = createClient(u, k);
    await fetchSnapshot(sb, p);
  };

  const handleDisconnect = () => {
    setClient(null);
    setSnapshot(null);
    setActivePin('');
    setPinInput('');
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ url: urlInput.trim(), anonKey: anonInput.trim(), pin: '' }));
    } catch {
      // ignore
    }
  };

  const refreshData = async () => {
    if (!client || !activePin) return;
    await fetchSnapshot(client, activePin);
    flashNotice('Synced latest data from Supabase.');
  };

  const handleSaveSettings = async (patch: {
    admin_group_id: string;
    extra_group_ids: string;
    deposit_intro_text: string;
    withdraw_intro_text: string;
    withdraw_prompt_text: string;
    new_pin?: string;
  }) => {
    if (!client) return;
    setBusy(true);
    try {
      const { error } = await client.rpc('admin_update_settings', {
        p_pin: activePin,
        p_admin_group_id: patch.admin_group_id,
        p_deposit_intro: patch.deposit_intro_text,
        p_withdraw_intro: patch.withdraw_intro_text,
        p_withdraw_prompt: patch.withdraw_prompt_text,
        p_new_pin: patch.new_pin || null,
        p_extra_group_ids: patch.extra_group_ids,
      });
      if (error) throw new Error(error.message);
      const nextPin = patch.new_pin || activePin;
      await fetchSnapshot(client, nextPin);
      flashNotice('Bot messages & group settings saved.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed saving settings.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveReferralSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;
    const signupAmt = Math.max(0, Number(signupBonusInput) || 0);
    const deposit50Amt = Math.max(0, Number(deposit50BonusInput) || 0);
    const depositAmt = Math.max(0, Number(depositBonusInput) || 0);
    setBusy(true);
    setErrorMsg(null);
    try {
      const { error } = await client.rpc('admin_update_referral_settings', {
        p_pin: activePin,
        p_signup_bonus: signupAmt,
        p_deposit_bonus: depositAmt,
        p_deposit_50_bonus: deposit50Amt,
      });
      if (error) throw new Error(error.message);
      await fetchSnapshot(client, activePin);
      flashNotice(
        `Referral bonuses updated: ${signupAmt} Birr join · ${deposit50Amt} Birr (50+ deposit) · ${depositAmt} Birr (100+ deposit).`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed updating referral bonuses.');
    } finally {
      setBusy(false);
    }
  };

  const handleQueueBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;
    const clean = broadcastMessage.trim();
    if (!clean) {
      setErrorMsg('Enter or paste a message to send to all users.');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      const { error } = await client.rpc('admin_queue_broadcast', {
        p_pin: activePin,
        p_message: clean,
      });
      if (error) throw new Error(error.message);
      setBroadcastMessage('');
      await fetchSnapshot(client, activePin);
      flashNotice('Message queued! The Telegram bot is sending it to all registered users.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed queueing broadcast message.');
    } finally {
      setBusy(false);
    }
  };

  const handleClearData = async (scope: string) => {
    if (!client) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const { error } = await client.rpc('admin_clear_data', {
        p_pin: activePin,
        p_scope: scope,
      });
      if (error) throw new Error(error.message);
      setConfirmClearScope(null);
      await fetchSnapshot(client, activePin);
      flashNotice(`Cleared data scope: ${scope}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed clearing data.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveBankMessage = async (
    id: string,
    responseText: string,
    isActive: boolean,
    label: string
  ) => {
    if (!client) return;
    setBusy(true);
    try {
      const { error } = await client.rpc('admin_update_bank_message', {
        p_pin: activePin,
        p_id: id,
        p_response_text: responseText,
        p_is_active: isActive,
      });
      if (error) throw new Error(error.message);
      await fetchSnapshot(client, activePin);
      flashNotice(`Updated message for ${label}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed updating bank message.');
    } finally {
      setBusy(false);
    }
  };

  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !adjustPlayer) return;
    const depDelta = Number(adjustDepDelta || 0);
    const wonDelta = Number(adjustWonDelta || 0);
    if (!Number.isFinite(depDelta) || !Number.isFinite(wonDelta) || (depDelta === 0 && wonDelta === 0)) {
      return;
    }
    setBusy(true);
    try {
      const { error } = await client.rpc('admin_adjust_player_balance', {
        p_pin: activePin,
        p_player_id: adjustPlayer.id,
        p_deposited_delta: depDelta,
        p_won_delta: wonDelta,
      });
      if (error) throw new Error(error.message);
      setAdjustPlayer(null);
      setAdjustDepDelta('');
      setAdjustWonDelta('');
      await fetchSnapshot(client, activePin);
      flashNotice('Player balance updated in Supabase.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed updating balance.');
    } finally {
      setBusy(false);
    }
  };

  const bankBreakdown = useMemo<BankSummaryRow[]>(() => {
    const txs = snapshot?.transactions || [];
    const map = new Map<string, BankSummaryRow>();
    for (const b of PRESET_BANK_ORDER) {
      map.set(b.key, {
        bankKey: b.key,
        bankLabel: b.label,
        depositCount: 0,
        depositBirr: 0,
        withdrawCount: 0,
        withdrawBirr: 0,
        pendingCount: 0,
        netBirr: 0,
        lastActivity: null,
      });
    }

    for (const tx of txs) {
      const key = tx.bank_key && map.has(tx.bank_key) ? tx.bank_key : null;
      if (!key) continue;
      const row = map.get(key)!;
      if (!row.lastActivity || tx.created_at > row.lastActivity) {
        row.lastActivity = tx.created_at;
      }
      if (tx.status === 'pending') {
        row.pendingCount += 1;
      }
      if (tx.tx_type === 'deposit' && tx.status === 'accepted') {
        row.depositCount += 1;
        row.depositBirr += Number(tx.amount_birr || 0);
      } else if (tx.tx_type === 'withdraw' && tx.status === 'done') {
        row.withdrawCount += 1;
        row.withdrawBirr += Number(tx.amount_birr || 0);
      }
      row.netBirr = row.depositBirr - row.withdrawBirr;
    }

    return Array.from(map.values());
  }, [snapshot]);

  const filteredPlayers = useMemo(() => {
    if (!snapshot) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return snapshot.players;
    return snapshot.players.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.username || '').toLowerCase().includes(q)
    );
  }, [snapshot, searchQuery]);

  const filteredRounds = useMemo(() => {
    if (!snapshot) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return snapshot.rounds;
    return snapshot.rounds.filter(
      (r) =>
        String(r.round_number).includes(q) ||
        String(r.stake_birr).includes(q) ||
        r.winners.some((w) => w.playerName.toLowerCase().includes(q))
    );
  }, [snapshot, searchQuery]);

  const filteredTransactions = useMemo(() => {
    if (!snapshot) return [];
    const q = searchQuery.trim().toLowerCase();
    return snapshot.transactions.filter((tx) => {
      if (txFilterType !== 'all' && tx.tx_type !== txFilterType) return false;
      if (txFilterStatus !== 'all' && tx.status !== txFilterStatus) return false;
      if (txFilterBank !== 'all' && tx.bank_key !== txFilterBank) return false;
      if (!q) return true;
      return (
        tx.player_name.toLowerCase().includes(q) ||
        tx.player_id.toLowerCase().includes(q) ||
        (tx.player_username || '').toLowerCase().includes(q) ||
        resolveBankDisplay(tx).toLowerCase().includes(q) ||
        (tx.resolved_by || '').toLowerCase().includes(q) ||
        (tx.user_message || '').toLowerCase().includes(q)
      );
    });
  }, [snapshot, searchQuery, txFilterType, txFilterStatus, txFilterBank]);

  const filteredReferrals = useMemo(() => {
    const list = snapshot?.referrals || [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) =>
        r.referrer_name.toLowerCase().includes(q) ||
        r.referrer_id.toLowerCase().includes(q) ||
        (r.referrer_username || '').toLowerCase().includes(q) ||
        r.referred_name.toLowerCase().includes(q) ||
        r.referred_id.toLowerCase().includes(q) ||
        (r.referred_username || '').toLowerCase().includes(q)
    );
  }, [snapshot, searchQuery]);

  const topReferrers = useMemo(() => {
    const list = snapshot?.referrals || [];
    const map = new Map<
      string,
      {
        referrerId: string;
        referrerName: string;
        referrerUsername: string | null;
        totalReferred: number;
        qualified50Deposits: number;
        qualifiedDeposits: number;
        totalEarnedBirr: number;
      }
    >();
    for (const r of list) {
      const cur = map.get(r.referrer_id) || {
        referrerId: r.referrer_id,
        referrerName: r.referrer_name,
        referrerUsername: r.referrer_username,
        totalReferred: 0,
        qualified50Deposits: 0,
        qualifiedDeposits: 0,
        totalEarnedBirr: 0,
      };
      cur.totalReferred += 1;
      if (r.deposit_50_bonus_paid) cur.qualified50Deposits += 1;
      if (r.deposit_bonus_paid) cur.qualifiedDeposits += 1;
      cur.totalEarnedBirr +=
        Number(r.signup_bonus_birr || 0) +
        Number(r.deposit_50_bonus_birr || 0) +
        Number(r.deposit_bonus_birr || 0);
      map.set(r.referrer_id, cur);
    }
    return Array.from(map.values()).sort(
      (a, b) => b.totalReferred - a.totalReferred || b.totalEarnedBirr - a.totalEarnedBirr
    );
  }, [snapshot]);

  // Connect / Login Screen
  if (!snapshot || !client) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg p-7">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Zemen Bingo Admin</h1>
            <p className="text-sm text-slate-500 mt-1">
              Connect to your Supabase project to track deposits, withdrawals per bank, players, and house commissions.
            </p>
          </div>

          {errorMsg && (
            <div className="mb-4 px-3.5 py-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleConnect} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Supabase Project URL</label>
              <input
                type="url"
                required
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://your-project.supabase.co"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Supabase Anon Key</label>
              <input
                type="password"
                required
                value={anonInput}
                onChange={(e) => setAnonInput(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIs..."
                className="w-full px-3 py-2 text-sm font-mono-num bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Admin PIN</label>
              <input
                type="password"
                required
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Default: 1234"
                className="w-full px-3 py-2 text-sm font-mono-num bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md cursor-pointer"
            >
              {loading ? 'Connecting...' : 'Open Dashboard'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const navItems: Array<{ id: NavTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'transactions', label: 'Banks, Deposits & Withdrawals', icon: <ArrowLeftRight className="w-4 h-4" /> },
    { id: 'rounds', label: 'Rounds & Commission', icon: <Trophy className="w-4 h-4" /> },
    { id: 'players', label: 'Players & Wallets', icon: <Users className="w-4 h-4" /> },
    { id: 'referrals', label: 'Referrals', icon: <Gift className="w-4 h-4" /> },
    { id: 'broadcast', label: 'Broadcast & Clear Data', icon: <Megaphone className="w-4 h-4" /> },
    { id: 'bot', label: 'Bank Messages & Bot Settings', icon: <Settings2 className="w-4 h-4" /> },
  ];

  const activeTitle = navItems.find((n) => n.id === tab)?.label || 'Overview';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="lg:w-64 shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col justify-between">
        <div>
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <span className="font-display text-base font-bold text-slate-900 tracking-tight whitespace-nowrap">
              Zemen Bingo
            </span>
          </div>

          <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
            {navItems.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTab(item.id);
                    setSearchQuery('');
                  }}
                  className={`flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="hidden lg:block p-4 border-t border-slate-200">
          <button
            type="button"
            onClick={handleDisconnect}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Lock / Disconnect
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-8">
          <div className="text-sm font-medium text-slate-500 whitespace-nowrap">
            <span>Zemen Bingo</span>
            <span className="mx-2 text-slate-300">/</span>
            <span className="text-slate-900 font-semibold">{activeTitle}</span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              disabled={loading}
              onClick={refreshData}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh Data
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
          {errorMsg && (
            <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
              {errorMsg}
            </div>
          )}
          {noticeMsg && (
            <div className="px-4 py-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md">
              {noticeMsg}
            </div>
          )}

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <StatCard label="Total House Commission" value={fmtBirr(snapshot.stats.totalCommissionBirr)} accent="emerald" />
                <StatCard label="Accepted Deposits" value={fmtBirr(snapshot.stats.acceptedDepositsBirr)} />
                <StatCard label="Completed Withdrawals" value={fmtBirr(snapshot.stats.completedWithdrawalsBirr)} />
                <StatCard label="Total Bet Pot" value={fmtBirr(snapshot.stats.totalPotBirr)} />
                <StatCard label="Completed Rounds" value={String(snapshot.stats.totalRounds)} />
                <StatCard
                  label="Players / Pending Requests"
                  value={`${snapshot.stats.totalPlayers} · ${snapshot.stats.pendingRequests} pending`}
                  accent={snapshot.stats.pendingRequests > 0 ? 'amber' : undefined}
                />
              </div>

              {/* Per-Bank Breakdown */}
              <BankBreakdownCard rows={bankBreakdown} />

              {/* Recent Rounds */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">Recent Completed Rounds</h2>
                  <button
                    type="button"
                    onClick={() => setTab('rounds')}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    View all
                  </button>
                </div>
                <RoundsTable rounds={snapshot.rounds.slice(0, 8)} />
              </div>

              {/* Recent Transactions */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">Recent Deposit & Withdraw Activity</h2>
                  <button
                    type="button"
                    onClick={() => setTab('transactions')}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    View all
                  </button>
                </div>
                <TransactionsTable transactions={snapshot.transactions.slice(0, 10)} />
              </div>
            </div>
          )}

          {/* ROUNDS & COMMISSIONS */}
          {tab === 'rounds' && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 min-w-[220px] max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter by round, stake, or winner..."
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      'zemen-bingo-rounds.csv',
                      ['Round', 'Stake Birr', 'Players', 'Cartelas', 'Total Pot', 'Commission %', 'Commission Birr', 'Prize Pool', 'Winners', 'Ended At'],
                      filteredRounds.map((r) => [
                        r.round_number,
                        r.stake_birr,
                        r.players_count,
                        r.entries_count,
                        r.total_pot_birr,
                        r.commission_percent,
                        r.commission_birr,
                        r.prize_pool_birr,
                        r.winners.map((w) => `${w.playerName} (#${w.cartelaNumber})`).join('; '),
                        r.ended_at,
                      ])
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download CSV
                </button>
              </div>
              <RoundsTable rounds={filteredRounds} />
            </div>
          )}

          {/* PLAYERS & WALLETS */}
          {tab === 'players' && (
            <div className="space-y-4">
              {adjustPlayer && (
                <form
                  onSubmit={handleAdjustBalance}
                  className="bg-white border border-slate-200 rounded-lg p-5 flex flex-wrap items-end gap-4"
                >
                  <div>
                    <p className="text-xs text-slate-500">Adjust Balance for</p>
                    <p className="text-sm font-semibold text-slate-900">{adjustPlayer.name}</p>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Deposited +/- Birr</label>
                    <input
                      type="number"
                      step="any"
                      value={adjustDepDelta}
                      onChange={(e) => setAdjustDepDelta(e.target.value)}
                      placeholder="e.g. 100 or -50"
                      className="w-40 px-3 py-1.5 text-sm font-mono-num bg-slate-50 border border-slate-200 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Won +/- Birr</label>
                    <input
                      type="number"
                      step="any"
                      value={adjustWonDelta}
                      onChange={(e) => setAdjustWonDelta(e.target.value)}
                      placeholder="e.g. 0 or -100"
                      className="w-40 px-3 py-1.5 text-sm font-mono-num bg-slate-50 border border-slate-200 rounded-md"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md cursor-pointer"
                    >
                      Apply Adjustment
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustPlayer(null)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-md cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search player name, username, or ID..."
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="py-2.5 px-4">Player Name</th>
                        <th className="py-2.5 px-4">Telegram ID</th>
                        <th className="py-2.5 px-4">Lang</th>
                        <th className="py-2.5 px-4 text-right">Deposited</th>
                        <th className="py-2.5 px-4 text-right">Won</th>
                        <th className="py-2.5 px-4 text-right">Total</th>
                        <th className="py-2.5 px-4">Updated</th>
                        <th className="py-2.5 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {filteredPlayers.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-500">
                            No players found yet.
                          </td>
                        </tr>
                      ) : (
                        filteredPlayers.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-4 font-medium text-slate-900">
                              {p.name}
                              {p.username && <span className="text-xs text-slate-400 ml-1.5">@{p.username}</span>}
                            </td>
                            <td className="py-2.5 px-4 text-xs font-mono-num text-slate-500">{p.id}</td>
                            <td className="py-2.5 px-4 text-xs uppercase text-slate-600">{p.language}</td>
                            <td className="py-2.5 px-4 text-right font-mono-num text-slate-900">{p.deposited_birr}</td>
                            <td className="py-2.5 px-4 text-right font-mono-num text-emerald-700">{p.won_birr}</td>
                            <td className="py-2.5 px-4 text-right font-mono-num font-semibold text-slate-900">
                              {Number(p.deposited_birr) + Number(p.won_birr)} Birr
                            </td>
                            <td className="py-2.5 px-4 text-xs text-slate-500">{fmtDate(p.updated_at)}</td>
                            <td className="py-2.5 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => setAdjustPlayer(p)}
                                className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                              >
                                Adjust
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* BANKS, DEPOSITS & WITHDRAWALS */}
          {tab === 'transactions' && (
            <div className="space-y-6">
              <BankBreakdownCard rows={bankBreakdown} />

              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center gap-3 justify-between">
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search player, bank, approver, or message..."
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={txFilterBank}
                      onChange={(e) => setTxFilterBank(e.target.value)}
                      className="px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-md"
                    >
                      <option value="all">All Banks</option>
                      {PRESET_BANK_ORDER.map((b) => (
                        <option key={b.key} value={b.key}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={txFilterType}
                      onChange={(e) => setTxFilterType(e.target.value as 'all' | 'deposit' | 'withdraw')}
                      className="px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-md"
                    >
                      <option value="all">All Types</option>
                      <option value="deposit">Deposits</option>
                      <option value="withdraw">Withdrawals</option>
                    </select>
                    <select
                      value={txFilterStatus}
                      onChange={(e) => setTxFilterStatus(e.target.value)}
                      className="px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-md"
                    >
                      <option value="all">All Statuses</option>
                      <option value="pending">Pending</option>
                      <option value="accepted">Accepted</option>
                      <option value="rejected">Rejected</option>
                      <option value="done">Done</option>
                      <option value="incorrect">Incorrect</option>
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        downloadCsv(
                          'zemen-bingo-transactions.csv',
                          ['Type', 'Player Name', 'Username', 'Telegram ID', 'Bank', 'Amount Birr', 'Status', 'Submitted Details', 'Processed By', 'Requested At', 'Resolved At'],
                          filteredTransactions.map((tx) => [
                            tx.tx_type,
                            tx.player_name,
                            tx.player_username ? `@${tx.player_username}` : '',
                            tx.player_id,
                            resolveBankDisplay(tx),
                            tx.amount_birr ?? '',
                            tx.status,
                            `${tx.user_photo_file_id ? '[Photo] ' : ''}${tx.user_message || ''}`,
                            tx.resolved_by || '',
                            tx.created_at,
                            tx.resolved_at || '',
                          ])
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      CSV
                    </button>
                  </div>
                </div>
                <TransactionsTable transactions={filteredTransactions} />
              </div>
            </div>
          )}

          {/* REFERRALS */}
          {tab === 'referrals' && (
            <div className="space-y-6">
              {/* Bonus Amount Settings */}
              <form
                onSubmit={handleSaveReferralSettings}
                className="bg-white border border-slate-200 rounded-lg p-6 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Referral Bonus Amounts</h2>
                    <p className="text-sm text-slate-500 mt-0.5">
                      Changing either amount updates both payout logic and bot referral messages in English, Amharic, and Afaan Oromo automatically.
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    Save Referral Amounts
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Join Bonus (Birr — when referred person joins)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={signupBonusInput}
                      onChange={(e) => setSignupBonusInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono-num bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      First 50+ Birr Deposit Bonus (Birr — when they deposit ≥ 50 Birr)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={deposit50BonusInput}
                      onChange={(e) => setDeposit50BonusInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono-num bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      First 100+ Birr Deposit Bonus (Birr — when they deposit ≥ 100 Birr)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={depositBonusInput}
                      onChange={(e) => setDepositBonusInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono-num bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
                    />
                  </div>
                </div>
              </form>

              {/* Referral Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total Referrals" value={String(snapshot.stats.totalReferrals ?? (snapshot.referrals?.length || 0))} />
                <StatCard
                  label="First 50+ Birr Deposits"
                  value={String(snapshot.stats.qualified50Deposits ?? 0)}
                  accent="emerald"
                />
                <StatCard
                  label="First 100+ Birr Deposits"
                  value={String(snapshot.stats.qualifiedReferralDeposits ?? 0)}
                  accent="emerald"
                />
                <StatCard
                  label="Total Referral Bonuses Paid"
                  value={fmtBirr(snapshot.stats.totalReferralBonusesBirr ?? 0)}
                  accent="amber"
                />
              </div>

              {/* Top Referrers (Who Referred the Most) */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">Top Referrers (Who Referred the Most)</h2>
                  <span className="text-xs text-slate-500">{topReferrers.length} referrer(s)</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="py-2.5 px-4">Rank</th>
                        <th className="py-2.5 px-4">Referrer</th>
                        <th className="py-2.5 px-4">Telegram ID</th>
                        <th className="py-2.5 px-4 text-right">People Referred</th>
                        <th className="py-2.5 px-4 text-right">50+ Deposits</th>
                        <th className="py-2.5 px-4 text-right">100+ Deposits</th>
                        <th className="py-2.5 px-4 text-right">Total Bonus Earned</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {topReferrers.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-500">
                            No referrals recorded yet.
                          </td>
                        </tr>
                      ) : (
                        topReferrers.map((row, idx) => (
                          <tr key={row.referrerId} className="hover:bg-slate-50">
                            <td className="py-2.5 px-4 font-mono-num font-bold text-slate-700">#{idx + 1}</td>
                            <td className="py-2.5 px-4 font-medium text-slate-900">
                              {row.referrerName}
                              {row.referrerUsername && (
                                <span className="text-xs text-slate-400 ml-1.5">@{row.referrerUsername}</span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-xs font-mono-num text-slate-500">{row.referrerId}</td>
                            <td className="py-2.5 px-4 text-right font-mono-num font-bold text-slate-900">
                              {row.totalReferred}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono-num text-emerald-700">
                              {row.qualified50Deposits}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono-num text-emerald-700">
                              {row.qualifiedDeposits}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono-num font-semibold text-amber-700">
                              {row.totalEarnedBirr} Birr
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Who Referred Who */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Who Referred Who</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[220px]">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search referrer or referred..."
                        className="w-full pl-9 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        downloadCsv(
                          'zemen-bingo-referrals.csv',
                          [
                            'Referrer Name',
                            'Referrer ID',
                            'Referred Name',
                            'Referred ID',
                            'Join Bonus Birr',
                            '50+ Deposit Bonus Birr',
                            'First 50+ Deposit Paid',
                            '100+ Deposit Bonus Birr',
                            'First 100+ Deposit Paid',
                            'First Deposit Birr',
                            'Joined At',
                          ],
                          filteredReferrals.map((r) => [
                            r.referrer_name,
                            r.referrer_id,
                            r.referred_name,
                            r.referred_id,
                            r.signup_bonus_birr,
                            r.deposit_50_bonus_birr ?? 0,
                            r.deposit_50_bonus_paid ? 'Yes' : 'No',
                            r.deposit_bonus_birr,
                            r.deposit_bonus_paid ? 'Yes' : 'No',
                            r.first_qualifying_deposit_birr ?? r.first_50_deposit_birr ?? '',
                            r.created_at,
                          ])
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      CSV
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="py-2.5 px-4">Referrer</th>
                        <th className="py-2.5 px-4">Referred User</th>
                        <th className="py-2.5 px-4 text-right">Join Bonus</th>
                        <th className="py-2.5 px-4 text-right">50+ Bonus</th>
                        <th className="py-2.5 px-4 text-right">100+ Bonus</th>
                        <th className="py-2.5 px-4">Deposit Status</th>
                        <th className="py-2.5 px-4">Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {filteredReferrals.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-500">
                            No referral records match your search.
                          </td>
                        </tr>
                      ) : (
                        filteredReferrals.map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-4">
                              <div className="font-medium text-slate-900">
                                {r.referrer_name}
                                {r.referrer_username && (
                                  <span className="text-xs text-slate-400 ml-1">@{r.referrer_username}</span>
                                )}
                              </div>
                              <div className="text-xs font-mono-num text-slate-400">{r.referrer_id}</div>
                            </td>
                            <td className="py-2.5 px-4">
                              <div className="font-medium text-slate-900">
                                {r.referred_name}
                                {r.referred_username && (
                                  <span className="text-xs text-slate-400 ml-1">@{r.referred_username}</span>
                                )}
                              </div>
                              <div className="text-xs font-mono-num text-slate-400">{r.referred_id}</div>
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono-num font-semibold text-slate-900">
                              +{r.signup_bonus_birr} Birr
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono-num font-semibold text-emerald-700">
                              {r.deposit_50_bonus_paid ? `+${r.deposit_50_bonus_birr ?? 0} Birr` : '0 Birr'}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono-num font-semibold text-emerald-700">
                              {r.deposit_bonus_paid ? `+${r.deposit_bonus_birr} Birr` : '0 Birr'}
                            </td>
                            <td className="py-2.5 px-4 text-xs">
                              {r.deposit_bonus_paid ? (
                                <span className="text-emerald-700 font-semibold">
                                  100+ Paid ({r.first_qualifying_deposit_birr ?? 100}+ Birr)
                                </span>
                              ) : r.deposit_50_bonus_paid ? (
                                <span className="text-amber-700 font-semibold">
                                  50+ Paid ({r.first_50_deposit_birr ?? 50}+ Birr)
                                </span>
                              ) : (
                                <span className="text-slate-500">Waiting 50+/100+ deposit</span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-xs text-slate-500 whitespace-nowrap">
                              {fmtDate(r.created_at)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* BROADCAST & CLEAR DATA */}
          {tab === 'broadcast' && (
            <div className="space-y-6">
              {/* Broadcast Message to All Bot Users */}
              <form
                onSubmit={handleQueueBroadcast}
                className="bg-white border border-slate-200 rounded-lg p-6 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Broadcast Message to All Bot Users</h2>
                    <p className="text-sm text-slate-500 mt-0.5">
                      Paste any announcement, promo, or update below and the Telegram bot will deliver it to all {snapshot.stats.totalPlayers} registered users.
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={busy || !broadcastMessage.trim()}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Megaphone className="w-4 h-4" />
                    Send to All Users
                  </button>
                </div>

                <textarea
                  rows={5}
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  placeholder="Paste the message you want the Telegram bot to send to every player..."
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
                />
              </form>

              {/* Recent Broadcasts History */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">Broadcast Delivery History</h2>
                  <button
                    type="button"
                    onClick={refreshData}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Check status
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="py-2.5 px-4">Message</th>
                        <th className="py-2.5 px-4">Status</th>
                        <th className="py-2.5 px-4 text-right">Sent / Total</th>
                        <th className="py-2.5 px-4 text-right">Failed</th>
                        <th className="py-2.5 px-4">Queued</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {(snapshot.broadcasts || []).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-500">
                            No broadcast messages sent yet.
                          </td>
                        </tr>
                      ) : (
                        (snapshot.broadcasts || []).map((bc) => (
                          <tr key={bc.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-4 text-slate-700 max-w-md truncate">{bc.message_text}</td>
                            <td className="py-2.5 px-4 text-xs uppercase font-semibold text-slate-700">
                              {bc.status}
                              {bc.error_message && (
                                <span className="block text-[11px] font-normal text-red-600 normal-case">
                                  {bc.error_message}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono-num text-emerald-700 font-semibold">
                              {bc.sent_count} / {bc.total_count}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono-num text-red-600">
                              {bc.failed_count}
                            </td>
                            <td className="py-2.5 px-4 text-xs text-slate-500 whitespace-nowrap">
                              {fmtDate(bc.created_at)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Clear Data Section */}
              <div className="bg-white border border-red-200 rounded-lg p-6 space-y-4">
                <div className="flex items-start gap-3 pb-4 border-b border-red-100">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Clear Database Records</h2>
                    <p className="text-sm text-slate-500 mt-0.5">
                      Permanently delete historical records from Supabase. Your bot settings, Admin PIN, and bank messages are preserved.
                    </p>
                  </div>
                </div>

                {confirmClearScope && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-md flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-medium text-red-900">
                      Are you sure you want to permanently clear <strong>{confirmClearScope}</strong>? This action cannot be undone.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleClearData(confirmClearScope)}
                        className="px-3.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-md cursor-pointer"
                      >
                        Yes, Permanently Clear
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmClearScope(null)}
                        className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { scope: 'rounds', title: 'Clear Rounds History', desc: 'Delete completed game rounds & commission logs.' },
                    { scope: 'transactions', title: 'Clear Transactions', desc: 'Delete deposit & withdrawal request logs.' },
                    { scope: 'referrals', title: 'Clear Referrals', desc: 'Delete who-referred-who history.' },
                    { scope: 'broadcasts', title: 'Clear Broadcast Logs', desc: 'Delete past broadcast delivery history.' },
                    { scope: 'players', title: 'Clear Players & Wallets', desc: 'Delete all player accounts and wallet balances.' },
                    { scope: 'all', title: 'Clear All Activity Data', desc: 'Reset rounds, transactions, referrals, broadcasts & players.' },
                  ].map((item) => (
                    <div
                      key={item.scope}
                      className="p-4 border border-slate-200 rounded-md flex flex-col justify-between gap-3 bg-slate-50"
                    >
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                        <p className="text-xs text-slate-500 mt-1">{item.desc}</p>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmClearScope(item.scope)}
                        className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                          item.scope === 'all'
                            ? 'text-white bg-red-600 hover:bg-red-700'
                            : 'text-red-700 bg-white border border-red-200 hover:bg-red-50'
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {item.title}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* BANK MESSAGES & BOT SETTINGS */}
          {tab === 'bot' && (
            <ButtonsConfigurator
              settings={snapshot.settings}
              buttons={snapshot.payment_buttons}
              busy={busy}
              onSaveSettings={handleSaveSettings}
              onSaveBankMessage={handleSaveBankMessage}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: 'emerald' | 'amber' }) {
  const valColor =
    accent === 'emerald'
      ? 'text-emerald-700'
      : accent === 'amber'
      ? 'text-amber-700'
      : 'text-slate-900';
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1.5 text-xl font-bold font-mono-num ${valColor}`}>{value}</p>
    </div>
  );
}

function BankBreakdownCard({ rows }: { rows: BankSummaryRow[] }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
        <Landmark className="w-4 h-4 text-slate-700" />
        <h2 className="text-sm font-semibold text-slate-900">
          Bank Totals (Detected from Bot & Admin Group Approvals)
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="py-2.5 px-4">Bank / Wallet</th>
              <th className="py-2.5 px-4 text-right">Deposits (#)</th>
              <th className="py-2.5 px-4 text-right">Deposited Birr</th>
              <th className="py-2.5 px-4 text-right">Withdrawals (#)</th>
              <th className="py-2.5 px-4 text-right">Withdrawn Birr</th>
              <th className="py-2.5 px-4 text-right">Net Flow</th>
              <th className="py-2.5 px-4 text-right">Pending</th>
              <th className="py-2.5 px-4">Last Activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {rows.map((r) => (
              <tr key={r.bankKey} className="hover:bg-slate-50">
                <td className="py-2.5 px-4 font-semibold text-slate-900">{r.bankLabel}</td>
                <td className="py-2.5 px-4 text-right font-mono-num text-slate-700">{r.depositCount}</td>
                <td className="py-2.5 px-4 text-right font-mono-num font-semibold text-emerald-700">
                  +{r.depositBirr.toLocaleString('en-US', { maximumFractionDigits: 2 })} Birr
                </td>
                <td className="py-2.5 px-4 text-right font-mono-num text-slate-700">{r.withdrawCount}</td>
                <td className="py-2.5 px-4 text-right font-mono-num font-semibold text-amber-700">
                  -{r.withdrawBirr.toLocaleString('en-US', { maximumFractionDigits: 2 })} Birr
                </td>
                <td
                  className={`py-2.5 px-4 text-right font-mono-num font-semibold ${
                    r.netBirr >= 0 ? 'text-slate-900' : 'text-red-700'
                  }`}
                >
                  {r.netBirr.toLocaleString('en-US', { maximumFractionDigits: 2 })} Birr
                </td>
                <td className="py-2.5 px-4 text-right font-mono-num text-slate-600">{r.pendingCount}</td>
                <td className="py-2.5 px-4 text-xs text-slate-500 whitespace-nowrap">{fmtDate(r.lastActivity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoundsTable({ rounds }: { rounds: RoundRecord[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
            <th className="py-2.5 px-4">Round</th>
            <th className="py-2.5 px-4">Room</th>
            <th className="py-2.5 px-4 text-right">Players</th>
            <th className="py-2.5 px-4 text-right">Total Pot</th>
            <th className="py-2.5 px-4 text-right">Commission</th>
            <th className="py-2.5 px-4 text-right">Prize Pool</th>
            <th className="py-2.5 px-4">Winner(s)</th>
            <th className="py-2.5 px-4">Ended</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm">
          {rounds.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-8 text-center text-slate-500">
                No completed rounds recorded yet.
              </td>
            </tr>
          ) : (
            rounds.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="py-2.5 px-4 font-mono-num font-medium text-slate-900">#{r.round_number}</td>
                <td className="py-2.5 px-4 font-mono-num text-slate-700">{r.stake_birr} Birr</td>
                <td className="py-2.5 px-4 text-right font-mono-num text-slate-700">
                  {r.players_count} ({r.entries_count})
                </td>
                <td className="py-2.5 px-4 text-right font-mono-num text-slate-900">{r.total_pot_birr} Birr</td>
                <td className="py-2.5 px-4 text-right font-mono-num font-semibold text-emerald-700">
                  +{r.commission_birr} Birr ({r.commission_percent}%)
                </td>
                <td className="py-2.5 px-4 text-right font-mono-num text-slate-900">{r.prize_pool_birr} Birr</td>
                <td className="py-2.5 px-4 text-slate-700">
                  {r.winners.length > 0
                    ? r.winners.map((w) => `${w.playerName} (#${w.cartelaNumber})`).join(', ')
                    : 'No winner'}
                </td>
                <td className="py-2.5 px-4 text-xs text-slate-500 whitespace-nowrap">{fmtDate(r.ended_at)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function TransactionsTable({ transactions }: { transactions: TransactionRecord[] }) {
  const statusStyle = (status: TransactionRecord['status']) => {
    if (status === 'accepted' || status === 'done') return 'text-emerald-700 font-semibold';
    if (status === 'rejected' || status === 'incorrect') return 'text-red-700 font-semibold';
    return 'text-amber-700 font-semibold';
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
            <th className="py-2.5 px-4">Type</th>
            <th className="py-2.5 px-4">Player</th>
            <th className="py-2.5 px-4">Bank</th>
            <th className="py-2.5 px-4">Submitted Details</th>
            <th className="py-2.5 px-4 text-right">Amount</th>
            <th className="py-2.5 px-4">Status</th>
            <th className="py-2.5 px-4">Processed By</th>
            <th className="py-2.5 px-4">Requested</th>
            <th className="py-2.5 px-4">Resolved</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm">
          {transactions.length === 0 ? (
            <tr>
              <td colSpan={9} className="py-8 text-center text-slate-500">
                No deposit or withdrawal requests yet.
              </td>
            </tr>
          ) : (
            transactions.map((tx) => (
              <tr key={tx.id} className="hover:bg-slate-50">
                <td className="py-2.5 px-4 capitalize font-medium text-slate-900">{tx.tx_type}</td>
                <td className="py-2.5 px-4 text-slate-900">
                  <div className="font-medium">
                    {tx.player_name}
                    {tx.player_username && (
                      <span className="text-xs text-slate-400 ml-1">@{tx.player_username}</span>
                    )}
                  </div>
                  <div className="text-xs font-mono-num text-slate-400">{tx.player_id}</div>
                </td>
                <td className="py-2.5 px-4 font-medium text-slate-800 whitespace-nowrap">
                  {resolveBankDisplay(tx)}
                </td>
                <td className="py-2.5 px-4 text-slate-600 max-w-xs truncate">
                  {tx.user_photo_file_id ? '[Photo] ' : ''}
                  {tx.user_message || '—'}
                </td>
                <td className="py-2.5 px-4 text-right font-mono-num font-semibold text-slate-900 whitespace-nowrap">
                  {tx.amount_birr ? `${tx.amount_birr} Birr` : '—'}
                </td>
                <td className={`py-2.5 px-4 text-xs uppercase ${statusStyle(tx.status)}`}>{tx.status}</td>
                <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                  {tx.resolved_by || '—'}
                </td>
                <td className="py-2.5 px-4 text-xs text-slate-500 whitespace-nowrap">{fmtDate(tx.created_at)}</td>
                <td className="py-2.5 px-4 text-xs text-slate-500 whitespace-nowrap">{fmtDate(tx.resolved_at)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  PRESET_BANKS,
  type AppLanguage,
  type LeaderboardEntry,
  type PlayerWallet,
  type PresetBankKey,
  type RoundWinner,
} from './shared/bingo.ts';

export interface PaymentButtonRecord {
  id: string;
  flow_type: 'deposit' | 'withdraw';
  bank_key: PresetBankKey;
  label: string;
  response_text: string;
  sort_order: number;
  is_active: boolean;
}

export interface BotAppConfig {
  adminGroupId: string;
  extraGroupIds: string[];
  depositIntroText: string;
  withdrawIntroText: string;
  withdrawPromptText: string;
  commissionPercent: number;
  callIntervalMs: number;
  adminPin: string;
  referralSignupBonus: number;
  referralDeposit50Bonus: number;
  referralDepositBonus: number;
  customRecentWinners: RoundWinner[] | null;
  customLeaderboard: LeaderboardEntry[] | null;
}

export interface BotSessionRecord {
  telegram_user_id: string;
  language: AppLanguage;
  pending_action: 'awaiting_deposit_proof' | 'awaiting_withdraw_info' | null;
  selected_button_id: string | null;
  selected_button_label: string | null;
  selected_bank_key: PresetBankKey | null;
}

export interface AdminGroupMessageRef {
  chat_id: string;
  message_id: number;
}

export interface TransactionRecord {
  id: string;
  player_id: string;
  player_name: string;
  player_username: string | null;
  tx_type: 'deposit' | 'withdraw';
  bank_key: string | null;
  button_id: string | null;
  button_label: string | null;
  user_message: string | null;
  user_photo_file_id: string | null;
  amount_birr: number | null;
  status: 'pending' | 'accepted' | 'rejected' | 'done' | 'incorrect';
  resolved_by: string | null;
  admin_group_id: string | null;
  admin_group_message_id: number | null;
  admin_group_messages?: AdminGroupMessageRef[];
  created_at: string;
  resolved_at: string | null;
}

export interface StoredPlayerRow {
  id: string;
  name: string;
  username: string | null;
  language: AppLanguage;
  deposited_birr: number;
  won_birr: number;
  updated_at: string;
}

export interface ReferralRecord {
  id: string;
  referrer_id: string;
  referrer_name: string;
  referrer_username: string | null;
  referred_id: string;
  referred_name: string;
  referred_username: string | null;
  signup_bonus_birr: number;
  deposit_50_bonus_birr: number;
  deposit_50_bonus_paid: boolean;
  first_50_deposit_birr: number | null;
  deposit_50_bonus_paid_at: string | null;
  deposit_bonus_birr: number;
  deposit_bonus_paid: boolean;
  first_qualifying_deposit_birr: number | null;
  created_at: string;
  deposit_bonus_paid_at: string | null;
}

export interface BotBroadcastRecord {
  id: string;
  message_text: string;
  status: 'pending' | 'sending' | 'completed' | 'failed';
  total_count: number;
  sent_count: number;
  failed_count: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export function parseGroupIdList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,;]+/)) {
    const cleaned = part.trim();
    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      out.push(cleaned);
    }
  }
  return out;
}

function buildDefaultPresetButtons(): PaymentButtonRecord[] {
  const rows: PaymentButtonRecord[] = [];
  for (const b of PRESET_BANKS) {
    rows.push({
      id: `preset_dep_${b.key}`,
      flow_type: 'deposit',
      bank_key: b.key,
      label: b.names.en,
      response_text: `Send your deposit via ${b.names.en}, then reply here with a screenshot or confirmation message.`,
      sort_order: b.sortOrder,
      is_active: true,
    });
  }
  for (const b of PRESET_BANKS) {
    rows.push({
      id: `preset_wd_${b.key}`,
      flow_type: 'withdraw',
      bank_key: b.key,
      label: b.names.en,
      response_text: '',
      sort_order: b.sortOrder,
      is_active: true,
    });
  }
  return rows;
}

class SupabaseStore {
  private client: SupabaseClient | null = null;
  public readonly isEnabled: boolean = false;

  private memConfig: BotAppConfig = {
    adminGroupId: (process.env.ADMIN_GROUP_ID || '').trim(),
    extraGroupIds: parseGroupIdList(process.env.EXTRA_ADMIN_GROUP_IDS || ''),
    depositIntroText: 'Choose a bank or wallet below to deposit:',
    withdrawIntroText: 'Choose your withdrawal bank or wallet below:',
    withdrawPromptText: 'Send your full name, account number, and the Birr amount you want to withdraw:',
    commissionPercent: Math.min(80, Math.max(0, Number(process.env.COMMISSION_PERCENT) || 20)),
    callIntervalMs: Math.max(1500, Math.round((Number(process.env.CALL_INTERVAL_SECONDS) || 3.5) * 1000)),
    adminPin: (process.env.ADMIN_PIN || '1234').trim(),
    referralSignupBonus: 20,
    referralDeposit50Bonus: 20,
    referralDepositBonus: 20,
    customRecentWinners: null,
    customLeaderboard: null,
  };

  private memButtons: PaymentButtonRecord[] = buildDefaultPresetButtons();
  private memSessions = new Map<string, BotSessionRecord>();
  private memTransactions = new Map<string, TransactionRecord>();
  private memReferralsByReferred = new Map<string, ReferralRecord>();
  private memKnownPlayerIds = new Set<string>();

  constructor() {
    const url = (process.env.SUPABASE_URL || '').trim();
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (url && key) {
      this.client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      this.isEnabled = true;
      console.log('[Supabase] Connected via HTTPS API.');
    } else {
      console.log(
        '[Supabase] Not configured yet (running with in-memory fallback until SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY are set).'
      );
    }
  }

  public getAllTargetGroupIds(config: BotAppConfig): string[] {
    const list: string[] = [];
    const seen = new Set<string>();
    const add = (id: string | undefined | null) => {
      const cleaned = (id || '').trim();
      if (cleaned && !seen.has(cleaned)) {
        seen.add(cleaned);
        list.push(cleaned);
      }
    };
    add(config.adminGroupId);
    add(process.env.ADMIN_GROUP_ID);
    for (const extra of config.extraGroupIds) {
      add(extra);
    }
    return list;
  }

  public async loadInitialSnapshot(): Promise<{
    config: BotAppConfig;
    players: StoredPlayerRow[];
    recentRounds: Array<{ winners: RoundWinner[]; ended_at: string }>;
  }> {
    if (!this.client) {
      return { config: { ...this.memConfig, extraGroupIds: [...this.memConfig.extraGroupIds] }, players: [], recentRounds: [] };
    }
    try {
      const [settingsRes, playersRes, roundsRes] = await Promise.all([
        this.client.from('app_settings').select('*').eq('id', 1).maybeSingle(),
        this.client.from('players').select('id, name, username, language, deposited_birr, won_birr, updated_at').limit(1000),
        this.client.from('rounds').select('winners, ended_at').order('ended_at', { ascending: false }).limit(30),
      ]);

      if (settingsRes.data) {
        this.applySettingsRow(settingsRes.data);
      }

      const players: StoredPlayerRow[] = (playersRes.data || []).map((p) => {
        const id = String(p.id);
        this.memKnownPlayerIds.add(id);
        return {
          id,
          name: String(p.name || 'Player'),
          username: p.username ? String(p.username) : null,
          language: p.language === 'am' || p.language === 'om' ? p.language : 'en',
          deposited_birr: Number(p.deposited_birr) || 0,
          won_birr: Number(p.won_birr) || 0,
          updated_at: String(p.updated_at || new Date().toISOString()),
        };
      });

      const recentRounds = (roundsRes.data || []).map((r) => ({
        winners: Array.isArray(r.winners) ? (r.winners as RoundWinner[]) : [],
        ended_at: String(r.ended_at),
      }));

      return { config: { ...this.memConfig, extraGroupIds: [...this.memConfig.extraGroupIds] }, players, recentRounds };
    } catch (err) {
      console.error('[Supabase] Initial load error:', err);
      return { config: { ...this.memConfig, extraGroupIds: [...this.memConfig.extraGroupIds] }, players: [], recentRounds: [] };
    }
  }

  private applySettingsRow(s: Record<string, any>) {
    const envGroup = (process.env.ADMIN_GROUP_ID || '').trim();
    const signupBonus = Number(s.referral_signup_bonus);
    const deposit50Bonus = Number(s.referral_deposit_50_bonus);
    const depositBonus = Number(s.referral_deposit_bonus);
    this.memConfig = {
      adminGroupId: String(s.admin_group_id || envGroup || '').trim(),
      extraGroupIds: parseGroupIdList(s.extra_group_ids ? String(s.extra_group_ids) : ''),
      depositIntroText: String(s.deposit_intro_text || this.memConfig.depositIntroText),
      withdrawIntroText: String(s.withdraw_intro_text || this.memConfig.withdrawIntroText),
      withdrawPromptText: String(s.withdraw_prompt_text || this.memConfig.withdrawPromptText),
      commissionPercent: Number.isFinite(Number(s.commission_percent))
        ? Number(s.commission_percent)
        : this.memConfig.commissionPercent,
      callIntervalMs: Number.isFinite(Number(s.call_interval_ms))
        ? Number(s.call_interval_ms)
        : this.memConfig.callIntervalMs,
      adminPin: String(s.admin_pin || this.memConfig.adminPin),
      referralSignupBonus: Number.isFinite(signupBonus) && signupBonus >= 0 ? signupBonus : 20,
      referralDeposit50Bonus: Number.isFinite(deposit50Bonus) && deposit50Bonus >= 0 ? deposit50Bonus : 20,
      referralDepositBonus: Number.isFinite(depositBonus) && depositBonus >= 0 ? depositBonus : 20,
      customRecentWinners: Array.isArray(s.custom_recent_winners)
        ? (s.custom_recent_winners as RoundWinner[])
        : null,
      customLeaderboard: Array.isArray(s.custom_leaderboard)
        ? (s.custom_leaderboard as LeaderboardEntry[])
        : null,
    };
  }

  public async getBotConfigAndButtons(): Promise<{
    config: BotAppConfig;
    buttons: PaymentButtonRecord[];
  }> {
    if (!this.client) {
      return {
        config: { ...this.memConfig, extraGroupIds: [...this.memConfig.extraGroupIds] },
        buttons: this.memButtons.filter((b) => b.is_active),
      };
    }

    try {
      const [settingsRes, buttonsRes] = await Promise.all([
        this.client.from('app_settings').select('*').eq('id', 1).maybeSingle(),
        this.client
          .from('payment_buttons')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
      ]);

      if (settingsRes.data) {
        this.applySettingsRow(settingsRes.data);
      }

      const rawButtons = buttonsRes.data || [];
      const buttons: PaymentButtonRecord[] = [];
      for (const b of rawButtons) {
        const bankKey = b.bank_key as PresetBankKey;
        if (!bankKey || !PRESET_BANKS.some((p) => p.key === bankKey)) continue;
        buttons.push({
          id: String(b.id),
          flow_type: b.flow_type === 'withdraw' ? 'withdraw' : 'deposit',
          bank_key: bankKey,
          label: String(b.label),
          response_text: String(b.response_text || ''),
          sort_order: Number(b.sort_order) || 0,
          is_active: Boolean(b.is_active),
        });
      }

      if (buttons.length === 0) {
        return {
          config: { ...this.memConfig, extraGroupIds: [...this.memConfig.extraGroupIds] },
          buttons: this.memButtons.filter((b) => b.is_active),
        };
      }

      return { config: { ...this.memConfig, extraGroupIds: [...this.memConfig.extraGroupIds] }, buttons };
    } catch (err) {
      console.error('[Supabase] getBotConfigAndButtons error:', err);
      return {
        config: { ...this.memConfig, extraGroupIds: [...this.memConfig.extraGroupIds] },
        buttons: this.memButtons.filter((b) => b.is_active),
      };
    }
  }

  public async setAdminGroupId(groupId: string) {
    this.memConfig.adminGroupId = groupId;
    if (!this.client) return;
    try {
      await this.client
        .from('app_settings')
        .update({ admin_group_id: groupId, updated_at: new Date().toISOString() })
        .eq('id', 1);
    } catch (err) {
      console.error('[Supabase] setAdminGroupId error:', err);
    }
  }

  public async updateHouseSettings(commissionPercent: number, callIntervalSeconds: number) {
    this.memConfig.commissionPercent = commissionPercent;
    this.memConfig.callIntervalMs = Math.round(callIntervalSeconds * 1000);
    if (!this.client) return;
    try {
      await this.client
        .from('app_settings')
        .update({
          commission_percent: commissionPercent,
          call_interval_ms: Math.round(callIntervalSeconds * 1000),
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);
    } catch (err) {
      console.error('[Supabase] updateHouseSettings error:', err);
    }
  }

  public async updateCustomWinnersAndLeaderboard(
    recentWinners: RoundWinner[] | null,
    leaderboard: LeaderboardEntry[] | null
  ) {
    this.memConfig.customRecentWinners = recentWinners;
    this.memConfig.customLeaderboard = leaderboard;
    if (!this.client) return;
    try {
      await this.client
        .from('app_settings')
        .update({
          custom_recent_winners: recentWinners,
          custom_leaderboard: leaderboard,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);
    } catch (err) {
      console.error('[Supabase] updateCustomWinnersAndLeaderboard error:', err);
    }
  }

  public async upsertPlayer(
    playerId: string,
    name: string,
    wallet: PlayerWallet,
    language?: AppLanguage,
    username?: string
  ) {
    this.memKnownPlayerIds.add(playerId);
    if (!this.client) return;
    try {
      const payload: Record<string, unknown> = {
        id: playerId,
        name: name.slice(0, 64),
        deposited_birr: wallet.depositedBalance,
        won_birr: wallet.wonBalance,
        updated_at: new Date().toISOString(),
      };
      if (language) payload.language = language;
      if (username !== undefined) payload.username = username || null;
      await this.client.from('players').upsert(payload, { onConflict: 'id' });
    } catch (err) {
      console.error('[Supabase] upsertPlayer error:', err);
    }
  }

  public async getPlayerInfo(playerId: string): Promise<{ exists: boolean; name?: string; username?: string | null; language?: AppLanguage }> {
    if (this.client) {
      try {
        const { data } = await this.client
          .from('players')
          .select('id, name, username, language')
          .eq('id', playerId)
          .maybeSingle();
        if (data) {
          this.memKnownPlayerIds.add(playerId);
          return {
            exists: true,
            name: String(data.name || 'Player'),
            username: data.username ? String(data.username) : null,
            language: data.language === 'am' || data.language === 'om' ? data.language : 'en',
          };
        }
        return { exists: false };
      } catch {
        // fallback to memory
      }
    }
    return { exists: this.memKnownPlayerIds.has(playerId) };
  }

  public async setPlayerLanguage(playerId: string, language: AppLanguage) {
    if (!this.client) return;
    try {
      await this.client
        .from('players')
        .update({ language, updated_at: new Date().toISOString() })
        .eq('id', playerId);
    } catch (err) {
      console.error('[Supabase] setPlayerLanguage error:', err);
    }
  }

  public async fetchRecentlyUpdatedPlayers(sinceIso: string): Promise<StoredPlayerRow[]> {
    if (!this.client) return [];
    try {
      const { data, error } = await this.client
        .from('players')
        .select('id, name, username, language, deposited_birr, won_birr, updated_at')
        .gt('updated_at', sinceIso)
        .limit(100);
      if (error || !data) return [];
      return data.map((p) => ({
        id: String(p.id),
        name: String(p.name || 'Player'),
        username: p.username ? String(p.username) : null,
        language: p.language === 'am' || p.language === 'om' ? p.language : 'en',
        deposited_birr: Number(p.deposited_birr) || 0,
        won_birr: Number(p.won_birr) || 0,
        updated_at: String(p.updated_at),
      }));
    } catch {
      return [];
    }
  }

  public async recordRound(params: {
    stakeBirr: number;
    roundNumber: number;
    playersCount: number;
    entriesCount: number;
    totalPotBirr: number;
    commissionPercent: number;
    commissionBirr: number;
    prizePoolBirr: number;
    winners: RoundWinner[];
    calledNumbers: number[];
    startedAtMs: number;
    endedAtMs: number;
  }) {
    if (!this.client) return;
    try {
      await this.client.from('rounds').insert({
        stake_birr: params.stakeBirr,
        round_number: params.roundNumber,
        players_count: params.playersCount,
        entries_count: params.entriesCount,
        total_pot_birr: params.totalPotBirr,
        commission_percent: params.commissionPercent,
        commission_birr: params.commissionBirr,
        prize_pool_birr: params.prizePoolBirr,
        winners: params.winners,
        called_numbers: params.calledNumbers,
        started_at: new Date(params.startedAtMs).toISOString(),
        ended_at: new Date(params.endedAtMs).toISOString(),
      });
    } catch (err) {
      console.error('[Supabase] recordRound error:', err);
    }
  }

  public async getBotSession(tgUserId: string): Promise<BotSessionRecord> {
    const fallback = this.memSessions.get(tgUserId) || {
      telegram_user_id: tgUserId,
      language: 'en' as AppLanguage,
      pending_action: null,
      selected_button_id: null,
      selected_button_label: null,
      selected_bank_key: null,
    };
    if (!this.client) return fallback;
    try {
      const { data } = await this.client
        .from('bot_sessions')
        .select('*')
        .eq('telegram_user_id', tgUserId)
        .maybeSingle();
      if (!data) return fallback;
      const rec: BotSessionRecord = {
        telegram_user_id: tgUserId,
        language: data.language === 'am' || data.language === 'om' ? data.language : 'en',
        pending_action:
          data.pending_action === 'awaiting_deposit_proof' ||
          data.pending_action === 'awaiting_withdraw_info'
            ? data.pending_action
            : null,
        selected_button_id: data.selected_button_id ? String(data.selected_button_id) : null,
        selected_button_label: data.selected_button_label ? String(data.selected_button_label) : null,
        selected_bank_key: (data.selected_bank_key as PresetBankKey) || null,
      };
      this.memSessions.set(tgUserId, rec);
      return rec;
    } catch {
      return fallback;
    }
  }

  public async saveBotSession(session: BotSessionRecord) {
    this.memSessions.set(session.telegram_user_id, session);
    if (!this.client) return;
    try {
      await this.client.from('bot_sessions').upsert(
        {
          telegram_user_id: session.telegram_user_id,
          language: session.language,
          pending_action: session.pending_action,
          selected_button_id: this.isUuid(session.selected_button_id) ? session.selected_button_id : null,
          selected_button_label: session.selected_button_label,
          selected_bank_key: session.selected_bank_key,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'telegram_user_id' }
      );
    } catch (err) {
      console.error('[Supabase] saveBotSession error:', err);
    }
  }

  private isUuid(val: string | null): boolean {
    return Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));
  }

  public async createTransaction(input: {
    playerId: string;
    playerName: string;
    playerUsername: string | null;
    txType: 'deposit' | 'withdraw';
    bankKey: string | null;
    buttonId: string | null;
    buttonLabel: string | null;
    userMessage: string | null;
    userPhotoFileId: string | null;
    adminGroupId: string | null;
  }): Promise<TransactionRecord> {
    const fallback: TransactionRecord = {
      id: crypto.randomUUID(),
      player_id: input.playerId,
      player_name: input.playerName,
      player_username: input.playerUsername,
      tx_type: input.txType,
      bank_key: input.bankKey,
      button_id: input.buttonId,
      button_label: input.buttonLabel,
      user_message: input.userMessage,
      user_photo_file_id: input.userPhotoFileId,
      amount_birr: null,
      status: 'pending',
      resolved_by: null,
      admin_group_id: input.adminGroupId,
      admin_group_message_id: null,
      admin_group_messages: [],
      created_at: new Date().toISOString(),
      resolved_at: null,
    };
    this.memTransactions.set(fallback.id, fallback);

    if (!this.client) return fallback;
    try {
      const { data, error } = await this.client
        .from('transactions')
        .insert({
          player_id: input.playerId,
          player_name: input.playerName,
          player_username: input.playerUsername,
          tx_type: input.txType,
          bank_key: input.bankKey,
          button_id: this.isUuid(input.buttonId) ? input.buttonId : null,
          button_label: input.buttonLabel,
          user_message: input.userMessage,
          user_photo_file_id: input.userPhotoFileId,
          status: 'pending',
          admin_group_id: input.adminGroupId,
        })
        .select('*')
        .single();

      if (!error && data) {
        const rec = data as TransactionRecord;
        this.memTransactions.set(rec.id, rec);
        return rec;
      }
    } catch (err) {
      console.error('[Supabase] createTransaction error:', err);
    }
    return fallback;
  }

  public async getTransaction(id: string): Promise<TransactionRecord | null> {
    if (this.client) {
      try {
        const { data } = await this.client.from('transactions').select('*').eq('id', id).maybeSingle();
        if (data) return data as TransactionRecord;
      } catch {
        // fallback to memory
      }
    }
    return this.memTransactions.get(id) || null;
  }

  public async updateTransaction(
    id: string,
    patch: Partial<{
      status: TransactionRecord['status'];
      amount_birr: number | null;
      resolved_by: string | null;
      admin_group_message_id: number | null;
      admin_group_messages: AdminGroupMessageRef[];
      resolved_at: string | null;
    }>
  ) {
    const existing = this.memTransactions.get(id);
    if (existing) {
      this.memTransactions.set(id, { ...existing, ...patch });
    }
    if (!this.client) return;
    try {
      await this.client.from('transactions').update(patch).eq('id', id);
    } catch (err) {
      console.error('[Supabase] updateTransaction error:', err);
    }
  }

  // --- Referrals ---

  public async getReferralByReferredId(referredId: string): Promise<ReferralRecord | null> {
    const mem = this.memReferralsByReferred.get(referredId);
    if (!this.client) return mem || null;
    try {
      const { data } = await this.client
        .from('referrals')
        .select('*')
        .eq('referred_id', referredId)
        .maybeSingle();
      if (data) {
        const rec = data as ReferralRecord;
        this.memReferralsByReferred.set(referredId, rec);
        return rec;
      }
      return null;
    } catch {
      return mem || null;
    }
  }

  public async createReferral(input: {
    referrerId: string;
    referrerName: string;
    referrerUsername: string | null;
    referredId: string;
    referredName: string;
    referredUsername: string | null;
    signupBonusBirr: number;
  }): Promise<ReferralRecord | null> {
    if (this.memReferralsByReferred.has(input.referredId)) return null;

    const fallback: ReferralRecord = {
      id: crypto.randomUUID(),
      referrer_id: input.referrerId,
      referrer_name: input.referrerName,
      referrer_username: input.referrerUsername,
      referred_id: input.referredId,
      referred_name: input.referredName,
      referred_username: input.referredUsername,
      signup_bonus_birr: input.signupBonusBirr,
      deposit_50_bonus_birr: 0,
      deposit_50_bonus_paid: false,
      first_50_deposit_birr: null,
      deposit_50_bonus_paid_at: null,
      deposit_bonus_birr: 0,
      deposit_bonus_paid: false,
      first_qualifying_deposit_birr: null,
      created_at: new Date().toISOString(),
      deposit_bonus_paid_at: null,
    };

    if (!this.client) {
      this.memReferralsByReferred.set(input.referredId, fallback);
      return fallback;
    }

    try {
      const { data, error } = await this.client
        .from('referrals')
        .insert({
          referrer_id: input.referrerId,
          referrer_name: input.referrerName,
          referrer_username: input.referrerUsername,
          referred_id: input.referredId,
          referred_name: input.referredName,
          referred_username: input.referredUsername,
          signup_bonus_birr: input.signupBonusBirr,
          deposit_50_bonus_birr: 0,
          deposit_50_bonus_paid: false,
          deposit_bonus_birr: 0,
          deposit_bonus_paid: false,
        })
        .select('*')
        .single();

      if (error || !data) {
        return null;
      }
      const rec = data as ReferralRecord;
      this.memReferralsByReferred.set(input.referredId, rec);
      return rec;
    } catch {
      return null;
    }
  }

  public async markReferralDeposit50BonusPaid(
    referredId: string,
    deposit50BonusBirr: number,
    qualifyingDepositBirr: number
  ): Promise<ReferralRecord | null> {
    const existing = await this.getReferralByReferredId(referredId);
    if (!existing || existing.deposit_50_bonus_paid || existing.deposit_bonus_paid) return null;

    const now = new Date().toISOString();
    const updated: ReferralRecord = {
      ...existing,
      deposit_50_bonus_birr: deposit50BonusBirr,
      deposit_50_bonus_paid: true,
      first_50_deposit_birr: qualifyingDepositBirr,
      deposit_50_bonus_paid_at: now,
    };
    this.memReferralsByReferred.set(referredId, updated);

    if (!this.client) return updated;
    try {
      const { data, error } = await this.client
        .from('referrals')
        .update({
          deposit_50_bonus_birr: deposit50BonusBirr,
          deposit_50_bonus_paid: true,
          first_50_deposit_birr: qualifyingDepositBirr,
          deposit_50_bonus_paid_at: now,
        })
        .eq('referred_id', referredId)
        .eq('deposit_50_bonus_paid', false)
        .eq('deposit_bonus_paid', false)
        .select('*')
        .maybeSingle();

      if (error || !data) return null;
      const rec = data as ReferralRecord;
      this.memReferralsByReferred.set(referredId, rec);
      return rec;
    } catch (err) {
      console.error('[Supabase] markReferralDeposit50BonusPaid error:', err);
      return null;
    }
  }

  public async markReferralDepositBonusPaid(
    referredId: string,
    depositBonusBirr: number,
    qualifyingDepositBirr: number
  ): Promise<ReferralRecord | null> {
    const existing = await this.getReferralByReferredId(referredId);
    if (!existing || existing.deposit_bonus_paid) return null;

    const now = new Date().toISOString();
    const updated: ReferralRecord = {
      ...existing,
      deposit_bonus_birr: depositBonusBirr,
      deposit_bonus_paid: true,
      first_qualifying_deposit_birr: qualifyingDepositBirr,
      deposit_bonus_paid_at: now,
    };
    this.memReferralsByReferred.set(referredId, updated);

    if (!this.client) return updated;
    try {
      const { data, error } = await this.client
        .from('referrals')
        .update({
          deposit_bonus_birr: depositBonusBirr,
          deposit_bonus_paid: true,
          first_qualifying_deposit_birr: qualifyingDepositBirr,
          deposit_bonus_paid_at: now,
        })
        .eq('referred_id', referredId)
        .eq('deposit_bonus_paid', false)
        .select('*')
        .maybeSingle();

      if (error || !data) return null;
      const rec = data as ReferralRecord;
      this.memReferralsByReferred.set(referredId, rec);
      return rec;
    } catch (err) {
      console.error('[Supabase] markReferralDepositBonusPaid error:', err);
      return null;
    }
  }

  public async getReferralStatsForUser(referrerId: string): Promise<{ invitedCount: number; earnedBirr: number }> {
    if (!this.client) {
      let invitedCount = 0;
      let earnedBirr = 0;
      for (const r of this.memReferralsByReferred.values()) {
        if (r.referrer_id === referrerId) {
          invitedCount += 1;
          earnedBirr +=
            Number(r.signup_bonus_birr || 0) +
            Number(r.deposit_50_bonus_birr || 0) +
            Number(r.deposit_bonus_birr || 0);
        }
      }
      return { invitedCount, earnedBirr };
    }

    try {
      const { data } = await this.client
        .from('referrals')
        .select('signup_bonus_birr, deposit_50_bonus_birr, deposit_bonus_birr')
        .eq('referrer_id', referrerId);
      const rows = data || [];
      let earnedBirr = 0;
      for (const r of rows) {
        earnedBirr +=
          Number(r.signup_bonus_birr || 0) +
          Number(r.deposit_50_bonus_birr || 0) +
          Number(r.deposit_bonus_birr || 0);
      }
      return { invitedCount: rows.length, earnedBirr };
    } catch {
      return { invitedCount: 0, earnedBirr: 0 };
    }
  }

  // --- Broadcast Queue & Recipients ---

  public async fetchPendingBroadcasts(): Promise<BotBroadcastRecord[]> {
    if (!this.client) return [];
    try {
      const { data, error } = await this.client
        .from('bot_broadcasts')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(5);
      if (error || !data) return [];
      return data as BotBroadcastRecord[];
    } catch {
      return [];
    }
  }

  public async updateBroadcast(
    id: string,
    patch: Partial<{
      status: BotBroadcastRecord['status'];
      total_count: number;
      sent_count: number;
      failed_count: number;
      error_message: string | null;
      completed_at: string | null;
    }>
  ) {
    if (!this.client) return;
    try {
      await this.client.from('bot_broadcasts').update(patch).eq('id', id);
    } catch (err) {
      console.error('[Supabase] updateBroadcast error:', err);
    }
  }

  public async listAllTelegramUserIds(inMemoryPlayerIds: string[]): Promise<string[]> {
    const ids = new Set<string>();
    const addRaw = (raw: string | null | undefined) => {
      if (!raw) return;
      const cleaned = raw.replace(/^tg_/, '').trim();
      if (/^\d+$/.test(cleaned)) {
        ids.add(cleaned);
      }
    };

    for (const id of inMemoryPlayerIds) addRaw(id);
    for (const sessId of this.memSessions.keys()) addRaw(sessId);

    if (this.client) {
      try {
        const [playersRes, sessionsRes] = await Promise.all([
          this.client.from('players').select('id').like('id', 'tg_%').limit(10000),
          this.client.from('bot_sessions').select('telegram_user_id').limit(10000),
        ]);
        for (const p of playersRes.data || []) addRaw(String(p.id));
        for (const s of sessionsRes.data || []) addRaw(String(s.telegram_user_id));
      } catch (err) {
        console.error('[Supabase] listAllTelegramUserIds error:', err);
      }
    }

    return Array.from(ids);
  }
}

export const supabaseStore = new SupabaseStore();

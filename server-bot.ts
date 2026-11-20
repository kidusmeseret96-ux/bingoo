import { PRESET_BANKS, type AppLanguage, type PlayerWallet, type PresetBankKey } from './shared/bingo.ts';
import { type AdminGroupMessageRef, PaymentButtonRecord, supabaseStore } from './server-db.ts';

export interface BotHubBridge {
  getWalletSnapshot: (playerId: string, name?: string, username?: string) => PlayerWallet;
  hasPlayer: (playerId: string) => boolean;
  getPlayerName: (playerId: string) => string | undefined;
  getAllPlayerIds: () => string[];
  creditDepositFromBot: (playerId: string, name: string, amountBirr: number) => Promise<PlayerWallet>;
  deductWithdrawFromBot: (playerId: string, name: string, amountBirr: number) => Promise<PlayerWallet>;
  setPlayerLanguage: (playerId: string, language: AppLanguage) => void;
  getPlayerLanguage: (playerId: string) => AppLanguage | undefined;
  isTelegramAdminId: (tgIdWithPrefix: string) => boolean;
}

interface PendingAdminAmountInput {
  mode: 'deposit_accept' | 'withdraw_done';
  txId: string;
  groupChatId: string;
  promptChatId: string;
  adminUserId: string;
  adminName: string;
  promptMessageId: number | null;
  originalGroupMsgId: number | null;
  hasPhoto: boolean;
  originalTextOrCaption: string;
}

const BOT_STRINGS: Record<
  AppLanguage,
  {
    welcomeGreeting: (name: string) => string;
    balanceLine: (dep: number, won: number) => string;
    menuPrompt: string;
    btnPlay: string;
    btnDeposit: string;
    btnWithdraw: string;
    btnReferral: string;
    btnShareReferral: string;
    btnLanguage: string;
    btnBack: string;
    btnCancel: string;
    chooseLang: string;
    cancelled: string;
    noButtonsConfigured: string;
    depositFallbackReply: (bankName: string) => string;
    depositReceived: string;
    withdrawReceived: string;
    depositAcceptedUser: (amt: number, bankName: string) => string;
    depositRejectedUser: string;
    withdrawDoneUser: string;
    withdrawIncorrectUser: string;
    adminGroupNotConfigured: string;
    referralScreen: (
      link: string,
      signupBonus: number,
      deposit50Bonus: number,
      depositBonus: number,
      invitedCount: number,
      earnedBirr: number
    ) => string;
    referralShareText: (signupBonus: number, deposit50Bonus: number, depositBonus: number) => string;
    referralJoinedNotify: (
      referredName: string,
      signupBonus: number,
      deposit50Bonus: number,
      depositBonus: number
    ) => string;
    referralDepositNotify: (
      referredName: string,
      depositAmt: number,
      depositBonus: number,
      thresholdBirr: number
    ) => string;
  }
> = {
  en: {
    welcomeGreeting: (name) => `👋 Welcome, <b>${name}</b>!`,
    balanceLine: (dep, won) => `Deposited: ${dep} Birr · Won: ${won} Birr`,
    menuPrompt: 'Choose an option below or open the game directly:',
    btnPlay: 'Play Zemen Bingo',
    btnDeposit: 'Deposit',
    btnWithdraw: 'Withdraw',
    btnReferral: 'Referral',
    btnShareReferral: 'Share Referral Link',
    btnLanguage: 'Language',
    btnBack: 'Back',
    btnCancel: 'Cancel',
    chooseLang: 'Choose your language (updates both bot and game):',
    cancelled: 'Cancelled. Back to main menu.',
    noButtonsConfigured: 'No banks are currently enabled. Please contact the admin.',
    depositFallbackReply: (bankName) =>
      `Selected ${bankName}. Send your deposit receipt photo or confirmation message here.`,
    depositReceived: 'Your deposit proof has been sent to the admin team. You will be notified once reviewed.',
    withdrawReceived: 'Your withdrawal request has been sent to the admin team.',
    depositAcceptedUser: (amt, bankName) =>
      `${amt} Birr (${bankName}) has been deposited to your account!`,
    depositRejectedUser: 'Your deposit request was rejected. Please check your details and try again.',
    withdrawDoneUser: 'Money has been sent to your account!',
    withdrawIncorrectUser: 'Your withdrawal info was incorrect. Please tap Withdraw and send valid details.',
    adminGroupNotConfigured: 'Admin group is not linked yet. An admin should run /setgroup inside the admin group.',
    referralScreen: (link, signupBonus, deposit50Bonus, depositBonus, invitedCount, earnedBirr) =>
      `🎁 <b>Invite Friends &amp; Earn Referral Bonuses!</b>\n\n` +
      `• Get a <b>${signupBonus} Birr</b> bonus when someone joins using your referral link.\n` +
      `• Get a <b>${deposit50Bonus} Birr</b> bonus when the person you referred makes their first deposit of <b>50+ Birr</b>!\n` +
      `• Get a <b>${depositBonus} Birr</b> bonus when the person you referred makes their first deposit of <b>100+ Birr</b>!\n\n` +
      `🔗 <b>Your Personal Referral Link:</b>\n<code>${escapeHtml(link)}</code>\n\n` +
      `📊 Invited: <b>${invitedCount}</b> · Total Bonus Earned: <b>${earnedBirr} Birr</b>`,
    referralShareText: (signupBonus, deposit50Bonus, depositBonus) =>
      `Join Zemen Bingo with my link! Invite friends to earn ${signupBonus} Birr on join + ${deposit50Bonus} Birr on first 50+ Birr deposit + ${depositBonus} Birr on first 100+ Birr deposit.`,
    referralJoinedNotify: (referredName, signupBonus, deposit50Bonus, depositBonus) =>
      `🎉 <b>${escapeHtml(referredName)}</b> joined using your referral link!\n` +
      `✅ You earned <b>+${signupBonus} Birr</b> bonus.\n` +
      `💡 You will also get <b>+${deposit50Bonus} Birr</b> on their first 50+ Birr deposit and <b>+${depositBonus} Birr</b> on their first 100+ Birr deposit!`,
    referralDepositNotify: (referredName, depositAmt, depositBonus, thresholdBirr) =>
      `💰 Your referred player <b>${escapeHtml(referredName)}</b> made their first <b>${depositAmt} Birr</b> (${thresholdBirr}+ Birr) deposit!\n` +
      `🎁 You received <b>+${depositBonus} Birr</b> referral bonus!`,
  },
  am: {
    welcomeGreeting: (name) => `👋 እንኳን ደህና መጡ፣ <b>${name}</b>!`,
    balanceLine: (dep, won) => `ተቀማጭ: ${dep} ብር · አሸናፊ: ${won} ብር`,
    menuPrompt: 'ከታች ካሉት አማራጮች አንዱን ይምረጡ ወይም ጨዋታውን ይክፈቱ:',
    btnPlay: 'ዘመን ቢንጎ ይጫወቱ',
    btnDeposit: 'ገንዘብ አስገባ (Deposit)',
    btnWithdraw: 'ገንዘብ አውጣ (Withdraw)',
    btnReferral: 'ጓደኛ ይጋብዙ (Referral)',
    btnShareReferral: 'ሊንኩን ያጋሩ',
    btnLanguage: 'ቋንቋ (Language)',
    btnBack: 'ተመለስ',
    btnCancel: 'ሰርዝ',
    chooseLang: 'ቋንቋ ይምረጡ (ቦቱን እና ጨዋታውን ይቀይራል):',
    cancelled: 'ተሰርዟል። ወደ ዋናው ማውጫ ተመልሰዋል።',
    noButtonsConfigured: 'ምንም የባንክ አማራጭ አልተከፈተም። እባክዎ አስተዳዳሪውን ያግኙ።',
    depositFallbackReply: (bankName) =>
      `${bankName} ተመርጧል። የክፍያ ደረሰኝ ፎቶ ወይም መልእክት እዚህ ይላኩ።`,
    depositReceived: 'የገንዘብ ማስገቢያ መረጃዎ ለአስተዳዳሪዎች ተልኳል። ሲረጋገጥ መልእክት ይደርስዎታል።',
    withdrawReceived: 'የገንዘብ ማውጫ ጥያቄዎ ለአስተዳዳሪዎች ተልኳል።',
    depositAcceptedUser: (amt, bankName) =>
      `${amt} ብር (${bankName}) ወደ አካውንትዎ ገብቷል!`,
    depositRejectedUser: 'የገንዘብ ማስገቢያ ጥያቄዎ ውድቅ ተደርጓል። እባክዎ ትክክለኛ መረጃ ይላኩ።',
    withdrawDoneUser: 'ገንዘቡ ወደ አካውንትዎ ተልኳል!',
    withdrawIncorrectUser: 'የላኩት የገንዘብ ማውጫ መረጃ ትክክል አይደለም። እባክዎ ትክክለኛ መረጃ ይላኩ።',
    adminGroupNotConfigured: 'የአስተዳዳሪ ግሩፕ አልተገናኘም። አስተዳዳሪው በግሩፑ ውስጥ /setgroup ይጻፍ።',
    referralScreen: (link, signupBonus, deposit50Bonus, depositBonus, invitedCount, earnedBirr) =>
      `🎁 <b>ጓደኞችን ይጋብዙ እና ቦነስ ያግኙ!</b>\n\n` +
      `• በሊንክዎ አንድ ሰው ሲቀላቀል ወዲያውኑ የ<b>${signupBonus} ብር</b> ቦነስ ያገኛሉ።\n` +
      `• የጋበዙት ሰው ለመጀመሪያ ጊዜ <b>50 ብር እና ከዚያ በላይ</b> ገንዘብ ሲያስገባ (Deposit) የ<b>${deposit50Bonus} ብር</b> ቦነስ ያገኛሉ!\n` +
      `• የጋበዙት ሰው ለመጀመሪያ ጊዜ <b>100 ብር እና ከዚያ በላይ</b> ገንዘብ ሲያስገባ (Deposit) የ<b>${depositBonus} ብር</b> ቦነስ ያገኛሉ!\n\n` +
      `🔗 <b>የእርስዎ የግብዣ ሊንክ:</b>\n<code>${escapeHtml(link)}</code>\n\n` +
      `📊 የጋበዙት: <b>${invitedCount}</b> · ጠቅላላ ያገኙት ቦነስ: <b>${earnedBirr} ብር</b>`,
    referralShareText: (signupBonus, deposit50Bonus, depositBonus) =>
      `በሊንኬ ዘመን ቢንጎን ይቀላቀሉ! ጓደኞችን ሲጋብዙ ${signupBonus} ብር + መጀመሪያ 50+ ብር ሲያስገቡ ${deposit50Bonus} ብር + መጀመሪያ 100+ ብር ሲያስገቡ ${depositBonus} ብር ያግኙ።`,
    referralJoinedNotify: (referredName, signupBonus, deposit50Bonus, depositBonus) =>
      `🎉 <b>${escapeHtml(referredName)}</b> በግብዣ ሊንክዎ ተቀላቅሏል!\n` +
      `✅ <b>+${signupBonus} ብር</b> ቦነስ ወደ ሂሳብዎ ገብቷል።\n` +
      `💡 ለመጀመሪያ ጊዜ 50+ ብር ሲያስገቡ <b>+${deposit50Bonus} ብር</b> እና 100+ ብር ሲያስገቡ <b>+${depositBonus} ብር</b> ያገኛሉ!`,
    referralDepositNotify: (referredName, depositAmt, depositBonus, thresholdBirr) =>
      `💰 የጋበዙት <b>${escapeHtml(referredName)}</b> ለመጀመሪያ ጊዜ <b>${depositAmt} ብር</b> (${thresholdBirr}+ ብር) አስገብተዋል!\n` +
      `🎁 የ<b>+${depositBonus} ብር</b> የግብዣ ቦነስ አግኝተዋል!`,
  },
  om: {
    welcomeGreeting: (name) => `👋 Baga nagaan dhuftan, <b>${name}</b>!`,
    balanceLine: (dep, won) => `Kuufama: ${dep} Birrii · Moo'ame: ${won} Birrii`,
    menuPrompt: 'Filannoo armaan gadii keessaa tokko filadhu ykn tapha bani:',
    btnPlay: 'Zemen Bingo Taphadhu',
    btnDeposit: 'Maallaqa Galchi (Deposit)',
    btnWithdraw: 'Maallaqa Baasi (Withdraw)',
    btnReferral: 'Hiriyaa Afeeri (Referral)',
    btnShareReferral: 'Liinkii Qoodi',
    btnLanguage: 'Afaan (Language)',
    btnBack: 'Deebi’i',
    btnCancel: 'Haqi',
    chooseLang: 'Afaan kee filadhu (bootii fi tapha ni jijjiira):',
    cancelled: 'Haqameera. Gara menu jalqabaatti deebiteetta.',
    noButtonsConfigured: 'Baankiin baname hin jiru. Maaloo bulchaa qunnamaa.',
    depositFallbackReply: (bankName) =>
      `${bankName} filatameera. Suuraa nagahee ykn ergaa mirkaneessaa asitti ergi.`,
    depositReceived: 'Ragaan galchii keessanii gara bulchitootaatti ergameera. Yeroo mirkanaa’u isin beeksisna.',
    withdrawReceived: 'Gaaffiin baasii keessanii gara bulchitootaatti ergameera.',
    depositAcceptedUser: (amt, bankName) =>
      `Birrii ${amt} (${bankName}) gara herrega keessaniitti galeera!`,
    depositRejectedUser: 'Gaaffiin galchii keessanii fudhatama hin arganne. Maaloo irra deebi’aa yaalaa.',
    withdrawDoneUser: 'Maallaqni gara herrega keessaniitti ergameera!',
    withdrawIncorrectUser: 'Odeeffannoon baasii ergitan sirrii miti. Maaloo odeeffannoo sirrii ergaa.',
    adminGroupNotConfigured: 'Gareen bulchaa hin hidhamne. Bulchaan garee keessatti /setgroup haa barreessu.',
    referralScreen: (link, signupBonus, deposit50Bonus, depositBonus, invitedCount, earnedBirr) =>
      `🎁 <b>Hiriyoota Afeeraa Badhaasa Argadhaa!</b>\n\n` +
      `• Namni tokko liinkii keessaniin yoo makamu battalumatti badhaasa <b>Birrii ${signupBonus}</b> ni argattu.\n` +
      `• Namni isin afeertan yeroo jalqabaaf maallaqa <b>Birrii 50 fi isaa ol</b> yoo galchu (Deposit) badhaasa <b>Birrii ${deposit50Bonus}</b> ni argattu!\n` +
      `• Namni isin afeertan yeroo jalqabaaf maallaqa <b>Birrii 100 fi isaa ol</b> yoo galchu (Deposit) badhaasa <b>Birrii ${depositBonus}</b> ni argattu!\n\n` +
      `🔗 <b>Liinkii Afeerraa Keessanii:</b>\n<code>${escapeHtml(link)}</code>\n\n` +
      `📊 Kan Afeertan: <b>${invitedCount}</b> · Badhaasa Waliigalaa: <b>Birrii ${earnedBirr}</b>`,
    referralShareText: (signupBonus, deposit50Bonus, depositBonus) =>
      `Liinkii kootiin Zemen Bingo makamaa! Namoota afeeruun Birrii ${signupBonus} + yoo yeroo jalqabaaf Birrii 50+ galchan Birrii ${deposit50Bonus} + yoo yeroo jalqabaaf Birrii 100+ galchan Birrii ${depositBonus} argadhaa.`,
    referralJoinedNotify: (referredName, signupBonus, deposit50Bonus, depositBonus) =>
      `🎉 <b>${escapeHtml(referredName)}</b> liinkii afeerraa keessaniin makameera!\n` +
      `✅ Badhaasni <b>+${signupBonus} Birrii</b> herrega keessaniitti dabalamera.\n` +
      `💡 Yeroo jalqabaaf Birrii 50+ yoo galchan <b>+${deposit50Bonus} Birrii</b> akkasumas Birrii 100+ yoo galchan <b>+${depositBonus} Birrii</b> ni argattu!`,
    referralDepositNotify: (referredName, depositAmt, depositBonus, thresholdBirr) =>
      `💰 Namni isin afeertan <b>${escapeHtml(referredName)}</b> yeroo jalqabaaf <b>Birrii ${depositAmt}</b> (${thresholdBirr}+ Birrii) galcheera!\n` +
      `🎁 Badhaasa afeerraa <b>+${depositBonus} Birrii</b> argattaniittu!`,
  },
};

function getLocalizedBankName(bankKey: PresetBankKey, lang: AppLanguage, fallback?: string): string {
  const found = PRESET_BANKS.find((b) => b.key === bankKey);
  if (found) return found.names[lang] || found.names.en;
  return fallback || bankKey;
}

function getCanonicalBankName(bankKey: PresetBankKey | string | null, fallback?: string | null): string {
  const found = PRESET_BANKS.find((b) => b.key === bankKey);
  return found ? found.names.en : fallback || 'Bank';
}

function escapeHtml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function chunkButtons<T>(items: T[], perRow = 2): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += perRow) {
    rows.push(items.slice(i, i + perRow));
  }
  return rows;
}

export class TelegramBotHandler {
  private pendingAdminAmounts = new Map<string, PendingAdminAmountInput>();
  private cachedBotUsername: string | null = null;
  private isProcessingBroadcasts = false;

  constructor(
    private readonly botToken: string,
    private readonly hub: BotHubBridge,
    private readonly resolveMiniAppUrl: (fallbackUrl: string) => string
  ) {}

  public async callApi(method: string, body: Record<string, unknown>) {
    if (!this.botToken) return null;
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.botToken}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok: boolean; description?: string; result?: any };
      if (!data.ok) {
        console.error(`[Telegram API Error] ${method}:`, data.description || data);
      }
      return data;
    } catch (err) {
      console.error(`[Telegram API Network Error] ${method}:`, err);
      return null;
    }
  }

  private async getBotUsername(): Promise<string> {
    if (this.cachedBotUsername) return this.cachedBotUsername;
    const me = await this.callApi('getMe', {});
    const username = me?.result?.username ? String(me.result.username) : '';
    if (username) {
      this.cachedBotUsername = username;
    }
    return username;
  }

  private async isTelegramGroupAdmin(chatId: string | number, userId: number, chatType: string): Promise<boolean> {
    if (this.hub.isTelegramAdminId(`tg_${userId}`)) return true;
    const member = await this.callApi('getChatMember', { chat_id: chatId, user_id: userId });
    const status = member?.result?.status;
    if (status === 'creator' || status === 'administrator') return true;
    if (chatType === 'channel') {
      const { config } = await supabaseStore.getBotConfigAndButtons();
      const targets = supabaseStore.getAllTargetGroupIds(config);
      if (targets.includes(String(chatId))) return true;
    }
    return false;
  }

  private buildMiniAppUrlWithLang(baseMiniAppUrl: string, lang: AppLanguage): string {
    const sep = baseMiniAppUrl.includes('?') ? '&' : '?';
    return `${baseMiniAppUrl}${sep}lang=${lang}`;
  }

  private async sendHomeMenu(
    chatId: number | string,
    tgUserId: string,
    displayName: string,
    username: string | undefined,
    lang: AppLanguage,
    miniAppBaseUrl: string,
    editMessageId?: number
  ) {
    const t = BOT_STRINGS[lang];
    const wallet = this.hub.getWalletSnapshot(`tg_${tgUserId}`, displayName, username);
    const playUrl = this.buildMiniAppUrlWithLang(miniAppBaseUrl, lang);
    const text =
      `${t.welcomeGreeting(escapeHtml(displayName))}\n` +
      `🎱 <b>Zemen Bingo</b>\n` +
      `${escapeHtml(t.balanceLine(wallet.depositedBalance, wallet.wonBalance))}\n\n` +
      `${escapeHtml(t.menuPrompt)}`;

    const reply_markup = {
      inline_keyboard: [
        [{ text: `🎮 ${t.btnPlay}`, web_app: { url: playUrl } }],
        [
          { text: `💰 ${t.btnDeposit}`, callback_data: 'menu:deposit' },
          { text: `💸 ${t.btnWithdraw}`, callback_data: 'menu:withdraw' },
        ],
        [
          { text: `🎁 ${t.btnReferral}`, callback_data: 'menu:referral' },
          { text: `🌐 ${t.btnLanguage}`, callback_data: 'menu:language' },
        ],
      ],
    };

    if (editMessageId) {
      await this.callApi('editMessageText', {
        chat_id: chatId,
        message_id: editMessageId,
        text,
        parse_mode: 'HTML',
        reply_markup,
      });
    } else {
      await this.callApi('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup,
      });
    }
  }

  private async sendReferralMenu(
    chatId: number | string,
    tgUserId: string,
    lang: AppLanguage,
    miniAppBaseUrl: string,
    editMessageId?: number
  ) {
    const t = BOT_STRINGS[lang];
    const [{ config }, botUsername, stats] = await Promise.all([
      supabaseStore.getBotConfigAndButtons(),
      this.getBotUsername(),
      supabaseStore.getReferralStatsForUser(`tg_${tgUserId}`),
    ]);

    const refLink = botUsername
      ? `https://t.me/${botUsername}?start=ref_${tgUserId}`
      : `${miniAppBaseUrl}?ref=${tgUserId}`;
    const signupBonus = config.referralSignupBonus;
    const deposit50Bonus = config.referralDeposit50Bonus;
    const depositBonus = config.referralDepositBonus;

    const text = t.referralScreen(refLink, signupBonus, deposit50Bonus, depositBonus, stats.invitedCount, stats.earnedBirr);
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(
      t.referralShareText(signupBonus, deposit50Bonus, depositBonus)
    )}`;

    const reply_markup = {
      inline_keyboard: [
        [{ text: `📤 ${t.btnShareReferral}`, url: shareUrl }],
        [{ text: `⬅️ ${t.btnBack}`, callback_data: 'menu:home' }],
      ],
    };

    if (editMessageId) {
      await this.callApi('editMessageText', {
        chat_id: chatId,
        message_id: editMessageId,
        text,
        parse_mode: 'HTML',
        reply_markup,
      });
    } else {
      await this.callApi('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup,
      });
    }
  }

  private async sendDepositMenu(chatId: number | string, lang: AppLanguage, editMessageId?: number) {
    const t = BOT_STRINGS[lang];
    const { config, buttons } = await supabaseStore.getBotConfigAndButtons();
    const depButtons = buttons.filter((b) => b.flow_type === 'deposit');

    if (depButtons.length === 0) {
      const payload = {
        chat_id: chatId,
        text: escapeHtml(t.noButtonsConfigured),
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: `⬅️ ${t.btnBack}`, callback_data: 'menu:home' }]] },
      };
      if (editMessageId) {
        await this.callApi('editMessageText', { ...payload, message_id: editMessageId });
      } else {
        await this.callApi('sendMessage', payload);
      }
      return;
    }

    const rows = chunkButtons(
      depButtons.map((b) => ({
        text: getLocalizedBankName(b.bank_key, lang, b.label),
        callback_data: `dep:${b.bank_key}`,
      })),
      2
    );
    rows.push([{ text: `⬅️ ${t.btnBack}`, callback_data: 'menu:home' }]);

    const text = `💰 <b>${escapeHtml(t.btnDeposit)}</b>\n\n${escapeHtml(config.depositIntroText)}`;
    if (editMessageId) {
      await this.callApi('editMessageText', {
        chat_id: chatId,
        message_id: editMessageId,
        text,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: rows },
      });
    } else {
      await this.callApi('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: rows },
      });
    }
  }

  private async sendWithdrawMenu(chatId: number | string, lang: AppLanguage, editMessageId?: number) {
    const t = BOT_STRINGS[lang];
    const { config, buttons } = await supabaseStore.getBotConfigAndButtons();
    const wdButtons = buttons.filter((b) => b.flow_type === 'withdraw');

    if (wdButtons.length === 0) {
      const payload = {
        chat_id: chatId,
        text: escapeHtml(t.noButtonsConfigured),
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: `⬅️ ${t.btnBack}`, callback_data: 'menu:home' }]] },
      };
      if (editMessageId) {
        await this.callApi('editMessageText', { ...payload, message_id: editMessageId });
      } else {
        await this.callApi('sendMessage', payload);
      }
      return;
    }

    const rows = chunkButtons(
      wdButtons.map((b) => ({
        text: getLocalizedBankName(b.bank_key, lang, b.label),
        callback_data: `wd:${b.bank_key}`,
      })),
      2
    );
    rows.push([{ text: `⬅️ ${t.btnBack}`, callback_data: 'menu:home' }]);

    const text = `💸 <b>${escapeHtml(t.btnWithdraw)}</b>\n\n${escapeHtml(config.withdrawIntroText)}`;
    if (editMessageId) {
      await this.callApi('editMessageText', {
        chat_id: chatId,
        message_id: editMessageId,
        text,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: rows },
      });
    } else {
      await this.callApi('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: rows },
      });
    }
  }

  private async sendLanguageMenu(chatId: number | string, lang: AppLanguage, editMessageId?: number) {
    const t = BOT_STRINGS[lang];
    const rows = [
      [{ text: '🇪🇹 አማርኛ (Amharic)', callback_data: 'lang:am' }],
      [{ text: '🇬🇧 English', callback_data: 'lang:en' }],
      [{ text: '🇪🇹 Afaan Oromoo', callback_data: 'lang:om' }],
      [{ text: `⬅️ ${t.btnBack}`, callback_data: 'menu:home' }],
    ];
    const payload = {
      chat_id: chatId,
      text: `🌐 ${escapeHtml(t.chooseLang)}`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: rows },
    };
    if (editMessageId) {
      await this.callApi('editMessageText', { ...payload, message_id: editMessageId });
    } else {
      await this.callApi('sendMessage', payload);
    }
  }

  private getPendingAdminKey(promptChatId: string, adminUserId: string): string {
    return `${promptChatId}::${adminUserId}`;
  }

  private async editAllGroupMessagesResolved(
    tx: {
      admin_group_messages?: AdminGroupMessageRef[];
      admin_group_id: string | null;
      admin_group_message_id: number | null;
    },
    fallbackChatId: string,
    fallbackMsgId: number | null,
    hasPhoto: boolean,
    originalTextOrCaption: string,
    suffix: string
  ) {
    const targets: AdminGroupMessageRef[] = [];
    const seen = new Set<string>();
    const addTarget = (cId: string | null | undefined, mId: number | null | undefined) => {
      if (!cId || !mId) return;
      const key = `${cId}::${mId}`;
      if (!seen.has(key)) {
        seen.add(key);
        targets.push({ chat_id: String(cId), message_id: Number(mId) });
      }
    };

    for (const ref of tx.admin_group_messages || []) {
      addTarget(ref.chat_id, ref.message_id);
    }
    addTarget(tx.admin_group_id, tx.admin_group_message_id);
    addTarget(fallbackChatId, fallbackMsgId);

    for (const ref of targets) {
      if (hasPhoto) {
        await this.callApi('editMessageCaption', {
          chat_id: ref.chat_id,
          message_id: ref.message_id,
          caption: `${originalTextOrCaption}${suffix}`,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [] },
        });
      } else {
        await this.callApi('editMessageText', {
          chat_id: ref.chat_id,
          message_id: ref.message_id,
          text: `${originalTextOrCaption}${suffix}`,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [] },
        });
      }
    }
  }

  private async processPendingAdminAmountReply(
    chatId: string,
    messageId: number,
    pending: PendingAdminAmountInput,
    text: string
  ) {
    const cleaned = text.replace(/[, ]+/g, '').replace(/birr|br|etb/gi, '');
    const amount = Number(cleaned);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
      await this.callApi('sendMessage', {
        chat_id: chatId,
        reply_to_message_id: messageId,
        text: 'Please type a valid positive Birr number (for example: 100).',
      });
      return;
    }

    const roundedAmt = Math.round(amount * 100) / 100;
    const tx = await supabaseStore.getTransaction(pending.txId);
    this.pendingAdminAmounts.delete(this.getPendingAdminKey(pending.promptChatId, pending.adminUserId));

    if (!tx) {
      await this.callApi('sendMessage', { chat_id: chatId, text: 'Transaction record not found.' });
      return;
    }

    const bankLabel = getCanonicalBankName(tx.bank_key, tx.button_label);
    const playerRawId = tx.player_id.replace(/^tg_/, '');
    const playerFullId = tx.player_id.startsWith('tg_') ? tx.player_id : `tg_${tx.player_id}`;

    if (pending.mode === 'deposit_accept') {
      if (tx.status !== 'pending') {
        await this.callApi('sendMessage', { chat_id: chatId, text: 'This deposit was already processed.' });
        return;
      }

      await this.hub.creditDepositFromBot(playerFullId, tx.player_name, roundedAmt);
      await supabaseStore.updateTransaction(tx.id, {
        status: 'accepted',
        amount_birr: roundedAmt,
        resolved_by: pending.adminName,
        resolved_at: new Date().toISOString(),
      });

      const suffix = `\n\n✅ <b>ACCEPTED (${escapeHtml(bankLabel)}): +${roundedAmt} Birr</b> · by ${escapeHtml(pending.adminName)}`;
      await this.editAllGroupMessagesResolved(
        tx,
        pending.groupChatId,
        pending.originalGroupMsgId,
        pending.hasPhoto,
        pending.originalTextOrCaption,
        suffix
      );

      await this.callApi('sendMessage', {
        chat_id: chatId,
        reply_to_message_id: messageId,
        text: `✅ Credited <b>${roundedAmt} Birr</b> via <b>${escapeHtml(bankLabel)}</b> to ${escapeHtml(tx.player_name)}.`,
        parse_mode: 'HTML',
      });

      const playerSession = await supabaseStore.getBotSession(playerRawId);
      const playerLang = this.hub.getPlayerLanguage(playerFullId) || playerSession.language || 'en';
      await this.callApi('sendMessage', {
        chat_id: playerRawId,
        text: `✅ ${BOT_STRINGS[playerLang].depositAcceptedUser(roundedAmt, getLocalizedBankName((tx.bank_key as PresetBankKey) || 'telebirr', playerLang, bankLabel))}`,
      });

      // Referral first qualifying deposit bonuses (>= 100 Birr tier, or >= 50 Birr tier)
      if (roundedAmt >= 100) {
        const referral = await supabaseStore.getReferralByReferredId(playerFullId);
        if (referral && !referral.deposit_bonus_paid) {
          const { config } = await supabaseStore.getBotConfigAndButtons();
          const depositBonus = Math.max(0, Number(config.referralDepositBonus || 0));
          const updatedRef = await supabaseStore.markReferralDepositBonusPaid(
            playerFullId,
            depositBonus,
            roundedAmt
          );
          if (updatedRef && depositBonus > 0) {
            await this.hub.creditDepositFromBot(referral.referrer_id, referral.referrer_name, depositBonus);
            const referrerRawId = referral.referrer_id.replace(/^tg_/, '');
            const refSession = await supabaseStore.getBotSession(referrerRawId);
            const refLang = this.hub.getPlayerLanguage(referral.referrer_id) || refSession.language || 'en';
            await this.callApi('sendMessage', {
              chat_id: referrerRawId,
              text: BOT_STRINGS[refLang].referralDepositNotify(tx.player_name, roundedAmt, depositBonus, 100),
              parse_mode: 'HTML',
            });
          }
        }
      } else if (roundedAmt >= 50) {
        const referral = await supabaseStore.getReferralByReferredId(playerFullId);
        if (referral && !referral.deposit_50_bonus_paid && !referral.deposit_bonus_paid) {
          const { config } = await supabaseStore.getBotConfigAndButtons();
          const deposit50Bonus = Math.max(0, Number(config.referralDeposit50Bonus || 0));
          const updatedRef = await supabaseStore.markReferralDeposit50BonusPaid(
            playerFullId,
            deposit50Bonus,
            roundedAmt
          );
          if (updatedRef && deposit50Bonus > 0) {
            await this.hub.creditDepositFromBot(referral.referrer_id, referral.referrer_name, deposit50Bonus);
            const referrerRawId = referral.referrer_id.replace(/^tg_/, '');
            const refSession = await supabaseStore.getBotSession(referrerRawId);
            const refLang = this.hub.getPlayerLanguage(referral.referrer_id) || refSession.language || 'en';
            await this.callApi('sendMessage', {
              chat_id: referrerRawId,
              text: BOT_STRINGS[refLang].referralDepositNotify(tx.player_name, roundedAmt, deposit50Bonus, 50),
              parse_mode: 'HTML',
            });
          }
        }
      }
      return;
    }

    if (pending.mode === 'withdraw_done') {
      const updatedWallet = await this.hub.deductWithdrawFromBot(playerFullId, tx.player_name, roundedAmt);
      await supabaseStore.updateTransaction(tx.id, {
        status: 'done',
        amount_birr: roundedAmt,
        resolved_by: pending.adminName,
        resolved_at: tx.resolved_at || new Date().toISOString(),
      });

      const suffix = `\n\n✅ <b>DONE (${escapeHtml(bankLabel)}): -${roundedAmt} Birr sent</b> · by ${escapeHtml(pending.adminName)}`;
      await this.editAllGroupMessagesResolved(
        tx,
        pending.groupChatId,
        pending.originalGroupMsgId,
        pending.hasPhoto,
        pending.originalTextOrCaption,
        suffix
      );

      await this.callApi('sendMessage', {
        chat_id: chatId,
        reply_to_message_id: messageId,
        text: `✅ Logged <b>${roundedAmt} Birr</b> withdrawal via <b>${escapeHtml(bankLabel)}</b> for ${escapeHtml(tx.player_name)} (Remaining balance: ${updatedWallet.depositedBalance + updatedWallet.wonBalance} Birr).`,
        parse_mode: 'HTML',
      });
    }
  }

  private async maybeProcessReferralJoin(
    tgUserId: string,
    fullName: string,
    username: string | undefined,
    referrerTgId: string,
    wasAlreadyPlayer: boolean
  ) {
    if (!referrerTgId || referrerTgId === tgUserId || !/^\d+$/.test(referrerTgId)) return;
    if (wasAlreadyPlayer) return;

    const referredFullId = `tg_${tgUserId}`;
    const existingRef = await supabaseStore.getReferralByReferredId(referredFullId);
    if (existingRef) return;

    const referrerFullId = `tg_${referrerTgId}`;
    const [refInfo, { config }] = await Promise.all([
      supabaseStore.getPlayerInfo(referrerFullId),
      supabaseStore.getBotConfigAndButtons(),
    ]);
    const referrerName =
      this.hub.getPlayerName(referrerFullId) || refInfo.name || `Player ${referrerTgId}`;
    const signupBonus = Math.max(0, Number(config.referralSignupBonus || 0));
    const deposit50Bonus = Math.max(0, Number(config.referralDeposit50Bonus || 0));
    const depositBonus = Math.max(0, Number(config.referralDepositBonus || 0));

    const created = await supabaseStore.createReferral({
      referrerId: referrerFullId,
      referrerName,
      referrerUsername: refInfo.username || null,
      referredId: referredFullId,
      referredName: fullName,
      referredUsername: username || null,
      signupBonusBirr: signupBonus,
    });

    if (!created) return;

    if (signupBonus > 0) {
      await this.hub.creditDepositFromBot(referrerFullId, referrerName, signupBonus);
    }

    const refSession = await supabaseStore.getBotSession(referrerTgId);
    const refLang = this.hub.getPlayerLanguage(referrerFullId) || refSession.language || 'en';
    await this.callApi('sendMessage', {
      chat_id: referrerTgId,
      text: BOT_STRINGS[refLang].referralJoinedNotify(fullName, signupBonus, deposit50Bonus, depositBonus),
      parse_mode: 'HTML',
    });
  }

  public async processPendingBroadcasts() {
    if (!this.botToken || this.isProcessingBroadcasts) return;
    this.isProcessingBroadcasts = true;
    try {
      const pendingList = await supabaseStore.fetchPendingBroadcasts();
      if (pendingList.length === 0) return;

      for (const job of pendingList) {
        const recipients = await supabaseStore.listAllTelegramUserIds(this.hub.getAllPlayerIds());
        await supabaseStore.updateBroadcast(job.id, {
          status: 'sending',
          total_count: recipients.length,
        });

        let sentCount = 0;
        let failedCount = 0;

        for (const recipientId of recipients) {
          const res = await this.callApi('sendMessage', {
            chat_id: recipientId,
            text: job.message_text,
          });
          if (res?.ok) {
            sentCount += 1;
          } else {
            failedCount += 1;
          }
          // Gentle rate-limit spacing (~25 msgs/sec)
          await new Promise((resolve) => setTimeout(resolve, 40));
        }

        await supabaseStore.updateBroadcast(job.id, {
          status: 'completed',
          total_count: recipients.length,
          sent_count: sentCount,
          failed_count: failedCount,
          completed_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error('[Broadcast Worker Error]:', err);
    } finally {
      this.isProcessingBroadcasts = false;
    }
  }

  public async handleUpdate(update: Record<string, any>, fallbackAppUrl: string) {
    const miniAppBaseUrl = this.resolveMiniAppUrl(fallbackAppUrl);

    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query, miniAppBaseUrl);
      return;
    }

    const message = update.message;
    if (!message || !message.chat || !message.from) return;

    const chatId = String(message.chat.id);
    const chatType = String(message.chat.type || 'private');
    const from = message.from as {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      is_bot?: boolean;
    };
    if (from.is_bot) return;

    const tgUserId = String(from.id);
    const fullName =
      [from.first_name, from.last_name].filter(Boolean).join(' ').trim() ||
      from.username ||
      `Player ${from.id}`;
    const text = typeof message.text === 'string' ? message.text.trim() : '';

    // Group / Supergroup messages (Admin Group commands & Deposit/Withdrawal amount input)
    if (chatType === 'group' || chatType === 'supergroup') {
      if (text.startsWith('/setgroup')) {
        const isAllowed = await this.isTelegramGroupAdmin(chatId, from.id, chatType);
        if (!isAllowed) {
          await this.callApi('sendMessage', {
            chat_id: chatId,
            text: 'Only a group admin can link this Admin Group.',
          });
          return;
        }
        await supabaseStore.setAdminGroupId(chatId);
        await this.callApi('sendMessage', {
          chat_id: chatId,
          text: `✅ <b>Admin Group Linked!</b>\nGroup ID: <code>${escapeHtml(chatId)}</code>\nAll player Deposit and Withdrawal requests will be sent here.`,
          parse_mode: 'HTML',
        });
        return;
      }

      const pendingKey = this.getPendingAdminKey(chatId, tgUserId);
      const replyToId = message.reply_to_message?.message_id ? Number(message.reply_to_message.message_id) : null;
      let pending = this.pendingAdminAmounts.get(pendingKey);
      if (!pending && replyToId) {
        for (const item of this.pendingAdminAmounts.values()) {
          if (item.promptChatId === chatId && item.promptMessageId === replyToId) {
            pending = item;
            break;
          }
        }
      }

      if (pending && text && !text.startsWith('/')) {
        await this.processPendingAdminAmountReply(chatId, message.message_id, pending, text);
        return;
      }
      return;
    }

    // Private Chat Messages
    if (chatType !== 'private') return;

    // Check if an admin is replying in DM to a channel-triggered amount prompt
    const dmPendingKey = this.getPendingAdminKey(chatId, tgUserId);
    const dmPending = this.pendingAdminAmounts.get(dmPendingKey);
    if (dmPending && text && !text.startsWith('/')) {
      await this.processPendingAdminAmountReply(chatId, message.message_id, dmPending, text);
      return;
    }

    const playerFullId = `tg_${tgUserId}`;
    const refMatch = text.match(/^\/start(?:@\S+)?\s+ref_(\d+)/i);
    let wasAlreadyPlayer = this.hub.hasPlayer(playerFullId);
    if (!wasAlreadyPlayer && refMatch) {
      const info = await supabaseStore.getPlayerInfo(playerFullId);
      wasAlreadyPlayer = info.exists;
    }

    const session = await supabaseStore.getBotSession(tgUserId);
    const lang: AppLanguage = this.hub.getPlayerLanguage(playerFullId) || session.language || 'en';
    const t = BOT_STRINGS[lang];

    // Ensure Telegram account name & username are always synced into Hub & Supabase
    this.hub.getWalletSnapshot(playerFullId, fullName, from.username);

    if (refMatch) {
      await this.maybeProcessReferralJoin(tgUserId, fullName, from.username, refMatch[1], wasAlreadyPlayer);
    }

    if (text.startsWith('/start') || text.startsWith('/play')) {
      session.pending_action = null;
      session.selected_button_id = null;
      session.selected_button_label = null;
      session.selected_bank_key = null;
      session.language = lang;
      await supabaseStore.saveBotSession(session);
      await this.sendHomeMenu(chatId, tgUserId, fullName, from.username, lang, miniAppBaseUrl);
      return;
    }

    if (text.startsWith('/deposit')) {
      session.pending_action = null;
      await supabaseStore.saveBotSession(session);
      await this.sendDepositMenu(chatId, lang);
      return;
    }

    if (text.startsWith('/withdraw')) {
      session.pending_action = null;
      await supabaseStore.saveBotSession(session);
      await this.sendWithdrawMenu(chatId, lang);
      return;
    }

    if (text.startsWith('/referral')) {
      session.pending_action = null;
      await supabaseStore.saveBotSession(session);
      await this.sendReferralMenu(chatId, tgUserId, lang, miniAppBaseUrl);
      return;
    }

    if (text.startsWith('/language')) {
      await this.sendLanguageMenu(chatId, lang);
      return;
    }

    if (
      session.pending_action === 'awaiting_deposit_proof' ||
      session.pending_action === 'awaiting_withdraw_info'
    ) {
      const photos = Array.isArray(message.photo) ? message.photo : [];
      const largestPhoto = photos.length > 0 ? photos[photos.length - 1] : null;
      const photoFileId: string | null = largestPhoto?.file_id ? String(largestPhoto.file_id) : null;
      const userMessageText: string | null =
        (typeof message.text === 'string' && message.text.trim()) ||
        (typeof message.caption === 'string' && message.caption.trim()) ||
        null;

      if (!photoFileId && !userMessageText) return;

      const { config } = await supabaseStore.getBotConfigAndButtons();
      const targetGroupIds = supabaseStore.getAllTargetGroupIds(config);
      if (targetGroupIds.length === 0) {
        await this.callApi('sendMessage', {
          chat_id: chatId,
          text: t.adminGroupNotConfigured,
        });
        return;
      }

      const txType = session.pending_action === 'awaiting_deposit_proof' ? 'deposit' : 'withdraw';
      const canonicalBank = getCanonicalBankName(session.selected_bank_key, session.selected_button_label);

      const tx = await supabaseStore.createTransaction({
        playerId: playerFullId,
        playerName: fullName,
        playerUsername: from.username || null,
        txType,
        bankKey: session.selected_bank_key,
        buttonId: session.selected_button_id,
        buttonLabel: canonicalBank,
        userMessage: userMessageText,
        userPhotoFileId: photoFileId,
        adminGroupId: targetGroupIds[0],
      });

      session.pending_action = null;
      session.selected_button_id = null;
      session.selected_button_label = null;
      session.selected_bank_key = null;
      await supabaseStore.saveBotSession(session);

      const wallet = this.hub.getWalletSnapshot(playerFullId, fullName, from.username);
      const userHandle = from.username ? `@${from.username}` : 'No username';
      const headerLabel = txType === 'deposit' ? '💰 <b>NEW DEPOSIT REQUEST</b>' : '💸 <b>NEW WITHDRAWAL REQUEST</b>';
      const detailsBlock =
        `${headerLabel}\n` +
        `Player: <b>${escapeHtml(fullName)}</b> (${escapeHtml(userHandle)})\n` +
        `Telegram ID: <code>${escapeHtml(tgUserId)}</code>\n` +
        `Bank: <b>${escapeHtml(canonicalBank)}</b>\n` +
        `Balance: <b>${wallet.depositedBalance + wallet.wonBalance} Birr</b> (Dep: ${wallet.depositedBalance} · Won: ${wallet.wonBalance})` +
        (userMessageText ? `\nMessage: ${escapeHtml(userMessageText)}` : '');

      const adminKeyboard =
        txType === 'deposit'
          ? [
              [
                { text: '✅ Accept', callback_data: `adm_da:${tx.id}` },
                { text: '❌ Reject', callback_data: `adm_dr:${tx.id}` },
              ],
            ]
          : [
              [
                { text: '✅ Done', callback_data: `adm_wd:${tx.id}` },
                { text: '⚠️ Incorrect Info', callback_data: `adm_wb:${tx.id}` },
              ],
            ];

      const sentRefs: AdminGroupMessageRef[] = [];
      for (const targetChatId of targetGroupIds) {
        let sentRes: any = null;
        if (photoFileId) {
          sentRes = await this.callApi('sendPhoto', {
            chat_id: targetChatId,
            photo: photoFileId,
            caption: detailsBlock,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: adminKeyboard },
          });
        } else {
          sentRes = await this.callApi('sendMessage', {
            chat_id: targetChatId,
            text: detailsBlock,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: adminKeyboard },
          });
        }
        if (sentRes?.result?.message_id) {
          sentRefs.push({
            chat_id: targetChatId,
            message_id: Number(sentRes.result.message_id),
          });
        }
      }

      if (sentRefs.length > 0) {
        await supabaseStore.updateTransaction(tx.id, {
          admin_group_message_id: sentRefs[0].message_id,
          admin_group_messages: sentRefs,
        });
      }

      await this.callApi('sendMessage', {
        chat_id: chatId,
        text: txType === 'deposit' ? t.depositReceived : t.withdrawReceived,
      });
      return;
    }

    await this.sendHomeMenu(chatId, tgUserId, fullName, from.username, lang, miniAppBaseUrl);
  }

  private async handleCallbackQuery(cq: Record<string, any>, miniAppBaseUrl: string) {
    const cqId = String(cq.id);
    const data = String(cq.data || '');
    const msg = cq.message;
    const from = cq.from as {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };

    if (!msg || !msg.chat || !from) {
      await this.callApi('answerCallbackQuery', { callback_query_id: cqId });
      return;
    }

    const chatId = String(msg.chat.id);
    const chatType = String(msg.chat.type || 'private');
    const msgId = Number(msg.message_id);
    const tgUserId = String(from.id);
    const fullName =
      [from.first_name, from.last_name].filter(Boolean).join(' ').trim() ||
      from.username ||
      `Player ${from.id}`;

    // Admin Group / Channel Button Actions
    if (data.startsWith('adm_')) {
      if (chatType !== 'group' && chatType !== 'supergroup' && chatType !== 'channel') {
        await this.callApi('answerCallbackQuery', { callback_query_id: cqId });
        return;
      }

      const isAllowed = await this.isTelegramGroupAdmin(chatId, from.id, chatType);
      if (!isAllowed) {
        await this.callApi('answerCallbackQuery', {
          callback_query_id: cqId,
          text: 'Only admins can approve or reject requests.',
          show_alert: true,
        });
        return;
      }

      const [action, txId] = data.split(':');
      const tx = await supabaseStore.getTransaction(txId);
      if (!tx) {
        await this.callApi('answerCallbackQuery', {
          callback_query_id: cqId,
          text: 'Request record not found.',
          show_alert: true,
        });
        return;
      }
      if (tx.status !== 'pending') {
        await this.callApi('answerCallbackQuery', {
          callback_query_id: cqId,
          text: `Already marked as ${tx.status}.`,
        });
        return;
      }

      const hasPhoto = Boolean(msg.photo && msg.photo.length > 0);
      const origContent = escapeHtml(String(hasPhoto ? msg.caption || '' : msg.text || ''));
      const bankLabel = getCanonicalBankName(tx.bank_key, tx.button_label);
      const playerRawId = tx.player_id.replace(/^tg_/, '');
      const playerFullId = tx.player_id.startsWith('tg_') ? tx.player_id : `tg_${tx.player_id}`;
      const playerSession = await supabaseStore.getBotSession(playerRawId);
      const playerLang = this.hub.getPlayerLanguage(playerFullId) || playerSession.language || 'en';
      const pt = BOT_STRINGS[playerLang];

      // In channels, prompt the clicking admin in DM since channel replies cannot identify user
      const promptChatId = chatType === 'channel' ? tgUserId : chatId;

      if (action === 'adm_da') {
        await this.callApi('answerCallbackQuery', {
          callback_query_id: cqId,
          text: chatType === 'channel' ? 'Check your private chat with the bot to enter the Birr amount.' : undefined,
        });
        const promptRes = await this.callApi('sendMessage', {
          chat_id: promptChatId,
          reply_to_message_id: chatType === 'channel' ? undefined : msgId,
          text: `💵 How much Birr was deposited via <b>${escapeHtml(bankLabel)}</b> for <b>${escapeHtml(tx.player_name)}</b>?\nType the number below:`,
          parse_mode: 'HTML',
          reply_markup: { force_reply: true, selective: true },
        });
        this.pendingAdminAmounts.set(this.getPendingAdminKey(promptChatId, tgUserId), {
          mode: 'deposit_accept',
          txId: tx.id,
          groupChatId: chatId,
          promptChatId,
          adminUserId: tgUserId,
          adminName: fullName,
          promptMessageId: promptRes?.result?.message_id ? Number(promptRes.result.message_id) : null,
          originalGroupMsgId: msgId,
          hasPhoto,
          originalTextOrCaption: origContent,
        });
        return;
      }

      if (action === 'adm_dr') {
        await this.callApi('answerCallbackQuery', { callback_query_id: cqId, text: 'Rejected' });
        await supabaseStore.updateTransaction(tx.id, {
          status: 'rejected',
          resolved_by: fullName,
          resolved_at: new Date().toISOString(),
        });
        const suffix = `\n\n❌ <b>REJECTED (${escapeHtml(bankLabel)})</b> · by ${escapeHtml(fullName)}`;
        await this.editAllGroupMessagesResolved(tx, chatId, msgId, hasPhoto, origContent, suffix);
        await this.callApi('sendMessage', {
          chat_id: playerRawId,
          text: `❌ ${pt.depositRejectedUser}`,
        });
        return;
      }

      if (action === 'adm_wd') {
        await this.callApi('answerCallbackQuery', {
          callback_query_id: cqId,
          text: chatType === 'channel' ? 'Marked Done! Check DM to enter amount.' : 'Marked Done',
        });
        await supabaseStore.updateTransaction(tx.id, {
          status: 'done',
          resolved_by: fullName,
          resolved_at: new Date().toISOString(),
        });

        await this.callApi('sendMessage', {
          chat_id: playerRawId,
          text: `✅ ${pt.withdrawDoneUser}`,
        });

        const promptRes = await this.callApi('sendMessage', {
          chat_id: promptChatId,
          reply_to_message_id: chatType === 'channel' ? undefined : msgId,
          text: `💵 Marked Done & notified ${escapeHtml(tx.player_name)}!\nHow much Birr did you send via <b>${escapeHtml(bankLabel)}</b>? Type the number below to record & deduct:`,
          parse_mode: 'HTML',
          reply_markup: { force_reply: true, selective: true },
        });
        this.pendingAdminAmounts.set(this.getPendingAdminKey(promptChatId, tgUserId), {
          mode: 'withdraw_done',
          txId: tx.id,
          groupChatId: chatId,
          promptChatId,
          adminUserId: tgUserId,
          adminName: fullName,
          promptMessageId: promptRes?.result?.message_id ? Number(promptRes.result.message_id) : null,
          originalGroupMsgId: msgId,
          hasPhoto,
          originalTextOrCaption: origContent,
        });
        return;
      }

      if (action === 'adm_wb') {
        await this.callApi('answerCallbackQuery', { callback_query_id: cqId, text: 'Marked Incorrect Info' });
        await supabaseStore.updateTransaction(tx.id, {
          status: 'incorrect',
          resolved_by: fullName,
          resolved_at: new Date().toISOString(),
        });
        const suffix = `\n\n⚠️ <b>INCORRECT INFO (${escapeHtml(bankLabel)})</b> · by ${escapeHtml(fullName)}`;
        await this.editAllGroupMessagesResolved(tx, chatId, msgId, hasPhoto, origContent, suffix);
        await this.callApi('sendMessage', {
          chat_id: playerRawId,
          text: `⚠️ ${pt.withdrawIncorrectUser}`,
        });
        return;
      }

      await this.callApi('answerCallbackQuery', { callback_query_id: cqId });
      return;
    }

    // Player Private Bot Menu Callbacks
    await this.callApi('answerCallbackQuery', { callback_query_id: cqId });

    const session = await supabaseStore.getBotSession(tgUserId);
    const lang: AppLanguage = this.hub.getPlayerLanguage(`tg_${tgUserId}`) || session.language || 'en';
    const t = BOT_STRINGS[lang];
    this.hub.getWalletSnapshot(`tg_${tgUserId}`, fullName, from.username);

    if (data === 'menu:home' || data === 'menu:cancel') {
      session.pending_action = null;
      session.selected_button_id = null;
      session.selected_button_label = null;
      session.selected_bank_key = null;
      await supabaseStore.saveBotSession(session);
      await this.sendHomeMenu(chatId, tgUserId, fullName, from.username, lang, miniAppBaseUrl, msgId);
      return;
    }

    if (data === 'menu:deposit') {
      await this.sendDepositMenu(chatId, lang, msgId);
      return;
    }

    if (data === 'menu:withdraw') {
      await this.sendWithdrawMenu(chatId, lang, msgId);
      return;
    }

    if (data === 'menu:referral') {
      await this.sendReferralMenu(chatId, tgUserId, lang, miniAppBaseUrl, msgId);
      return;
    }

    if (data === 'menu:language') {
      await this.sendLanguageMenu(chatId, lang, msgId);
      return;
    }

    if (data.startsWith('lang:')) {
      const nextLang = data.slice(5) as AppLanguage;
      if (nextLang === 'en' || nextLang === 'am' || nextLang === 'om') {
        session.language = nextLang;
        session.pending_action = null;
        await supabaseStore.saveBotSession(session);
        this.hub.setPlayerLanguage(`tg_${tgUserId}`, nextLang);
        await supabaseStore.setPlayerLanguage(`tg_${tgUserId}`, nextLang);
        await this.sendHomeMenu(chatId, tgUserId, fullName, from.username, nextLang, miniAppBaseUrl, msgId);
      }
      return;
    }

    if (data.startsWith('dep:')) {
      const bankKey = data.slice(4) as PresetBankKey;
      const { buttons } = await supabaseStore.getBotConfigAndButtons();
      const btn: PaymentButtonRecord | undefined = buttons.find(
        (b) => b.flow_type === 'deposit' && b.bank_key === bankKey
      );
      if (!btn) {
        await this.sendDepositMenu(chatId, lang, msgId);
        return;
      }
      const displayBank = getLocalizedBankName(btn.bank_key, lang, btn.label);
      session.pending_action = 'awaiting_deposit_proof';
      session.selected_button_id = btn.id;
      session.selected_button_label = getCanonicalBankName(btn.bank_key, btn.label);
      session.selected_bank_key = btn.bank_key;
      await supabaseStore.saveBotSession(session);

      const replyText = btn.response_text.trim() || t.depositFallbackReply(displayBank);
      await this.callApi('sendMessage', {
        chat_id: chatId,
        text: `<b>${escapeHtml(displayBank)}</b>\n\n${escapeHtml(replyText)}`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: `❌ ${t.btnCancel}`, callback_data: 'menu:cancel' }]],
        },
      });
      return;
    }

    if (data.startsWith('wd:')) {
      const bankKey = data.slice(3) as PresetBankKey;
      const { config, buttons } = await supabaseStore.getBotConfigAndButtons();
      const btn: PaymentButtonRecord | undefined = buttons.find(
        (b) => b.flow_type === 'withdraw' && b.bank_key === bankKey
      );
      if (!btn) {
        await this.sendWithdrawMenu(chatId, lang, msgId);
        return;
      }
      const displayBank = getLocalizedBankName(btn.bank_key, lang, btn.label);
      session.pending_action = 'awaiting_withdraw_info';
      session.selected_button_id = btn.id;
      session.selected_button_label = getCanonicalBankName(btn.bank_key, btn.label);
      session.selected_bank_key = btn.bank_key;
      await supabaseStore.saveBotSession(session);

      const replyText = btn.response_text.trim() || config.withdrawPromptText;
      await this.callApi('sendMessage', {
        chat_id: chatId,
        text: `<b>${escapeHtml(displayBank)}</b>\n\n${escapeHtml(replyText)}`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: `❌ ${t.btnCancel}`, callback_data: 'menu:cancel' }]],
        },
      });
    }
  }
}

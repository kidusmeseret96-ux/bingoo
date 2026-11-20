import React, { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Pencil, Save, X } from 'lucide-react';
import type { DashboardSettings, PaymentButton } from '../types';

interface Props {
  settings: DashboardSettings;
  buttons: PaymentButton[];
  busy: boolean;
  onSaveSettings: (patch: {
    admin_group_id: string;
    extra_group_ids: string;
    deposit_intro_text: string;
    withdraw_intro_text: string;
    withdraw_prompt_text: string;
    new_pin?: string;
  }) => Promise<void>;
  onSaveBankMessage: (id: string, responseText: string, isActive: boolean, label: string) => Promise<void>;
}

const BANK_DISPLAY_NAMES: Record<string, string> = {
  telebirr: 'Telebirr (ቴሌብር)',
  cbe: 'CBE (ሲቢኢ)',
  cbe_birr: 'CBE Birr (ሲቢኢ ብር)',
  abyssinia: 'Abyssinia Bank (አቢሲኒያ ባንክ)',
  awash: 'Awash Bank (አዋሽ ባንክ)',
  kaffi: 'Kaffi (ካፊ)',
  ebirr: 'E-Birr (ኢ-ብር)',
  coop: 'Coop (ኩፕ / Baankii Coop)',
};

export const ButtonsConfigurator: React.FC<Props> = ({
  settings,
  buttons,
  busy,
  onSaveSettings,
  onSaveBankMessage,
}) => {
  const [adminGroupId, setAdminGroupId] = useState(settings.admin_group_id || '');
  const [extraGroupIds, setExtraGroupIds] = useState(settings.extra_group_ids || '');
  const [depositIntro, setDepositIntro] = useState(settings.deposit_intro_text || '');
  const [withdrawIntro, setWithdrawIntro] = useState(settings.withdraw_intro_text || '');
  const [withdrawPrompt, setWithdrawPrompt] = useState(settings.withdraw_prompt_text || '');
  const [newPin, setNewPin] = useState('');

  useEffect(() => {
    setAdminGroupId(settings.admin_group_id || '');
    setExtraGroupIds(settings.extra_group_ids || '');
    setDepositIntro(settings.deposit_intro_text || '');
    setWithdrawIntro(settings.withdraw_intro_text || '');
    setWithdrawPrompt(settings.withdraw_prompt_text || '');
  }, [
    settings.admin_group_id,
    settings.extra_group_ids,
    settings.deposit_intro_text,
    settings.withdraw_intro_text,
    settings.withdraw_prompt_text,
  ]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editReply, setEditReply] = useState('');
  const [editActive, setEditActive] = useState(true);

  const depositButtons = buttons
    .filter((b) => b.flow_type === 'deposit')
    .sort((a, b) => a.sort_order - b.sort_order);

  const withdrawButtons = buttons
    .filter((b) => b.flow_type === 'withdraw')
    .sort((a, b) => a.sort_order - b.sort_order);

  const startEdit = (b: PaymentButton) => {
    setEditingId(b.id);
    setEditReply(b.response_text || '');
    setEditActive(b.is_active);
  };

  const handleSave = async (b: PaymentButton) => {
    await onSaveBankMessage(b.id, editReply.trim(), editActive, b.label);
    setEditingId(null);
  };

  const renderBankList = (
    list: PaymentButton[],
    flowType: 'deposit' | 'withdraw',
    emptyFallbackLabel: string
  ) => (
    <div className="divide-y divide-slate-100 mt-2">
      {list.length === 0 ? (
        <p className="py-6 text-sm text-slate-500">
          Preset bank buttons will appear automatically once the schema is initialized in Supabase.
        </p>
      ) : (
        list.map((b) => {
          const isEditing = editingId === b.id;
          const displayName = (b.bank_key && BANK_DISPLAY_NAMES[b.bank_key]) || b.label;
          return (
            <div key={b.id} className="py-4">
              {isEditing ? (
                <div className="space-y-3 bg-slate-50 p-4 rounded-md border border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-900">{displayName}</span>
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={editActive}
                        onChange={(e) => setEditActive(e.target.checked)}
                      />
                      Visible in Bot
                    </label>
                  </div>
                  <textarea
                    rows={3}
                    value={editReply}
                    onChange={(e) => setEditReply(e.target.value)}
                    placeholder={
                      flowType === 'deposit'
                        ? 'Enter the exact account number & deposit message sent when player chooses this bank...'
                        : 'Optional custom withdraw message for this bank (leave blank to use the Shared Withdrawal Instruction above)...'
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSave(b)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Save Message
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-sm text-slate-900">{displayName}</span>
                      {!b.is_active && (
                        <span className="text-xs text-amber-700 font-medium">Hidden in Bot</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">
                      {b.response_text || emptyFallbackLabel}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(b)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit Message
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Bot Messages & Admin Group Configuration */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Bot Messages & Admin Group</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Preset bank buttons are localized automatically across English, Amharic, and Afaan Oromo. Edit your messages and group settings here.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onSaveSettings({
                admin_group_id: adminGroupId.trim(),
                extra_group_ids: extraGroupIds.trim(),
                deposit_intro_text: depositIntro.trim(),
                withdraw_intro_text: withdrawIntro.trim(),
                withdraw_prompt_text: withdrawPrompt.trim(),
                new_pin: newPin.trim() || undefined,
              })
            }
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            Save Bot Settings
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Primary Admin Telegram Group ID (or run /setgroup inside your group)
            </label>
            <input
              type="text"
              value={adminGroupId}
              onChange={(e) => setAdminGroupId(e.target.value)}
              placeholder="-1001234567890"
              className="w-full px-3 py-2 text-sm font-mono-num bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Change Dashboard & Mini App Admin PIN (optional)
            </label>
            <input
              type="password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder="Leave empty to keep current PIN"
              className="w-full px-3 py-2 text-sm font-mono-num bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Additional Payment Channel / Group IDs (optional — comma or new-line separated)
            </label>
            <textarea
              rows={2}
              value={extraGroupIds}
              onChange={(e) => setExtraGroupIds(e.target.value)}
              placeholder="-1001122334455, -1005566778899"
              className="w-full px-3 py-2 text-sm font-mono-num bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
            />
            <p className="text-xs text-slate-500 mt-1">
              All deposit &amp; withdrawal payment messages will be sent to the primary group above and every extra channel/group listed here (make sure the bot is added as admin in each).
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Deposit Menu Intro Message (optional override)
            </label>
            <textarea
              rows={2}
              value={depositIntro}
              onChange={(e) => setDepositIntro(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Withdraw Menu Intro Message (optional override)
            </label>
            <textarea
              rows={2}
              value={withdrawIntro}
              onChange={(e) => setWithdrawIntro(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Default Withdrawal Instruction Message (used when a bank does not have its own custom withdraw message below)
            </label>
            <textarea
              rows={2}
              value={withdrawPrompt}
              onChange={(e) => setWithdrawPrompt(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
            />
          </div>
        </div>
      </section>

      {/* Preset Deposit Banks (8 Fixed Banks) */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
          <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Deposit Bank Messages (8 Preset Banks)</h2>
            <p className="text-sm text-slate-500">
              Edit the account number and instructions sent by the bot when a player taps each Deposit bank button.
            </p>
          </div>
        </div>
        {renderBankList(depositButtons, 'deposit', 'No custom message set yet.')}
      </section>

      {/* Preset Withdraw Banks (8 Fixed Banks) */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
          <ArrowUpRight className="w-4 h-4 text-amber-600" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Withdraw Bank Messages (8 Preset Banks)</h2>
            <p className="text-sm text-slate-500">
              Edit a bank-specific withdrawal message below, or leave blank to automatically send the Default Withdrawal Instruction above.
            </p>
          </div>
        </div>
        {renderBankList(
          withdrawButtons,
          'withdraw',
          'Using Default Withdrawal Instruction Message.'
        )}
      </section>
    </div>
  );
};

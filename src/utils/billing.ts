import type {
  ComputedBilling,
  CurrencyCode,
  ExchangeRateState,
  KomariClient,
} from '../types/komari';

export const CURRENCY_META: Record<
  CurrencyCode,
  { symbol: string; label: string; decimals: number }
> = {
  CNY: { symbol: '¥', label: 'CNY 人民币', decimals: 2 },
  USD: { symbol: '$', label: 'USD 美元', decimals: 2 },
  EUR: { symbol: '€', label: 'EUR 欧元', decimals: 2 },
  HKD: { symbol: 'HK$', label: 'HKD 港币', decimals: 2 },
  GBP: { symbol: '£', label: 'GBP 英镑', decimals: 2 },
  JPY: { symbol: 'JP¥', label: 'JPY 日元', decimals: 0 },
};

export function parseCurrencyCode(raw?: string): CurrencyCode {
  if (!raw) return 'CNY';
  const s = raw.trim().toUpperCase();
  if (s === '$' || s === 'USD' || s === 'US$') return 'USD';
  if (s === '€' || s === 'EUR') return 'EUR';
  if (s === 'HK$' || s === 'HKD') return 'HKD';
  if (s === '£' || s === 'GBP') return 'GBP';
  if (s === 'JPY' || s === 'JP¥' || s === '円') return 'JPY';
  if (s === '¥' || s === '￥' || s === 'CNY' || s === 'RMB') return 'CNY';
  return 'CNY';
}

export function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rates: ExchangeRateState
): number {
  if (!Number.isFinite(amount) || amount === 0) return 0;
  if (from === to) return amount;
  const fromCny = rates.cnyPerUnit[from] ?? 1;
  const toCny = rates.cnyPerUnit[to] ?? 1;
  const inCny = amount * fromCny;
  return inCny / toCny;
}

export function formatCurrencyValue(amount: number, currency: CurrencyCode): string {
  const meta = CURRENCY_META[currency] || CURRENCY_META.CNY;
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  });
  return `${meta.symbol}${formatted}`;
}

export function describeBillingCycle(days: number): {
  label: string;
  monthsEquivalent: number;
} {
  if (days <= 0) return { label: '一次性', monthsEquivalent: 0 };
  if (days >= 28 && days <= 31) return { label: '月付', monthsEquivalent: 1 };
  if (days >= 88 && days <= 93) return { label: '季付', monthsEquivalent: 3 };
  if (days >= 178 && days <= 186) return { label: '半年付', monthsEquivalent: 6 };
  if (days >= 360 && days <= 366) return { label: '年付', monthsEquivalent: 12 };
  if (days >= 720 && days <= 732) return { label: '两年付', monthsEquivalent: 24 };
  if (days >= 1080 && days <= 1100) return { label: '三年付', monthsEquivalent: 36 };
  return { label: `${days}天`, monthsEquivalent: days / 30 };
}

export function computeNodeBilling(
  client: KomariClient,
  targetCurrency: CurrencyCode,
  rates: ExchangeRateState,
  nowMs = Date.now()
): ComputedBilling {
  const rawPrice = Number(client.price) || 0;
  const rawCurrency = parseCurrencyCode(client.currency);
  const cycleDays = Number(client.billing_cycle) || 30;
  const { label: cycleLabel, monthsEquivalent } = describeBillingCycle(cycleDays);

  if (rawPrice < 0) {
    return {
      hasBilling: true,
      isFree: true,
      rawPrice: 0,
      rawCurrency,
      cycleDays,
      cycleLabel: '免费',
      monthlyInTarget: 0,
      residualInTarget: 0,
      remainDays: null,
      remainRatio: 1,
      expiredAtText: '长期有效',
      isExpired: false,
    };
  }

  if (rawPrice === 0 && !client.expired_at) {
    return {
      hasBilling: false,
      isFree: false,
      rawPrice: 0,
      rawCurrency,
      cycleDays,
      cycleLabel,
      monthlyInTarget: 0,
      residualInTarget: 0,
      remainDays: null,
      remainRatio: 0,
      expiredAtText: '未设置',
      isExpired: false,
    };
  }

  const monthlyRaw =
    monthsEquivalent > 0 ? rawPrice / monthsEquivalent : 0;
  const monthlyInTarget = convertCurrency(monthlyRaw, rawCurrency, targetCurrency, rates);

  let remainDays: number | null = null;
  let remainRatio = 0;
  let residualRaw = 0;
  let expiredAtText = '长期有效';
  let isExpired = false;

  if (client.expired_at) {
    const expMs = Date.parse(client.expired_at);
    if (!Number.isNaN(expMs) && expMs > 946684800000) {
      // Valid timestamp after year 2000
      const d = new Date(expMs);
      expiredAtText = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
      const diffDays = (expMs - nowMs) / 86_400_000;
      if (diffDays <= 0) {
        isExpired = true;
        remainDays = 0;
        remainRatio = 0;
        residualRaw = 0;
      } else {
        remainDays = Math.ceil(diffDays);
        const effectiveCycle = cycleDays > 0 ? cycleDays : 365;
        remainRatio = Math.min(1, Math.max(0, diffDays / effectiveCycle));
        residualRaw = cycleDays > 0 ? rawPrice * (diffDays / cycleDays) : rawPrice;
      }
    }
  }

  const residualInTarget = convertCurrency(residualRaw, rawCurrency, targetCurrency, rates);

  return {
    hasBilling: true,
    isFree: rawPrice === 0,
    rawPrice,
    rawCurrency,
    cycleDays,
    cycleLabel,
    monthlyInTarget,
    residualInTarget,
    remainDays,
    remainRatio,
    expiredAtText,
    isExpired,
  };
}

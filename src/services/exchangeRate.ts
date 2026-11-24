import type { CurrencyCode, ExchangeRateState } from '../types/komari';

const FX_CACHE_KEY = 'km_zachary_fx_v1';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export const FALLBACK_CNY_PER_UNIT: Record<CurrencyCode, number> = {
  CNY: 1,
  USD: 7.24,
  EUR: 7.72,
  HKD: 0.93,
  GBP: 9.15,
  JPY: 0.0476,
};

export function getInitialExchangeRates(): ExchangeRateState {
  try {
    const raw = localStorage.getItem(FX_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ExchangeRateState & { cachedAt?: number };
      if (parsed && parsed.cnyPerUnit && parsed.cnyPerUnit.USD) {
        return {
          cnyPerUnit: { ...FALLBACK_CNY_PER_UNIT, ...parsed.cnyPerUnit },
          updatedAt: parsed.updatedAt || '缓存汇率',
          isLive: Boolean(parsed.isLive),
          source: parsed.source || 'Local Cache',
        };
      }
    }
  } catch {
    // Ignore storage errors
  }

  return {
    cnyPerUnit: { ...FALLBACK_CNY_PER_UNIT },
    updatedAt: '内置基准汇率',
    isLive: false,
    source: 'Built-in Fallback',
  };
}

async function fetchWithTimeout(url: string, timeoutMs = 4500): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function syncLiveExchangeRates(force = false): Promise<ExchangeRateState> {
  if (!force) {
    try {
      const raw = localStorage.getItem(FX_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ExchangeRateState & { cachedAt?: number };
        if (parsed?.cachedAt && Date.now() - parsed.cachedAt < CACHE_TTL_MS && parsed.isLive) {
          return {
            cnyPerUnit: { ...FALLBACK_CNY_PER_UNIT, ...parsed.cnyPerUnit },
            updatedAt: parsed.updatedAt,
            isLive: true,
            source: parsed.source,
          };
        }
      }
    } catch {
      // Continue to network fetch
    }
  }

  // Primary public CORS-friendly FX endpoint (base CNY -> units per 1 CNY)
  const endpoints = [
    {
      name: 'ExchangeRate-API',
      url: 'https://open.er-api.com/v6/latest/CNY',
      extract: (json: Record<string, unknown>) => json.rates as Record<string, number> | undefined,
    },
    {
      name: 'Frankfurter ECB',
      url: 'https://api.frankfurter.dev/v1/latest?base=CNY',
      extract: (json: Record<string, unknown>) => json.rates as Record<string, number> | undefined,
    },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetchWithTimeout(ep.url, 4500);
      if (!res.ok) continue;
      const json = (await res.json()) as Record<string, unknown>;
      const ratesPerCny = ep.extract(json);
      if (!ratesPerCny || !ratesPerCny.USD) continue;

      const cnyPerUnit: Record<CurrencyCode, number> = { ...FALLBACK_CNY_PER_UNIT, CNY: 1 };
      (['USD', 'EUR', 'HKD', 'GBP', 'JPY'] as CurrencyCode[]).forEach((code) => {
        const unitPerCny = ratesPerCny[code];
        if (typeof unitPerCny === 'number' && unitPerCny > 0) {
          cnyPerUnit[code] = +(1 / unitPerCny).toFixed(4);
        }
      });

      const now = new Date();
      const updatedAt = `${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes()
      ).padStart(2, '0')} 实时同步`;

      const nextState: ExchangeRateState = {
        cnyPerUnit,
        updatedAt,
        isLive: true,
        source: ep.name,
      };

      try {
        localStorage.setItem(
          FX_CACHE_KEY,
          JSON.stringify({ ...nextState, cachedAt: Date.now() })
        );
      } catch {
        // Ignore quota errors
      }
      return nextState;
    } catch {
      // Try next endpoint
    }
  }

  return getInitialExchangeRates();
}

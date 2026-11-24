import type { KomariClient, LiveNodeTelemetry } from '../types/komari';

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  const val = bytes / Math.pow(k, i);
  return `${val.toFixed(i <= 1 ? 0 : decimals)} ${sizes[i]}`;
}

export function formatBytesCompactGB(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0G';
  const gb = bytes / (1024 ** 3);
  if (gb >= 1024) {
    return `${(gb / 1024).toFixed(2)}T`;
  }
  if (gb >= 100) {
    return `${Math.round(gb)}G`;
  }
  if (gb >= 10) {
    return `${gb.toFixed(1)}G`;
  }
  return `${gb.toFixed(2)}G`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '0 KB/s';
  const mbps = (bytesPerSec * 8) / 1_000_000;
  if (mbps >= 1000) {
    return `${(mbps / 1000).toFixed(2)} Gbps`;
  }
  if (mbps >= 1) {
    return `${mbps.toFixed(1)} Mbps`;
  }
  const kbps = bytesPerSec / 1024;
  return `${Math.max(1, Math.round(kbps))} KB/s`;
}

export function bytesPerSecToMbps(bytesPerSec: number): number {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return 0;
  return +((bytesPerSec * 8) / 1_000_000).toFixed(2);
}

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '刚启动';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}天 ${hours}时`;
  if (hours > 0) return `${hours}时 ${mins}分`;
  return `${Math.max(1, mins)}分钟`;
}

export function computeTrafficUsage(
  client: KomariClient,
  live?: LiveNodeTelemetry
): { usedBytes: number; limitBytes: number; pct: number; modeLabel: string } {
  const up = live?.netTotalUp ?? 0;
  const down = live?.netTotalDown ?? 0;
  const type = (client.traffic_limit_type || 'sum').toLowerCase();

  let usedBytes = up + down;
  let modeLabel = '双向总计';
  if (type === 'max') {
    usedBytes = Math.max(up, down);
    modeLabel = '单向取大';
  } else if (type === 'min') {
    usedBytes = Math.min(up, down);
    modeLabel = '单向取小';
  } else if (type === 'up') {
    usedBytes = up;
    modeLabel = '仅计上行';
  } else if (type === 'down') {
    usedBytes = down;
    modeLabel = '仅计下行';
  }

  const limitBytes = client.traffic_limit > 0 ? client.traffic_limit : 0;
  const pct = limitBytes > 0 ? Math.min(100, (usedBytes / limitBytes) * 100) : 0;
  return { usedBytes, limitBytes, pct, modeLabel };
}

const REGION_NAMES: Record<string, string> = {
  HK: '中国香港',
  TW: '中国台湾',
  MO: '中国澳门',
  CN: '中国内地',
  JP: '日本',
  SG: '新加坡',
  KR: '韩国',
  US: '美国',
  DE: '德国',
  GB: '英国',
  UK: '英国',
  NL: '荷兰',
  FR: '法国',
  CA: '加拿大',
  AU: '澳大利亚',
  RU: '俄罗斯',
  MY: '马来西亚',
  TH: '泰国',
  IN: '印度',
};

export function normalizeRegionCode(region?: string): string {
  if (!region) return 'UN';
  const trimmed = region.trim();
  // Convert flag emoji (regional indicator symbols) to 2-letter ISO code if needed
  const codePoints = Array.from(trimmed).map((c) => c.codePointAt(0) || 0);
  if (
    codePoints.length === 2 &&
    codePoints[0] >= 0x1f1e6 &&
    codePoints[0] <= 0x1f1ff &&
    codePoints[1] >= 0x1f1e6 &&
    codePoints[1] <= 0x1f1ff
  ) {
    return (
      String.fromCharCode(codePoints[0] - 0x1f1e6 + 65) +
      String.fromCharCode(codePoints[1] - 0x1f1e6 + 65)
    );
  }
  return trimmed.slice(0, 4).toUpperCase();
}

export function getRegionDisplayName(region?: string): string {
  const code = normalizeRegionCode(region);
  return REGION_NAMES[code] ? `${code} ${REGION_NAMES[code]}` : code;
}

export function getFillClass(pct: number): string {
  if (pct >= 85) return 'fill-danger';
  if (pct >= 65) return 'fill-warn';
  return 'fill-normal';
}

export function getLatencyColor(ms: number | null, lossPct: number | null): string {
  if (ms === null && lossPct === null) return 'var(--text-muted)';
  if ((lossPct !== null && lossPct >= 3) || (ms !== null && ms >= 190)) {
    return 'var(--accent-coral)';
  }
  if ((lossPct !== null && lossPct >= 0.5) || (ms !== null && ms >= 115)) {
    return 'var(--accent-amber)';
  }
  return 'var(--accent-emerald)';
}

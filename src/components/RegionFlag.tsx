import React, { memo, useState } from 'react';
import { normalizeRegionCode } from '../utils/format';

const ISO_ALIAS: Record<string, string> = {
  UK: 'gb',
  EN: 'gb',
  EL: 'gr',
};

function resolveFlagIso(region?: string): { code: string; isoLower: string | null } {
  const code = normalizeRegionCode(region);
  if (ISO_ALIAS[code]) {
    return { code, isoLower: ISO_ALIAS[code] };
  }
  if (/^[A-Z]{2}$/.test(code) && code !== 'UN' && code !== 'XX') {
    return { code, isoLower: code.toLowerCase() };
  }
  return { code, isoLower: null };
}

interface RegionFlagProps {
  region?: string;
  variant?: 'hero' | 'inline';
}

export const RegionFlag: React.FC<RegionFlagProps> = memo(({ region, variant = 'inline' }) => {
  const { code, isoLower } = resolveFlagIso(region);
  const [failedCode, setFailedCode] = useState<string | null>(null);
  const showImg = isoLower !== null && failedCode !== isoLower;

  if (variant === 'hero') {
    return (
      <div className="hero-flag-box" title={code}>
        {showImg ? (
          <img
            src={`/flags/${isoLower}.svg`}
            alt={code}
            className="hero-flag-img"
            loading="eager"
            decoding="async"
            onError={() => setFailedCode(isoLower)}
          />
        ) : (
          <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
            {code}
          </span>
        )}
      </div>
    );
  }

  if (!showImg) {
    return null;
  }

  return (
    <img
      src={`/flags/${isoLower}.svg`}
      alt={code}
      className="inline-flag-img"
      loading="lazy"
      decoding="async"
      onError={() => setFailedCode(isoLower)}
    />
  );
});
RegionFlag.displayName = 'RegionFlag';

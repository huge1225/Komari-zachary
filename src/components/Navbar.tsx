import React, { useEffect, useRef, useState } from 'react';
import type { AppearanceMode, CurrencyCode, ExchangeRateState } from '../types/komari';
import { CURRENCY_META } from '../utils/billing';

interface NavbarProps {
  sitename: string;
  isDemo: boolean;
  onlineCount: number;
  totalCount: number;
  currency: CurrencyCode;
  onCurrencyChange: (c: CurrencyCode) => void;
  fxState: ExchangeRateState;
  onRefreshFx: () => void;
  fxRefreshing: boolean;
  appearanceMode: AppearanceMode;
  resolvedTheme: 'dark' | 'light';
  onCycleAppearance: () => void;
  onGoHome: () => void;
}

const PRIMARY_CURRENCIES: CurrencyCode[] = ['CNY', 'USD', 'EUR', 'HKD'];
const EXTRA_CURRENCIES: CurrencyCode[] = ['JPY', 'GBP'];

export const Navbar: React.FC<NavbarProps> = ({
  sitename,
  isDemo,
  onlineCount,
  totalCount,
  currency,
  onCurrencyChange,
  fxState,
  onRefreshFx,
  fxRefreshing,
  appearanceMode,
  resolvedTheme,
  onCycleAppearance,
  onGoHome,
}) => {
  const [fxOpen, setFxOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setFxOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const appearanceLabel =
    appearanceMode === 'system'
      ? `◐ 自动(${resolvedTheme === 'dark' ? '深' : '浅'})`
      : appearanceMode === 'dark'
      ? '☾ 深空'
      : '✦ 冰晶';

  return (
    <header className="km-navbar">
      <div className="km-container navbar-inner">
        <div className="brand-group" onClick={onGoHome} role="button" tabIndex={0}>
          <div className="brand-orb mono">KM</div>
          <div style={{ minWidth: 0 }}>
            <div className="brand-title">
              <span className="brand-title-text">{sitename}</span>
              {isDemo && (
                <span
                  className="mono"
                  style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: '999px',
                    background: 'var(--accent-pill-bg)',
                    color: 'var(--accent-pill-text)',
                    border: '1px solid var(--glass-border-hover)',
                    flexShrink: 0,
                  }}
                >
                  DEMO
                </span>
              )}
            </div>
            <div className="brand-sub mono">
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: 'var(--accent-emerald)',
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
              <span>
                {onlineCount}/{totalCount} 在线
              </span>
            </div>
          </div>
        </div>

        <div className="navbar-controls">
          <div className="fx-wrapper" ref={popRef}>
            <div className="glass-segmented mono" aria-label="币种切换">
              {PRIMARY_CURRENCIES.map((code) => (
                <button
                  key={code}
                  type="button"
                  id={`currency-btn-${code.toLowerCase()}`}
                  className={`seg-btn ${currency === code ? 'active' : ''}`}
                  onClick={() => onCurrencyChange(code)}
                >
                  {CURRENCY_META[code].symbol} {code}
                </button>
              ))}
              {EXTRA_CURRENCIES.includes(currency) && (
                <button type="button" className="seg-btn active">
                  {CURRENCY_META[currency].symbol} {currency}
                </button>
              )}
            </div>

            <button
              type="button"
              id="btn-fx-rates-popover"
              className="glass-icon-btn mono"
              onClick={() => setFxOpen((v) => !v)}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: fxState.isLive ? 'var(--accent-emerald)' : 'var(--accent-amber)',
                }}
              />
              <span>汇率</span>
            </button>

            {fxOpen && (
              <div className="fx-popover">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>汇率 (基准 CNY)</span>
                  <button
                    type="button"
                    className="mono"
                    onClick={onRefreshFx}
                    style={{
                      border: '1px solid var(--glass-border-hover)',
                      background: 'var(--accent-pill-bg)',
                      color: 'var(--accent-pill-text)',
                      borderRadius: 6,
                      padding: '2px 8px',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {fxRefreshing ? '...' : '↻ 刷新'}
                  </button>
                </div>

                <div style={{ display: 'grid', gap: 5, marginBottom: 10 }} className="mono">
                  {(['USD', 'EUR', 'HKD', 'GBP', 'JPY'] as CurrencyCode[]).map((c) => (
                    <div
                      key={c}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '4px 6px',
                        borderRadius: 6,
                        background: 'var(--glass-well-bg)',
                      }}
                    >
                      <span>1 {c}</span>
                      <span>= ¥{fxState.cnyPerUnit[c].toFixed(c === 'JPY' ? 4 : 2)}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  {EXTRA_CURRENCIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        onCurrencyChange(c);
                        setFxOpen(false);
                      }}
                      className={`seg-btn mono ${currency === c ? 'active' : ''}`}
                      style={{
                        flex: 1,
                        border: '1px solid var(--glass-border)',
                      }}
                    >
                      {CURRENCY_META[c].symbol} {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            id="btn-cycle-appearance"
            className={`glass-icon-btn ${appearanceMode === 'system' ? 'active-toggle' : ''}`}
            onClick={onCycleAppearance}
          >
            <span>{appearanceLabel}</span>
          </button>
        </div>
      </div>
    </header>
  );
};

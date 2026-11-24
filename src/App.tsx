import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FleetSummary } from './components/FleetSummary';
import { Navbar } from './components/Navbar';
import { NodeCard } from './components/NodeCard';
import { NodeDetailView } from './components/NodeDetailView';
import {
  getInitialExchangeRates,
  syncLiveExchangeRates,
} from './services/exchangeRate';
import {
  bootstrapKomariData,
  fetchNodePingHistory,
  fetchTaskPingRecords,
  mapWithConcurrency,
  subscribeLiveTelemetry,
} from './services/komariApi';
import type {
  AppearanceMode,
  ComputedBilling,
  CurrencyCode,
  ExchangeRateState,
  KomariClient,
  KomariPingBasicInfo,
  KomariPingRecord,
  KomariPingTask,
  LiveNodeTelemetry,
  NodeCarrierTrio,
  PublicSiteInfo,
} from './types/komari';
import { computeNodeBilling, parseCurrencyCode } from './utils/billing';
import { buildNodeCarrierMetrics, parseTaskIdsConfig } from './utils/carrierMatch';
import { normalizeRegionCode } from './utils/format';

type SortOption =
  | 'weight'
  | 'residual_desc'
  | 'monthly_desc'
  | 'ct_asc'
  | 'cu_asc'
  | 'cm_asc'
  | 'cpu_desc';

function parseRouteUuid(pathname: string): string | null {
  const match = pathname.match(/^\/(?:instance|node)\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function isVideoMedia(url: string): boolean {
  return /\.(mp4|webm|ogg)(\?.*)?$/i.test(url);
}

declare const __APP_VERSION__: string;

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function App() {
  const [isDemo, setIsDemo] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [siteInfo, setSiteInfo] = useState<PublicSiteInfo>({
    sitename: 'Komari Monitor',
    description: 'A simple server monitor tool.',
    themeSettings: {},
  });
  const [clients, setClients] = useState<KomariClient[]>([]);
  const [pingTasks, setPingTasks] = useState<KomariPingTask[]>([]);
  const [liveMap, setLiveMap] = useState<Record<string, LiveNodeTelemetry>>({});
  const [carrierMap, setCarrierMap] = useState<Record<string, NodeCarrierTrio>>({});
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [activeNodeUuid, setActiveNodeUuid] = useState<string | null>(() =>
    parseRouteUuid(window.location.pathname)
  );

  const [regionFilter, setRegionFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortOption>('weight');

  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>(() => {
    const saved = localStorage.getItem('appearance');
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    return 'system';
  });
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() =>
    getSystemPrefersDark()
  );

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme: 'dark' | 'light' =
    appearanceMode === 'system'
      ? systemPrefersDark
        ? 'dark'
        : 'light'
      : appearanceMode;

  const [currency, setCurrency] = useState<CurrencyCode>(() => {
    const saved = localStorage.getItem('km_zachary_currency');
    return saved ? parseCurrencyCode(saved) : 'CNY';
  });
  const [fxState, setFxState] = useState<ExchangeRateState>(() =>
    getInitialExchangeRates()
  );
  const [fxRefreshing, setFxRefreshing] = useState(false);

  // Pause optional custom background video when tab is hidden
  useEffect(() => {
    const onVis = () => {
      const vid = videoRef.current;
      if (!vid) return;
      if (document.visibilityState === 'hidden') vid.pause();
      else void vid.play().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setActiveNodeUuid(parseRouteUuid(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateToNode = useCallback((uuid: string | null) => {
    setActiveNodeUuid(uuid);
    const targetPath = uuid ? `/instance/${encodeURIComponent(uuid)}` : '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    let mounted = true;
    bootstrapKomariData().then((res) => {
      if (!mounted) return;
      setIsDemo(res.isDemo);
      setSiteInfo(res.siteInfo);
      setClients(res.clients);
      setPingTasks(res.pingTasks);

      const ts = res.siteInfo.themeSettings;
      if (!localStorage.getItem('km_zachary_currency') && ts.default_currency) {
        setCurrency(parseCurrencyCode(ts.default_currency));
      }
      if (!localStorage.getItem('appearance') && ts.default_appearance) {
        if (
          ts.default_appearance === 'light' ||
          ts.default_appearance === 'dark' ||
          ts.default_appearance === 'system'
        ) {
          setAppearanceMode(ts.default_appearance);
        }
      }
      setBootstrapped(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Sync CSS glass tokens on <html>
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', resolvedTheme);

    const blurPx = Number(siteInfo.themeSettings.glass_blur);
    if (Number.isFinite(blurPx) && blurPx >= 0 && blurPx <= 40) {
      root.style.setProperty('--glass-blur', `${blurPx}px`);
    } else {
      root.style.setProperty('--glass-blur', '14px');
    }

    const opacityPct = Number(siteInfo.themeSettings.glass_opacity);
    if (Number.isFinite(opacityPct) && opacityPct >= 25 && opacityPct <= 98) {
      root.style.setProperty('--glass-alpha', (opacityPct / 100).toFixed(2));
    } else {
      root.style.setProperty('--glass-alpha', '0.76');
    }
  }, [resolvedTheme, siteInfo.themeSettings]);

  // Live telemetry subscription
  useEffect(() => {
    if (!bootstrapped) return;
    return subscribeLiveTelemetry(isDemo, (nextMap) => {
      setLiveMap((prev) => ({ ...prev, ...nextMap }));
    });
  }, [bootstrapped, isDemo]);

  // Optimized Batch Three-Carrier Ping Loading for Main Dashboard
  useEffect(() => {
    if (!bootstrapped || clients.length === 0) return;
    let cancelled = false;
    const ts = siteInfo.themeSettings;
    const windowHours = Number(ts.ping_window_hours) || 3;

    const loadAllCarriers = async () => {
      if (document.visibilityState === 'hidden') return;

      const ctIds = parseTaskIdsConfig(ts.ct_ping_tasks);
      const cuIds = parseTaskIdsConfig(ts.cu_ping_tasks);
      const cmIds = parseTaskIdsConfig(ts.cm_ping_tasks);

      // Fast Path: If all 3 carriers have explicit task IDs in production, fetch by task_id (only ~3 HTTP calls for the whole fleet!)
      if (!isDemo && ctIds.length > 0 && cuIds.length > 0 && cmIds.length > 0) {
        const uniqueTaskIds = Array.from(new Set([...ctIds, ...cuIds, ...cmIds]));
        const batchResults = await mapWithConcurrency(uniqueTaskIds, 3, (tid) =>
          fetchTaskPingRecords(tid, windowHours)
        );
        if (cancelled) return;

        const allRecords: KomariPingRecord[] = [];
        const allBasicInfos: KomariPingBasicInfo[] = [];
        for (const r of batchResults) {
          allRecords.push(...r.records);
          allBasicInfos.push(...r.basicInfos);
        }

        const next: Record<string, NodeCarrierTrio> = {};
        for (const c of clients) {
          next[c.uuid] = buildNodeCarrierMetrics(
            c.uuid,
            pingTasks,
            allRecords,
            allBasicInfos,
            ts
          );
        }
        setCarrierMap(next);
        return;
      }

      // Bounded Concurrency Fallback (max 4 concurrent requests instead of N simultaneous requests)
      const entries = await mapWithConcurrency(clients, 4, async (c) => {
        const hist = await fetchNodePingHistory(c.uuid, windowHours, isDemo);
        const mergedTasks = [...pingTasks];
        for (const t of hist.tasks) {
          if (!mergedTasks.some((m) => m.id === t.id)) mergedTasks.push(t);
        }
        const trio = buildNodeCarrierMetrics(
          c.uuid,
          mergedTasks,
          hist.records,
          hist.basicInfos,
          ts
        );
        return [c.uuid, trio] as const;
      });

      if (cancelled) return;
      const next: Record<string, NodeCarrierTrio> = {};
      for (const [id, trio] of entries) {
        next[id] = trio;
      }
      setCarrierMap(next);
    };

    void loadAllCarriers();
    const timer = window.setInterval(loadAllCarriers, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [bootstrapped, clients, pingTasks, isDemo, siteInfo.themeSettings]);

  // Sync live exchange rates
  useEffect(() => {
    if (!bootstrapped) return;
    if (siteInfo.themeSettings.enable_live_exchange === false) return;
    syncLiveExchangeRates(false).then(setFxState);
  }, [bootstrapped, siteInfo.themeSettings.enable_live_exchange]);

  const handleRefreshFx = useCallback(async () => {
    setFxRefreshing(true);
    const updated = await syncLiveExchangeRates(true);
    setFxState(updated);
    setFxRefreshing(false);
  }, []);

  const handleCurrencyChange = useCallback((next: CurrencyCode) => {
    setCurrency(next);
    try {
      localStorage.setItem('km_zachary_currency', next);
    } catch {
      // Ignore storage error
    }
  }, []);

  const handleCycleAppearance = useCallback(() => {
    setAppearanceMode((prev) => {
      const next: AppearanceMode =
        prev === 'system' ? 'dark' : prev === 'dark' ? 'light' : 'system';
      try {
        localStorage.setItem('appearance', next);
      } catch {
        // Ignore storage error
      }
      return next;
    });
  }, []);

  // Precompute billing for all nodes once per currency/FX update (never recomputed on WS ticks!)
  const billingMap = useMemo(() => {
    const map: Record<string, ComputedBilling> = {};
    for (const c of clients) {
      map[c.uuid] = computeNodeBilling(c, currency, fxState);
    }
    return map;
  }, [clients, currency, fxState]);

  const regionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of clients) {
      const code = normalizeRegionCode(c.region);
      counts.set(code, (counts.get(code) || 0) + 1);
    }
    return Array.from(counts.entries());
  }, [clients]);

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = clients.filter((c) => {
      if (regionFilter !== 'ALL' && normalizeRegionCode(c.region) !== regionFilter) {
        return false;
      }
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.region || '').toLowerCase().includes(q) ||
        (c.os || '').toLowerCase().includes(q) ||
        (c.group || '').toLowerCase().includes(q) ||
        (c.tags || '').toLowerCase().includes(q)
      );
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortBy === 'residual_desc') {
        return (
          (billingMap[b.uuid]?.residualInTarget ?? 0) -
          (billingMap[a.uuid]?.residualInTarget ?? 0)
        );
      }
      if (sortBy === 'monthly_desc') {
        return (
          (billingMap[b.uuid]?.monthlyInTarget ?? 0) -
          (billingMap[a.uuid]?.monthlyInTarget ?? 0)
        );
      }
      if (sortBy === 'ct_asc') {
        return (
          (carrierMap[a.uuid]?.ct.latestMs ?? 99999) -
          (carrierMap[b.uuid]?.ct.latestMs ?? 99999)
        );
      }
      if (sortBy === 'cu_asc') {
        return (
          (carrierMap[a.uuid]?.cu.latestMs ?? 99999) -
          (carrierMap[b.uuid]?.cu.latestMs ?? 99999)
        );
      }
      if (sortBy === 'cm_asc') {
        return (
          (carrierMap[a.uuid]?.cm.latestMs ?? 99999) -
          (carrierMap[b.uuid]?.cm.latestMs ?? 99999)
        );
      }
      if (sortBy === 'cpu_desc') {
        return (liveMap[b.uuid]?.cpuUsage ?? 0) - (liveMap[a.uuid]?.cpuUsage ?? 0);
      }
      return (a.weight ?? 0) - (b.weight ?? 0);
    });

    return sorted;
  }, [clients, regionFilter, searchQuery, sortBy, billingMap, carrierMap, liveMap]);

  const onlineCount = useMemo(
    () => clients.filter((c) => liveMap[c.uuid]?.online).length,
    [clients, liveMap]
  );

  const selectedClient = useMemo(
    () =>
      activeNodeUuid ? clients.find((c) => c.uuid === activeNodeUuid) || null : null,
    [activeNodeUuid, clients]
  );

  const customBg = (siteInfo.themeSettings.background_url || '').trim();
  const defaultDetailHours =
    Number(siteInfo.themeSettings.default_detail_hours) || 3;

  const handleSelectNode = useCallback(
    (uuid: string) => navigateToNode(uuid),
    [navigateToNode]
  );
  const handleGoHome = useCallback(() => navigateToNode(null), [navigateToNode]);

  return (
    <>
      {/* Minimalist Static Ambient Canvas (Mounts custom media ONLY when configured) */}
      <div className="ambient-backdrop" aria-hidden="true">
        {customBg &&
          (isVideoMedia(customBg) ? (
            <video
              ref={videoRef}
              className="ambient-backdrop-media"
              src={customBg}
              autoPlay
              loop
              muted
              playsInline
            />
          ) : (
            <img className="ambient-backdrop-media" src={customBg} alt="" />
          ))}
      </div>

      <div className="km-layout">
        <Navbar
          sitename={siteInfo.sitename}
          isDemo={isDemo}
          onlineCount={onlineCount}
          totalCount={clients.length}
          currency={currency}
          onCurrencyChange={handleCurrencyChange}
          fxState={fxState}
          onRefreshFx={handleRefreshFx}
          fxRefreshing={fxRefreshing}
          appearanceMode={appearanceMode}
          resolvedTheme={resolvedTheme}
          onCycleAppearance={handleCycleAppearance}
          onGoHome={handleGoHome}
        />

        <main className="km-main">
          <div className="km-container">
            {selectedClient ? (
              <NodeDetailView
                client={selectedClient}
                allClients={clients}
                live={liveMap[selectedClient.uuid]}
                globalPingTasks={pingTasks}
                themeSettings={siteInfo.themeSettings}
                currency={currency}
                fxState={fxState}
                isDemo={isDemo}
                defaultHours={defaultDetailHours}
                onBack={handleGoHome}
                onSwitchNode={handleSelectNode}
              />
            ) : (
              <div className="km-page-home">
                <FleetSummary
                  clients={clients}
                  liveMap={liveMap}
                  carrierMap={carrierMap}
                  billingMap={billingMap}
                  currency={currency}
                  showBilling={siteInfo.themeSettings.show_fleet_billing !== false}
                />

                <div className="toolbar-row">
                  <div className="region-pills mono">
                    <button
                      type="button"
                      id="region-filter-all"
                      className={`region-pill ${regionFilter === 'ALL' ? 'active' : ''}`}
                      onClick={() => setRegionFilter('ALL')}
                    >
                      全部 [{clients.length}]
                    </button>
                    {regionCounts.map(([code, count]) => (
                      <button
                        key={code}
                        type="button"
                        id={`region-filter-${code.toLowerCase()}`}
                        className={`region-pill ${regionFilter === code ? 'active' : ''}`}
                        onClick={() => setRegionFilter(code)}
                      >
                        {code} [{count}]
                      </button>
                    ))}
                  </div>

                  <div className="toolbar-right">
                    <input
                      type="search"
                      id="input-node-search"
                      className="glass-input"
                      placeholder="搜索节点..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <select
                      id="select-node-sort"
                      className="glass-select mono"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortOption)}
                      aria-label="排序"
                    >
                      <option value="weight">默认排序</option>
                      <option value="residual_desc">剩余价值 ↓</option>
                      <option value="monthly_desc">每月费用 ↓</option>
                      <option value="ct_asc">电信延迟 ↑</option>
                      <option value="cu_asc">联通延迟 ↑</option>
                      <option value="cm_asc">移动延迟 ↑</option>
                      <option value="cpu_desc">CPU 负载 ↓</option>
                    </select>
                  </div>
                </div>

                {filteredClients.length === 0 ? (
                  <div
                    className="glass-panel mono"
                    style={{
                      padding: '48px 24px',
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {bootstrapped ? '无匹配节点' : '加载中...'}
                  </div>
                ) : (
                  <div className="nodes-grid km-node-display">
                    {filteredClients.map((client) => (
                      <NodeCard
                        key={client.uuid}
                        client={client}
                        live={liveMap[client.uuid]}
                        carriers={carrierMap[client.uuid]}
                        billing={billingMap[client.uuid]}
                        currency={currency}
                        onSelect={handleSelectNode}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        <footer className="km-footer">
          <div className="km-container footer-inner mono">
            <span>Powered by Komari Monitor.</span>
            <span>AeroGlass v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.1.0'}</span>
          </div>
        </footer>
      </div>
    </>
  );
}

export default App;

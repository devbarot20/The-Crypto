import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts'
import './styles.css'

const RAW_API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000'
const API_BASE = RAW_API_BASE.replace(/\/+$/, '')

async function api(path, options) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      ...options,
    })
  } catch {
    throw new Error('Can’t reach the backend API. Please make sure the backend server is running and accessible.')
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || 'Something went wrong. Please try again.')
  return data
}

function Icon({ name, size = 18 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    user: <><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.7-3.1 3.1-5 7-5s6.3 1.9 7 5"/></>,
    chart: <><path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 6-7"/><path d="M16 6h4v4"/></>,
    portfolio: <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M12 12v.01"/></>,
    arrow: <><path d="M7 17 17 7"/><path d="M7 7h10v10"/></>,
    shield: <><path d="M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    refresh: <><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 17 5l3 2M4 17l3 2a7 7 0 0 0 11.4-4"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></>,
    moon: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    copy: <><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></>,
    check: <polyline points="20 6 9 17 4 12"/>,
    close: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  }
  return <svg {...common}>{paths[name] || null}</svg>
}

function Brand({ compact = false }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`}>
      <div className="brand-mark"><span/><span/><span/></div>
      {!compact && (
        <div className="brand-copy">
          <strong>KITE<span>DESK</span></strong>
          <small>CONNECT PORTAL</small>
        </div>
      )}
    </div>
  )
}

function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === 'dark'
  return (
    <button className="theme-toggle" onClick={onToggle} title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}>
      <Icon name={isDark ? 'sun' : 'moon'} size={15}/>
      <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
    </button>
  )
}

/* ==========================================================================
   FEATURE 3: Interactive Candlestick + SMA Chart Modal
   ========================================================================== */
function StockChartModal({ stock, shortSma = 6, longSma = 30, theme, onClose }) {
  const containerRef = useRef(null)
  const [range, setRange] = useState('6mo')
  const [chartData, setChartData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hoveredData, setHoveredData] = useState(null)

  const isDark = theme === 'dark'

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    api(`/api/chart/${stock.ticker}?short_sma=${shortSma}&long_sma=${longSma}&range=${range}`)
      .then(data => {
        if (active) {
          setChartData(data)
          setLoading(false)
        }
      })
      .catch(err => {
        if (active) {
          setError(err.message)
          setLoading(false)
        }
      })
    return () => { active = false }
  }, [stock.ticker, shortSma, longSma, range])

  useEffect(() => {
    if (!chartData || !containerRef.current) return

    const container = containerRef.current
    container.innerHTML = ''

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 380,
      layout: {
        background: { color: 'transparent' },
        textColor: isDark ? '#94a3b8' : '#475569',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: isDark ? '#1e293b' : '#e2e8f0' },
        horzLines: { color: isDark ? '#1e293b' : '#e2e8f0' },
      },
      crosshair: {
        mode: 1,
      },
      timeScale: {
        borderColor: isDark ? '#334155' : '#cbd5e1',
        timeVisible: false,
      },
      rightPriceScale: {
        borderColor: isDark ? '#334155' : '#cbd5e1',
      },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    })
    candleSeries.setData(chartData.candles)

    const shortSmaLine = chart.addSeries(LineSeries, {
      color: '#06b6d4',
      lineWidth: 2,
      title: `SMA ${shortSma}`,
    })
    shortSmaLine.setData(chartData.sma_short)

    const longSmaLine = chart.addSeries(LineSeries, {
      color: '#a855f7',
      lineWidth: 2,
      title: `SMA ${longSma}`,
    })
    longSmaLine.setData(chartData.sma_long)

    chart.subscribeCrosshairMove(param => {
      if (param.time) {
        const cData = param.seriesData.get(candleSeries)
        const sData = param.seriesData.get(shortSmaLine)
        const lData = param.seriesData.get(longSmaLine)
        setHoveredData({
          time: param.time,
          open: cData?.open,
          high: cData?.high,
          low: cData?.low,
          close: cData?.close,
          shortSma: sData?.value,
          longSma: lData?.value,
        })
      } else {
        setHoveredData(null)
      }
    })

    chart.timeScale().fitContent()

    const handleResize = () => {
      chart.applyOptions({ width: container.clientWidth })
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [chartData, isDark, shortSma, longSma])

  const priceColor = (chartData?.change ?? 0) >= 0 ? 'text-positive' : 'text-negative'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="chart-modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <div>
              <div className="section-kicker">NSE · CANDLESTICK CHART</div>
              <h2>{stock.ticker} <small style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>{stock.company}</small></h2>
            </div>
            {chartData && (
              <div className="modal-price-group">
                <span className="modal-price">₹{chartData.current_price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                <span className={`modal-change ${priceColor}`}>
                  {chartData.change >= 0 ? '+' : ''}{chartData.change} ({chartData.change_pct >= 0 ? '+' : ''}{chartData.change_pct}%)
                </span>
              </div>
            )}
            {stock.crossover_type && (
              <span className={`crossover-badge ${stock.crossover_type.toLowerCase()}`}>
                <i/> {stock.crossover_type} on {stock.crossover_date}
              </span>
            )}
          </div>

          <div className="modal-controls">
            <div className="timeframe-group">
              {['1mo', '3mo', '6mo', '1y'].map(tf => (
                <button
                  key={tf}
                  className={`tf-btn ${range === tf ? 'active' : ''}`}
                  onClick={() => setRange(tf)}
                >
                  {tf.toUpperCase()}
                </button>
              ))}
            </div>
            <button className="modal-close-btn" onClick={onClose} title="Close chart">
              <Icon name="close" size={18}/>
            </button>
          </div>
        </div>

        <div className="chart-legend-bar">
          <div className="legend-item"><span className="legend-dot cyan"/> <b>SMA {shortSma}</b> (Short)</div>
          <div className="legend-item"><span className="legend-dot purple"/> <b>SMA {longSma}</b> (Long)</div>
          {hoveredData ? (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '14px', fontVariantNumeric: 'tabular-nums' }}>
              <span><b>Date:</b> {hoveredData.time}</span>
              <span><b>O:</b> ₹{hoveredData.open}</span>
              <span><b>H:</b> ₹{hoveredData.high}</span>
              <span><b>L:</b> ₹{hoveredData.low}</span>
              <span><b>C:</b> ₹{hoveredData.close}</span>
              {hoveredData.shortSma && <span style={{ color: '#06b6d4' }}><b>SMA{shortSma}:</b> ₹{hoveredData.shortSma}</span>}
              {hoveredData.longSma && <span style={{ color: '#a855f7' }}><b>SMA{longSma}:</b> ₹{hoveredData.longSma}</span>}
            </div>
          ) : (
            <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>Hover over candles to view values</span>
          )}
        </div>

        <div className="chart-container-root">
          {loading && (
            <div className="scan-progress" style={{ margin: '80px auto', width: 'fit-content' }}>
              <span className="spinner spinner-large"/>
              <div><b>Loading Chart for {stock.ticker}…</b><small>Fetching daily candles and calculating moving averages</small></div>
            </div>
          )}
          {error && <div className="alert-error" style={{ margin: '40px' }}><span className="alert-mark">!</span>{error}</div>}
          <div ref={containerRef} style={{ width: '100%', height: '380px' }}/>
        </div>

        <div className="modal-footer">
          <div className="modal-tip">
            <Icon name="shield" size={15}/>
            <span>Golden crossover occurs when SMA {shortSma} crosses above SMA {longSma} (Bullish). Death cross occurs when it crosses below (Bearish).</span>
          </div>
          <a
            href={`https://kite.zerodha.com/chart/ext/ciq/NSE/${encodeURIComponent(stock.ticker)}`}
            target="_blank"
            rel="noreferrer"
            className="trade-btn"
          >
            Open in Kite <Icon name="arrow" size={14}/>
          </a>
        </div>
      </div>
    </div>
  )
}

/* ==========================================================================
   FEATURE 2: Holdings & Portfolio Tracker
   ========================================================================== */
function PortfolioPanel({ signals = [], onSelectStock }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [useDemo, setUseDemo] = useState(false)

  // Realistic sample Indian equity portfolio for demo mode
  const sampleHoldings = useMemo(() => [
    { tradingsymbol: 'RELIANCE', company: 'Reliance Industries Ltd.', quantity: 25, average_price: 1120.0, last_price: 1196.4, pnl: 1910.0, day_pnl: 280.0 },
    { tradingsymbol: 'TCS', company: 'Tata Consultancy Services', quantity: 15, average_price: 4150.0, last_price: 4210.0, pnl: 900.0, day_pnl: -150.0 },
    { tradingsymbol: 'HDFCBANK', company: 'HDFC Bank Ltd.', quantity: 40, average_price: 1680.0, last_price: 1645.5, pnl: -1380.0, day_pnl: -220.0 },
    { tradingsymbol: 'INFY', company: 'Infosys Ltd.', quantity: 30, average_price: 1820.0, last_price: 1890.0, pnl: 2100.0, day_pnl: 450.0 },
    { tradingsymbol: 'ADANIGREEN', company: 'Adani Green Energy Ltd.', quantity: 20, average_price: 1290.0, last_price: 1185.1, pnl: -2098.0, day_pnl: -510.0 },
    { tradingsymbol: 'TATAMOTORS', company: 'Tata Motors Ltd.', quantity: 50, average_price: 860.0, last_price: 895.0, pnl: 1750.0, day_pnl: 180.0 },
  ], [])

  function fetchPortfolio() {
    setLoading(true)
    setError('')
    api('/api/portfolio')
      .then(res => {
        setData(res)
        // Auto-enable demo if real account has 0 holdings
        if (res.holdings?.length === 0) setUseDemo(true)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchPortfolio()
  }, [])

  // Create a map of latest signals for cross-referencing
  const signalMap = useMemo(() => {
    const map = {}
    signals.forEach(s => {
      map[s.ticker] = s
    })
    return map
  }, [signals])

  const activeHoldings = useDemo ? sampleHoldings : (data?.holdings || [])

  const totals = useMemo(() => {
    const investment = activeHoldings.reduce((sum, h) => sum + (h.average_price * h.quantity), 0)
    const current = activeHoldings.reduce((sum, h) => sum + (h.last_price * h.quantity), 0)
    const pnl = current - investment
    const pnlPct = investment > 0 ? (pnl / investment) * 100 : 0
    const dayPnl = activeHoldings.reduce((sum, h) => sum + (h.day_pnl || 0), 0)
    return {
      investment,
      current,
      pnl,
      pnlPct,
      dayPnl,
      margin: data?.summary?.available_margin || 0,
    }
  }, [activeHoldings, data])

  const formatPrice = v => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="section-kicker">PERSONAL WORKSPACE <span className="heading-separator">/</span> PORTFOLIO</div>
          <h1>Holdings & Positions<span className="heading-period">.</span></h1>
          <p>Real-time valuation of your equity holdings cross-referenced with SMA momentum alerts.</p>
        </div>
        <button
          className={`demo-toggle-btn ${useDemo ? 'active' : ''}`}
          onClick={() => setUseDemo(v => !v)}
          title="Toggle between Live Kite Holdings and Sample Portfolio"
        >
          <Icon name="portfolio" size={16}/>
          {useDemo ? 'Viewing Sample Portfolio' : 'Switch to Demo Portfolio'}
        </button>
      </div>

      <div className="portfolio-summary-grid">
        <div className="portfolio-card">
          <span className="label">TOTAL INVESTMENT</span>
          <strong className="value">{formatPrice(totals.investment)}</strong>
          <small className="sub" style={{ color: 'var(--text-muted)' }}>Cost basis across {activeHoldings.length} stocks</small>
        </div>

        <div className="portfolio-card">
          <span className="label">CURRENT VALUE</span>
          <strong className="value">{formatPrice(totals.current)}</strong>
          <small className="sub" style={{ color: 'var(--text-muted)' }}>Market valuation at LTP</small>
        </div>

        <div className="portfolio-card">
          <span className="label">TOTAL P&L</span>
          <strong className={`value ${totals.pnl >= 0 ? 'text-positive' : 'text-negative'}`}>
            {totals.pnl >= 0 ? '+' : ''}{formatPrice(totals.pnl)}
          </strong>
          <small className={`sub ${totals.pnl >= 0 ? 'text-positive' : 'text-negative'}`}>
            {totals.pnl >= 0 ? '+' : ''}{totals.pnlPct.toFixed(2)}% overall return
          </small>
        </div>

        <div className="portfolio-card">
          <span className="label">AVAILABLE MARGIN</span>
          <strong className="value">{formatPrice(totals.margin)}</strong>
          <small className="sub" style={{ color: 'var(--text-muted)' }}>Kite Equity Cash Balance</small>
        </div>
      </div>

      <div className="signals-results">
        <div className="portfolio-toolbar">
          <div>
            <h2>Active Holdings ({activeHoldings.length})</h2>
            <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Stocks with recent Bearish SMA crossovers are highlighted as exit cautions.
            </p>
          </div>
          <button className="action-btn" onClick={fetchPortfolio}>
            <Icon name="refresh" size={14}/> Refresh
          </button>
        </div>

        {error && <div className="alert-error"><span className="alert-mark">!</span>{error}</div>}
        {loading && (
          <div className="scan-progress">
            <span className="spinner spinner-large"/>
            <div><b>Fetching portfolio…</b><small>Loading live holdings and margins from Zerodha</small></div>
          </div>
        )}

        {activeHoldings.length > 0 ? (
          <div className="signals-table-wrap">
            <table className="signals-table">
              <thead>
                <tr>
                  <th>INSTRUMENT</th>
                  <th className="numeric-cell">QTY</th>
                  <th className="numeric-cell">AVG. BUY</th>
                  <th className="numeric-cell">LTP</th>
                  <th className="numeric-cell">CURRENT VAL</th>
                  <th className="numeric-cell">TOTAL P&L</th>
                  <th>SMA MOMENTUM ALERT</th>
                  <th style={{ textAlign: 'center' }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {activeHoldings.map(h => {
                  const symbol = h.tradingsymbol
                  const holdingTotal = h.last_price * h.quantity
                  const pnl = h.pnl ?? (holdingTotal - (h.average_price * h.quantity))
                  const pnlPct = (pnl / (h.average_price * h.quantity)) * 100
                  const signal = signalMap[symbol]

                  return (
                    <tr key={symbol} onClick={() => onSelectStock({ ticker: symbol, company: h.company || symbol, crossover_type: signal?.crossover_type, crossover_date: signal?.crossover_date })}>
                      <td>
                        <strong className="ticker-value">{symbol}</strong>
                        {h.company && <span className="company-value">{h.company}</span>}
                      </td>
                      <td className="numeric-cell" style={{ fontWeight: 600 }}>{h.quantity}</td>
                      <td className="numeric-cell">{formatPrice(h.average_price)}</td>
                      <td className="numeric-cell price-value">{formatPrice(h.last_price)}</td>
                      <td className="numeric-cell" style={{ fontWeight: 700 }}>{formatPrice(holdingTotal)}</td>
                      <td className={`numeric-cell ${pnl >= 0 ? 'text-positive' : 'text-negative'}`} style={{ fontWeight: 700 }}>
                        {pnl >= 0 ? '+' : ''}{formatPrice(pnl)} ({pnl >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
                      </td>
                      <td>
                        {signal ? (
                          signal.crossover_type === 'Bearish' ? (
                            <span className="alert-badge bearish-alert">
                              <Icon name="alert" size={14}/> Bearish Alert ({signal.crossover_date})
                            </span>
                          ) : (
                            <span className="alert-badge bullish-momentum">
                              <Icon name="trendingUp" size={14}/> Bullish ({signal.crossover_date})
                            </span>
                          )
                        ) : (
                          <span className="alert-badge neutral">Holding · No Cross</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button className="chart-btn" onClick={e => {
                          e.stopPropagation()
                          onSelectStock({ ticker: symbol, company: h.company || symbol, crossover_type: signal?.crossover_type, crossover_date: signal?.crossover_date })
                        }}>
                          <Icon name="chart" size={13}/> Chart
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="no-signals">
            <div className="empty-icon"><Icon name="portfolio" size={24}/></div>
            <h3>No Holdings Found in Kite Account</h3>
            <p>You currently have 0 equity delivery shares. Click "Switch to Demo Portfolio" above to test the portfolio tracker with sample holdings.</p>
          </div>
        )}
      </div>
    </>
  )
}

/* ==========================================================================
   FEATURE 1: Signal Filters, Search, Sort & Export
   ========================================================================== */
function SignalsPanel({ onUnauthorized, onSelectStock }) {
  const [form, setForm] = useState({ short_sma: 6, long_sma: 30, lookback_days: 30, max_stocks: 100 })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Feature 1 Filters & Search
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all') // 'all' | 'bullish' | 'bearish' | 'fresh'
  const [sortBy, setSortBy] = useState('date_desc')
  const [copied, setCopied] = useState(false)

  function change(key, value) {
    setForm(current => ({ ...current, [key]: value === '' ? '' : Number(value) }))
  }

  async function generate(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const data = await api('/api/signals', { method: 'POST', body: JSON.stringify(form) })
      setResult(data)
    } catch (err) {
      setError(err.message)
      if (err.message.includes('session') || err.message.includes('log in')) onUnauthorized()
    } finally {
      setLoading(false)
    }
  }

  const latestTime = result?.summary?.generated_at ? new Date(result.summary.generated_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) : ''
  const dateLabel = value => new Date(`${value}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
  const priceLabel = value => `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  // Filter & Search Logic
  const filteredSignals = useMemo(() => {
    if (!result?.signals) return []
    let list = [...result.signals]

    // Search query
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(s => s.ticker.toLowerCase().includes(q) || s.company.toLowerCase().includes(q))
    }

    // Type filter
    if (filterType === 'bullish') {
      list = list.filter(s => s.crossover_type === 'Bullish')
    } else if (filterType === 'bearish') {
      list = list.filter(s => s.crossover_type === 'Bearish')
    } else if (filterType === 'fresh') {
      // Last 3 calendar/trading days
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 4)
      list = list.filter(s => new Date(s.crossover_date) >= cutoff)
    }

    // Sort
    if (sortBy === 'date_desc') {
      list.sort((a, b) => new Date(b.crossover_date) - new Date(a.crossover_date))
    } else if (sortBy === 'date_asc') {
      list.sort((a, b) => new Date(a.crossover_date) - new Date(b.crossover_date))
    } else if (sortBy === 'price_desc') {
      list.sort((a, b) => b.close - a.close)
    } else if (sortBy === 'price_asc') {
      list.sort((a, b) => a.close - b.close)
    } else if (sortBy === 'ticker_asc') {
      list.sort((a, b) => a.ticker.localeCompare(b.ticker))
    }

    return list
  }, [result?.signals, search, filterType, sortBy])

  // Counts for pills
  const counts = useMemo(() => {
    if (!result?.signals) return { all: 0, bullish: 0, bearish: 0, fresh: 0 }
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 4)
    return {
      all: result.signals.length,
      bullish: result.signals.filter(s => s.crossover_type === 'Bullish').length,
      bearish: result.signals.filter(s => s.crossover_type === 'Bearish').length,
      fresh: result.signals.filter(s => new Date(s.crossover_date) >= cutoff).length,
    }
  }, [result?.signals])

  // Export CSV
  function exportCsv() {
    if (!filteredSignals.length) return
    const headers = ['Rank', 'Ticker', 'Company', 'Crossover Type', 'Crossover Date', 'Close Price', `SMA ${form.short_sma}`, `SMA ${form.long_sma}`]
    const rows = filteredSignals.map((s, i) => [
      i + 1,
      s.ticker,
      `"${s.company.replace(/"/g, '""')}"`,
      s.crossover_type,
      s.crossover_date,
      s.close,
      s.short_sma,
      s.long_sma,
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `kite_sma_${form.short_sma}_${form.long_sma}_signals.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Copy TradingView Watchlist
  function copyWatchlist() {
    if (!filteredSignals.length) return
    const text = filteredSignals.map(s => `NSE:${s.ticker}`).join(', ')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="section-kicker">PERSONAL WORKSPACE <span className="heading-separator">/</span> MARKET SCANNER</div>
          <h1>SMA signals<span className="heading-period">.</span></h1>
          <p>Find recent moving average crossovers across the Nifty 100 universe.</p>
        </div>
        <span className="universe-badge">
          <span className="universe-mark"><Icon name="chart" size={15}/></span> NSE · NIFTY 100
        </span>
      </div>

      <section className="scanner-panel">
        <div className="scanner-intro">
          <span className="scanner-icon"><Icon name="chart" size={22}/></span>
          <div>
            <h2>Configure your scan</h2>
            <p>A crossover occurs when the short moving average crosses above or below the long moving average.</p>
          </div>
        </div>

        <form className="scanner-form" onSubmit={generate}>
          <label className="scanner-field">
            <span>SHORT SMA <small>period</small></span>
            <div className="number-input">
              <input type="number" min="2" max="200" value={form.short_sma} onChange={e => change('short_sma', e.target.value)} required/>
              <span>days</span>
            </div>
          </label>

          <label className="scanner-field">
            <span>LONG SMA <small>period</small></span>
            <div className="number-input">
              <input type="number" min="3" max="500" value={form.long_sma} onChange={e => change('long_sma', e.target.value)} required/>
              <span>days</span>
            </div>
          </label>

          <label className="scanner-field">
            <span>LOOKBACK <small>trading window</small></span>
            <div className="number-input">
              <input type="number" min="1" max="365" value={form.lookback_days} onChange={e => change('lookback_days', e.target.value)} required/>
              <span>days</span>
            </div>
          </label>

          <label className="scanner-field">
            <span>MAX STOCKS <small>results to show</small></span>
            <div className="number-input">
              <input type="number" min="1" max="100" value={form.max_stocks} onChange={e => change('max_stocks', e.target.value)} required/>
              <span>stocks</span>
            </div>
          </label>

          <button className="generate-button" type="submit" disabled={loading || !form.short_sma || !form.long_sma || form.short_sma >= form.long_sma}>
            <Icon name="chart" size={17}/>
            {loading ? 'Scanning Nifty 100…' : 'Generate signals'}
            {!loading && <Icon name="chevron" size={16}/>}
          </button>
        </form>

        <div className="scanner-hint">
          <Icon name="shield" size={15}/>
          <span>Uses daily closing candles. The scanner checks all matched Nifty 100 stocks, then ranks recent signals first.</span>
        </div>
      </section>

      {error && <div className="alert-error" role="alert"><span className="alert-mark">!</span>{error}</div>}
      {loading && (
        <div className="scan-progress">
          <span className="spinner spinner-large"/>
          <div><b>Scanning Nifty 100 universe…</b><small>Fetching daily candles in parallel. Finished in seconds.</small></div>
        </div>
      )}

      {result && (
        <section className="signals-results">
          <div className="results-heading">
            <div>
              <span className="section-kicker">LATEST CROSSOVERS</span>
              <h2>Signal results</h2>
              <p>Most recent crossover dates appear first. Click any stock to view its interactive candlestick chart.</p>
            </div>
            <span className="results-updated">UPDATED {latestTime.toUpperCase()}</span>
          </div>

          <div className="results-metrics">
            <div><span>STOCKS SCANNED</span><strong>{result.summary.matched}<small> / {result.summary.universe}</small></strong></div>
            <div><span>SIGNALS FOUND</span><strong>{result.summary.found}</strong></div>
            <div><span>LOOKBACK WINDOW</span><strong>{result.summary.lookback_days}<small> days</small></strong></div>
            <div><span>SMA CONFIG</span><strong>{result.summary.short_sma}<small> / </small>{result.summary.long_sma}</strong></div>
          </div>

          {result.summary.data_source === 'nse_public' && (
            <div className="scan-notice">
              <Icon name="shield" size={16}/>
              <span><strong>Live NSE Feed:</strong> Kite Historical API add-on is not active on your Zerodha app, so real-time NSE daily candle data was loaded automatically.</span>
            </div>
          )}

          {/* Feature 1 Filter Bar */}
          <div className="filter-bar">
            <div className="filter-pills">
              <button
                className={`filter-pill ${filterType === 'all' ? 'active' : ''}`}
                onClick={() => setFilterType('all')}
              >
                All Signals <span className="count">{counts.all}</span>
              </button>
              <button
                className={`filter-pill pill-bullish ${filterType === 'bullish' ? 'active' : ''}`}
                onClick={() => setFilterType('bullish')}
              >
                <i className="crossover-badge bullish" style={{ padding: 0, border: 0 }}><i/></i> Bullish <span className="count">{counts.bullish}</span>
              </button>
              <button
                className={`filter-pill pill-bearish ${filterType === 'bearish' ? 'active' : ''}`}
                onClick={() => setFilterType('bearish')}
              >
                <i className="crossover-badge bearish" style={{ padding: 0, border: 0 }}><i/></i> Bearish <span className="count">{counts.bearish}</span>
              </button>
              <button
                className={`filter-pill ${filterType === 'fresh' ? 'active' : ''}`}
                onClick={() => setFilterType('fresh')}
              >
                Fresh (≤ 3 Days) <span className="count">{counts.fresh}</span>
              </button>
            </div>

            <div className="filter-controls">
              <div className="search-box">
                <Icon name="search" size={15}/>
                <input
                  type="text"
                  placeholder="Search ticker or company…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              <select className="sort-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                <option value="date_desc">Sort: Newest Date</option>
                <option value="date_asc">Sort: Oldest Date</option>
                <option value="price_desc">Sort: Price (High to Low)</option>
                <option value="price_asc">Sort: Price (Low to High)</option>
                <option value="ticker_asc">Sort: Ticker (A-Z)</option>
              </select>

              <button className="action-btn" onClick={exportCsv} title="Download CSV report">
                <Icon name="download" size={14}/> CSV
              </button>
              <button className="action-btn" onClick={copyWatchlist} title="Copy tickers for TradingView watchlist">
                <Icon name={copied ? 'check' : 'copy'} size={14}/> {copied ? 'Copied!' : 'Copy TV'}
              </button>
            </div>
          </div>

          {filteredSignals.length ? (
            <div className="signals-table-wrap">
              <table className="signals-table">
                <thead>
                  <tr>
                    <th>RANK</th>
                    <th>TICKER</th>
                    <th>COMPANY</th>
                    <th>CROSSOVER TYPE</th>
                    <th>CROSSOVER DATE</th>
                    <th className="numeric-cell">CLOSE</th>
                    <th className="numeric-cell">SMA {result.summary.short_sma}</th>
                    <th className="numeric-cell">SMA {result.summary.long_sma}</th>
                    <th style={{ textAlign: 'center' }}>CHART</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSignals.map((row, idx) => (
                    <tr key={`${row.ticker}-${row.crossover_date}`} onClick={() => onSelectStock(row)}>
                      <td><span className="rank-number">{String(idx + 1).padStart(2, '0')}</span></td>
                      <td><strong className="ticker-value">{row.ticker}</strong></td>
                      <td><span className="company-value">{row.company}</span></td>
                      <td>
                        <span className={`crossover-badge ${row.crossover_type.toLowerCase()}`}>
                          <i/>{row.crossover_type}
                        </span>
                      </td>
                      <td className="date-value">{dateLabel(row.crossover_date)}</td>
                      <td className="numeric-cell price-value">{priceLabel(row.close)}</td>
                      <td className="numeric-cell sma-value">{priceLabel(row.short_sma)}</td>
                      <td className="numeric-cell sma-value">{priceLabel(row.long_sma)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button className="chart-btn" onClick={e => { e.stopPropagation(); onSelectStock(row) }}>
                          <Icon name="chart" size={13}/> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="no-signals">
              <div className="empty-icon"><Icon name="chart" size={24}/></div>
              <h3>No signals match your filter</h3>
              <p>Try searching for a different stock name or reset your filter pills.</p>
            </div>
          )}

          <div className="results-footnote">
            <span><Icon name="lock" size={14}/> Signal data based on completed daily candles. Informational purposes only.</span>
            <span>Showing {filteredSignals.length} of {result.summary.found} signals</span>
          </div>
        </section>
      )}
    </>
  )
}

function Field({ label, id, type = 'text', value, onChange, placeholder, autoComplete, hint, suffix }) {
  return (
    <div className="field-wrap">
      <div className="field-heading"><label htmlFor={id}>{label}</label>{hint && <span>{hint}</span>}</div>
      <div className="input-shell">
        <input id={id} type={type} value={value} onChange={onChange} placeholder={placeholder} autoComplete={autoComplete} spellCheck="false" required />
        {suffix}
      </div>
    </div>
  )
}

function Login({ onLogin, theme, onToggleTheme }) {
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [requestToken, setRequestToken] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('request_token')
    if (token) {
      setRequestToken(token)
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])

  const loginUrl = useMemo(() => apiKey.trim() ? `https://kite.zerodha.com/connect/login?v=3&api_key=${encodeURIComponent(apiKey.trim())}` : '', [apiKey])

  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret, request_token: requestToken }) })
      setApiSecret('')
      setRequestToken('')
      onLogin(data.profile)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-page">
      <header className="login-top">
        <Brand/>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ThemeToggle theme={theme} onToggle={onToggleTheme}/>
          <span className="local-badge"><i/> LOCAL WORKSPACE</span>
        </div>
      </header>

      <section className="login-layout">
        <div className="login-intro">
          <div className="section-kicker">SECURE ACCOUNT ACCESS</div>
          <h1>Your trading account,<br/><em>all in one view.</em></h1>
          <p>Connect your Zerodha account to view your portfolio, run technical SMA scans, and view interactive charts in a private, local dashboard.</p>
          <div className="trust-list">
            <div>
              <span className="trust-icon"><Icon name="shield" size={18}/></span>
              <span><b>Private by design</b><small>Your credentials stay on your device.</small></span>
            </div>
            <div>
              <span className="trust-icon"><Icon name="lock" size={18}/></span>
              <span><b>Stored locally</b><small>Session persists until the trading day ends.</small></span>
            </div>
          </div>
        </div>

        <div className="login-card">
          <div className="card-heading">
            <div><div className="section-kicker">ZERODHA KITE CONNECT</div><h2>Connect your account</h2></div>
          </div>
          <p className="card-description">Use your Kite Connect app credentials to start a secure session.</p>
          {error && <div className="alert-error" role="alert"><span className="alert-mark">!</span>{error}</div>}

          <form onSubmit={submit} className="login-form">
            <Field id="api-key" label="API key" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Enter your Kite API key" autoComplete="off" />
            <Field id="api-secret" label="API secret" type={showSecret ? 'text' : 'password'} value={apiSecret} onChange={e => setApiSecret(e.target.value)} placeholder="Enter your Kite API secret" autoComplete="new-password" suffix={<button type="button" className="input-action" onClick={() => setShowSecret(v => !v)}>{showSecret ? 'HIDE' : 'SHOW'}</button>} />
            <div className="request-heading">
              <label htmlFor="request-token">Request token</label>
              {loginUrl ? <a href={loginUrl} target="_blank" rel="noreferrer">Open Kite login <Icon name="arrow" size={13}/></a> : <span>First, enter your API key</span>}
            </div>
            <div className="input-shell">
              <input id="request-token" type="text" value={requestToken} onChange={e => setRequestToken(e.target.value)} placeholder="Paste token from your redirect URL" autoComplete="off" spellCheck="false" required />
            </div>
            <p className="field-note">Sign in to Kite, then copy the <code>request_token</code> from the redirect URL. It expires quickly and can only be used once.</p>
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? <><span className="spinner"/> Connecting securely…</> : <>Connect account <Icon name="chevron" size={16}/></>}
            </button>
          </form>

          <div className="card-foot">
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Icon name="lock" size={14}/> SECURE CONNECTION</span>
            <span>API secret is used only for token exchange.</span>
          </div>
        </div>
      </section>

      <footer className="login-footer">
        <span>© {new Date().getFullYear()} Kite Desk</span>
        <span>PERSONAL WORKSPACE · RUNNING LOCALLY</span>
      </footer>
    </main>
  )
}

function ChipList({ values, empty }) {
  if (!values?.length) return <span style={{ color: 'var(--text-muted)' }}>{empty}</span>
  return <div className="chip-list">{values.map(value => <span className="data-chip" key={value}>{value}</span>)}</div>
}

function ProfilePanel({ profile, loading, error, onRetry }) {
  if (loading) return <div className="scan-progress"><span className="spinner spinner-large"/><p>Loading your Kite profile…</p></div>
  if (error) return <div className="alert-error"><h3>Couldn’t load your profile</h3><p>{error}</p><button className="action-btn" onClick={onRetry}>Try again</button></div>
  if (!profile) return null

  return (
    <div className="profile-panel">
      <div className="profile-banner">
        <div className="avatar">{(profile.user_name || 'K').slice(0, 1).toUpperCase()}</div>
        <div className="profile-identity">
          <div className="section-kicker">CONNECTED ACCOUNT</div>
          <h3>{profile.user_name || 'Kite user'}</h3>
          <span className="user-id">User ID: {profile.user_id || '—'}</span>
        </div>
        <span className="connected-status"><i/> CONNECTED</span>
      </div>

      <div className="profile-grid">
        <div className="profile-field">
          <span className="field-label">ACCOUNT HOLDER</span>
          <strong>{profile.user_name || '—'}</strong>
          <small style={{ color: 'var(--text-muted)' }}>Registered Zerodha account</small>
        </div>
        <div className="profile-field">
          <span className="field-label">PERMANENT KITE ID</span>
          <strong className="mono">{profile.user_id || '—'}</strong>
          <small style={{ color: 'var(--text-muted)' }}>Broker identifier</small>
        </div>
        <div className="profile-field profile-field-wide">
          <span className="field-label">ENABLED PRODUCTS</span>
          <ChipList values={profile.products} empty="No products listed"/>
          <small style={{ color: 'var(--text-muted)' }}>Order products enabled on this account</small>
        </div>
        <div className="profile-field profile-field-wide">
          <span className="field-label">ENABLED EXCHANGES</span>
          <ChipList values={profile.exchanges} empty="No exchanges listed"/>
          <small style={{ color: 'var(--text-muted)' }}>Exchanges available for trading</small>
        </div>
      </div>
    </div>
  )
}

function Dashboard({ initialProfile, onLogout, theme, onToggleTheme }) {
  const [tab, setTab] = useState('signals') // Default to signals
  const [profile, setProfile] = useState(initialProfile || null)
  const [profileState, setProfileState] = useState({ loading: false, error: '' })
  const [selectedStock, setSelectedStock] = useState(null)
  const [lastSignals, setLastSignals] = useState([])

  async function loadProfile() {
    setProfileState({ loading: true, error: '' })
    try {
      const data = await api('/api/profile')
      setProfile(data)
      setProfileState({ loading: false, error: '' })
    } catch (error) {
      setProfileState({ loading: false, error: error.message })
      if (error.message.includes('expired') || error.message.includes('No saved')) onLogout()
    }
  }

  useEffect(() => {
    if (tab === 'user') loadProfile()
  }, [tab])

  const initials = (profile?.user_name || 'K').slice(0, 1).toUpperCase()

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><Brand/></div>
        <div className="side-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Dashboard navigation">
          <button className={`nav-item ${tab === 'signals' ? 'active' : ''}`} onClick={() => setTab('signals')}>
            <Icon name="chart"/><span>Signals Scanner</span>{tab === 'signals' && <i className="nav-indicator"/>}
          </button>
          <button className={`nav-item ${tab === 'portfolio' ? 'active' : ''}`} onClick={() => setTab('portfolio')}>
            <Icon name="portfolio"/><span>Portfolio & Alerts</span>{tab === 'portfolio' && <i className="nav-indicator"/>}
          </button>
          <button className={`nav-item ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>
            <Icon name="grid"/><span>Account Overview</span>{tab === 'overview' && <i className="nav-indicator"/>}
          </button>
          <button className={`nav-item ${tab === 'user' ? 'active' : ''}`} onClick={() => setTab('user')}>
            <Icon name="user"/><span>User Profile</span>{tab === 'user' && <i className="nav-indicator"/>}
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-secure">
            <Icon name="shield" size={16}/>
            <div><b>Private Session</b><small>Owner encrypted</small></div>
          </div>
          <div className="sidebar-version">KITE DESK · V2.0</div>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <Icon name="chevron" size={14}/>
            <strong>
              {tab === 'signals' ? 'SMA Signals Scanner' : tab === 'portfolio' ? 'Holdings & Positions' : tab === 'user' ? 'User Profile' : 'Account Overview'}
            </strong>
          </div>

          <div className="topbar-right">
            <ThemeToggle theme={theme} onToggle={onToggleTheme}/>
            <span className="connection-pill"><i/> KITE CONNECTED</span>
            <div className="topbar-divider"/>
            <button className="account-trigger" aria-label="Connected account">
              <span className="mini-avatar">{initials}</span>
              <span className="account-trigger-name">{profile?.user_name || 'Kite account'}</span>
            </button>
            <button className="logout-button" onClick={onLogout}>Sign out</button>
          </div>
        </header>

        <div className="content-wrap">
          {tab === 'signals' && (
            <SignalsPanel
              onUnauthorized={onLogout}
              onSelectStock={setSelectedStock}
            />
          )}

          {tab === 'portfolio' && (
            <PortfolioPanel
              signals={lastSignals}
              onSelectStock={setSelectedStock}
            />
          )}

          {tab === 'overview' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="section-kicker">PERSONAL WORKSPACE <span className="heading-separator">/</span> OVERVIEW</div>
                  <h1>Good to see you, {profile?.user_name?.split(' ')[0] || 'Trader'}<span className="heading-period">.</span></h1>
                  <p>Your Kite Connect session is active. Explore momentum signals, monitor holdings, or review exchange permissions.</p>
                </div>
              </div>

              <div className="overview-grid">
                <button className="overview-card user-card" onClick={() => setTab('signals')}>
                  <div className="overview-card-top">
                    <span className="card-icon"><Icon name="chart" size={22}/></span>
                    <span className="card-open">OPEN SCANNER <Icon name="arrow" size={13}/></span>
                  </div>
                  <span className="overview-label">MARKET SCANNER</span>
                  <strong className="overview-value">SMA Signals</strong>
                  <span className="overview-foot">Scan Nifty 100 for Bullish & Bearish Crossovers <Icon name="chevron" size={14}/></span>
                </button>

                <button className="overview-card user-card" onClick={() => setTab('portfolio')}>
                  <div className="overview-card-top">
                    <span className="card-icon green"><Icon name="portfolio" size={22}/></span>
                    <span className="card-open">VIEW HOLDINGS <Icon name="arrow" size={13}/></span>
                  </div>
                  <span className="overview-label">PORTFOLIO</span>
                  <strong className="overview-value">Live P&L & Alerts</strong>
                  <span className="overview-foot">Holdings cross-referenced with SMA exit signals <Icon name="chevron" size={14}/></span>
                </button>

                <button className="overview-card user-card" onClick={() => setTab('user')}>
                  <div className="overview-card-top">
                    <span className="card-icon violet"><Icon name="user" size={22}/></span>
                    <span className="card-open">VIEW PROFILE <Icon name="arrow" size={13}/></span>
                  </div>
                  <span className="overview-label">KITE ACCOUNT</span>
                  <strong className="overview-value">{profile?.user_id || 'ID: —'}</strong>
                  <span className="overview-foot">{profile?.products?.length || 0} products · {profile?.exchanges?.length || 0} exchanges <Icon name="chevron" size={14}/></span>
                </button>
              </div>
            </>
          )}

          {tab === 'user' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="section-kicker">PERSONAL WORKSPACE <span className="heading-separator">/</span> USER</div>
                  <h1>User profile<span className="heading-period">.</span></h1>
                  <p>Account details and access permissions provided directly by Zerodha Kite Connect.</p>
                </div>
                <button className="action-btn" onClick={loadProfile} disabled={profileState.loading}>
                  <Icon name="refresh" size={15}/> {profileState.loading ? 'Refreshing…' : 'Refresh profile'}
                </button>
              </div>

              <ProfilePanel
                profile={profile}
                loading={profileState.loading}
                error={profileState.error}
                onRetry={loadProfile}
              />
            </>
          )}
        </div>
      </main>

      {/* Feature 3 Interactive Chart Modal */}
      {selectedStock && (
        <StockChartModal
          stock={selectedStock}
          theme={theme}
          onClose={() => setSelectedStock(null)}
        />
      )}
    </div>
  )
}

function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [profile, setProfile] = useState(null)
  const [checking, setChecking] = useState(true)
  const [theme, setTheme] = useState(() => localStorage.getItem('kitedesk_theme') || 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('kitedesk_theme', theme)
  }, [theme])

  function toggleTheme() {
    setTheme(current => (current === 'dark' ? 'light' : 'dark'))
  }

  useEffect(() => {
    api('/api/session')
      .then(data => {
        if (data.authenticated) {
          setProfile(data.profile)
          setAuthenticated(true)
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [])

  async function signOut() {
    await api('/api/logout', { method: 'POST', body: '{}' }).catch(() => {})
    setAuthenticated(false)
    setProfile(null)
  }

  if (checking) {
    return (
      <div className="scan-progress" style={{ margin: '150px auto', width: 'fit-content', border: '0', background: 'transparent' }}>
        <Brand/>
        <span className="spinner spinner-large"/>
        <p style={{ marginTop: '12px', fontSize: '15px' }}>Checking local session…</p>
      </div>
    )
  }

  return authenticated ? (
    <Dashboard
      initialProfile={profile}
      onLogout={signOut}
      theme={theme}
      onToggleTheme={toggleTheme}
    />
  ) : (
    <Login
      onLogin={nextProfile => {
        setProfile(nextProfile)
        setAuthenticated(true)
      }}
      theme={theme}
      onToggleTheme={toggleTheme}
    />
  )
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App/>
  </React.StrictMode>
)

import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Shield, Target, 
  BarChart3, Upload, Activity, Settings, 
  AlertCircle, CheckCircle2, Info, Loader2,
  ChevronRight, Wallet, Percent
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { MarketData, RiskProfile, TradeAnalysis, TrendingStock, DayTradeSuggestion } from '../types';
import { analyzeChart, getTrendingSuggestions } from '../services/gemini';
import TradeTracker from './TradeTracker';
import SignalScanner from './SignalScanner';
import { useAuth } from './AuthProvider';
import { db, collection, query, where, onSnapshot, handleFirestoreError, OperationType } from '../lib/firebase';
import { GoogleGenAI } from "@google/genai";

export default function Dashboard() {
  const { user, isAuthReady } = useAuth();
  const [symbol, setSymbol] = useState('AAPL');
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<TradeAnalysis | null>(null);
  const [riskProfile, setRiskProfile] = useState<RiskProfile>({
    tolerance: 'medium',
    capital: 10000,
    maxRiskPerTrade: 2
  });
  const [image, setImage] = useState<string | null>(null);
  const [trendingStocks, setTrendingStocks] = useState<TrendingStock[]>([]);
  const [dayTradeSuggestions, setDayTradeSuggestions] = useState<DayTradeSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const [trades, setTrades] = useState<any[]>([]);
  const [strategyInsights, setStrategyInsights] = useState<any[]>([
    { name: "Moving Average Crossover", status: "Active", description: "Detecting golden cross on 50/200 EMA" },
    { name: "RSI Momentum", status: "Monitoring", description: "RSI currently at 58. Neutral zone." },
    { name: "Bollinger Bands", status: "Volatile", description: "Bands expanding. Expect breakout." }
  ]);
  const [portfolioHealth, setPortfolioHealth] = useState<{ score: number, message: string }>({
    score: 82,
    message: "High concentration in Tech sector (64%). Consider adding defensive or energy positions to balance risk."
  });

  const [error, setError] = useState<string | null>(null);

  const fetchMarketData = async (ticker: string) => {
    if (!ticker || ticker.trim() === "") return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/market-data/${ticker}`);
      
      // Handle non-JSON responses (like HTML fallbacks)
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Non-JSON response received:", text.substring(0, 100));
        throw new Error("Invalid server response. The backend might be restarting or misconfigured.");
      }

      const data = await res.json();
      if (!res.ok) {
        if (data.error === "FINNHUB_API_FORBIDDEN" || res.status === 403) {
          setError("API_KEY_FORBIDDEN");
        } else if (data.error?.includes("FINNHUB_API_KEY")) {
          setError("API_KEY_MISSING");
        }
        throw new Error(data.error || "Failed to fetch data");
      }
      setMarketData(data);
    } catch (err: any) {
      console.error("Market data fetch error:", err.message);
      // If it's not a specific API key error, we might want to show a generic error
      if (!error) {
        // Optional: set a generic error state if needed
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchTrendingStocks = async () => {
    setLoadingSuggestions(true);
    try {
      const res = await fetch('/api/trending-stocks');
      
      // Handle non-JSON responses (like HTML fallbacks)
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Invalid server response. The backend might be restarting or misconfigured.");
      }

      if (!res.ok) throw new Error("Failed to fetch trending stocks");
      const data = await res.json();
      setTrendingStocks(data);
      
      // Get AI suggestions
      const suggestions = await getTrendingSuggestions(data);
      setDayTradeSuggestions(suggestions);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  useEffect(() => {
    fetchTrendingStocks();
    const interval = setInterval(fetchTrendingStocks, 300000); // Every 5 mins
    return () => clearInterval(interval);
  }, []);

  // Fetch trades for portfolio analysis
  useEffect(() => {
    if (!isAuthReady || !user) {
      setTrades([]);
      return;
    }

    const q = query(collection(db, 'trades'), where('userId', '==', user.uid), where('status', '==', 'open'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tradesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTrades(tradesData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trades');
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  // Analyze Portfolio Health when trades change
  useEffect(() => {
    if (trades.length === 0) {
      setPortfolioHealth({
        score: 100,
        message: "No active trades. Your portfolio is entirely in cash, which is safe but yields no returns."
      });
      return;
    }

    const analyzePortfolio = async () => {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const model = ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Analyze this portfolio of active trades:
          ${JSON.stringify(trades.map(t => ({ symbol: t.symbol, type: t.type, quantity: t.quantity, entry: t.entryPrice })))}
          
          User's Risk Tolerance: ${riskProfile.tolerance}
          
          Provide a diversification score (0-100) and a 1-2 sentence insight about the portfolio's risk or concentration, keeping their risk tolerance in mind.
          Return JSON: { "score": number, "message": "string" }`,
          config: { responseMimeType: "application/json" }
        });

        const response = await model;
        const result = JSON.parse(response.text);
        setPortfolioHealth(result);
      } catch (err) {
        console.error("Portfolio analysis error:", err);
      }
    };

    // Debounce analysis to avoid spamming API
    const timer = setTimeout(analyzePortfolio, 2000);
    return () => clearTimeout(timer);
  }, [trades, riskProfile.tolerance]);

  // Analyze Strategy Insights when market data changes
  useEffect(() => {
    if (!marketData) return;

    const analyzeStrategies = async () => {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const model = ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Analyze the current market data for ${symbol}:
          Current Price: $${marketData.quote.c}
          High: $${marketData.quote.h}
          Low: $${marketData.quote.l}
          
          User's Risk Tolerance: ${riskProfile.tolerance}
          Current Open Trades: ${trades.length > 0 ? trades.map(t => t.symbol).join(', ') : 'None'}
          
          Provide 3 technical strategy insights (choose from Moving Average Crossover, RSI, MACD, Bollinger Bands).
          Select the most appropriate strategies based on the current market conditions and the user's risk tolerance.
          For each, provide a status (Active, Monitoring, Volatile, Neutral) and a short 1-sentence description.
          Return JSON: [{ "name": "Strategy Name", "status": "string", "description": "string" }, ...]`,
          config: { responseMimeType: "application/json" }
        });

        const response = await model;
        const result = JSON.parse(response.text);
        if (Array.isArray(result) && result.length === 3) {
          setStrategyInsights(result);
        }
      } catch (err) {
        console.error("Strategy analysis error:", err);
      }
    };

    // Debounce analysis
    const timer = setTimeout(analyzeStrategies, 3000);
    return () => clearTimeout(timer);
  }, [marketData, symbol, riskProfile.tolerance, trades.length]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMarketData(symbol);
    }, 500);
    const interval = setInterval(() => fetchMarketData(symbol), 60000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [symbol]);

  if (error === "API_KEY_MISSING" || error === "API_KEY_FORBIDDEN") {
    const isForbidden = error === "API_KEY_FORBIDDEN";
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full glass p-8 rounded-3xl space-y-6">
          <div className={cn(
            "w-16 h-16 rounded-full flex items-center justify-center mx-auto",
            isForbidden ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-500"
          )}>
            {isForbidden ? <AlertCircle className="w-8 h-8" /> : <AlertCircle className="w-8 h-8" />}
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">{isForbidden ? "Access Denied" : "Market Data Key Required"}</h2>
            <p className="text-zinc-400 text-sm">
              {isForbidden 
                ? "Your Finnhub API key was rejected. This usually means the key is invalid or your free tier doesn't support this symbol." 
                : "To fetch real-time stock prices and charts, you need to configure your Finnhub API key."}
            </p>
          </div>
          
          <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-4 text-left space-y-4">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Troubleshooting</p>
            <ol className="text-sm space-y-3 text-zinc-300">
              {isForbidden ? (
                <>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-5 h-5 bg-zinc-800 rounded-full flex items-center justify-center text-[10px]">!</span>
                    <span>Verify your key at <a href="https://finnhub.io/dashboard" target="_blank" rel="noopener" className="text-emerald-500 hover:underline">finnhub.io/dashboard</a></span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-5 h-5 bg-zinc-800 rounded-full flex items-center justify-center text-[10px]">!</span>
                    <span>Try a major US stock like <code>AAPL</code> or <code>TSLA</code></span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-5 h-5 bg-zinc-800 rounded-full flex items-center justify-center text-[10px]">1</span>
                    <span>Get a free key at <a href="https://finnhub.io/" target="_blank" rel="noopener" className="text-emerald-500 hover:underline">finnhub.io</a></span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-5 h-5 bg-zinc-800 rounded-full flex items-center justify-center text-[10px]">2</span>
                    <span>Open <b>Settings</b> (⚙️ gear icon, top-right)</span>
                  </li>
                </>
              )}
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 bg-zinc-800 rounded-full flex items-center justify-center text-[10px]">{isForbidden ? '!' : '3'}</span>
                <span>Update <code>FINNHUB_API_KEY</code> in <b>Secrets</b></span>
              </li>
            </ol>
          </div>

          <button 
            onClick={() => fetchMarketData(symbol)}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-semibold transition-all"
          >
            {isForbidden ? 'Try Again' : "I've added the key, try again"}
          </button>
        </div>
      </div>
    );
  }

  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAnalysisError(null);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const runAnalysis = async () => {
    if (!image) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const result = await analyzeChart(image, riskProfile, `Current price of ${symbol} is $${marketData?.quote.c}`);
      setAnalysis(result);
    } catch (err: any) {
      console.error("Analysis Error:", err);
      setAnalysisError(err.message || "Failed to analyze chart. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  const chartData = marketData?.candles.t.map((time, i) => ({
    time: new Date(time * 1000).toLocaleDateString(),
    price: marketData.candles.c[i],
    volume: marketData.candles.v[i]
  })) || [];

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="text-emerald-500" />
            TradeVision <span className="text-emerald-500">AI</span>
          </h1>
          <p className="text-zinc-500 text-sm">Advanced Technical Analysis & Risk Management</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <input 
              type="text" 
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 w-32"
              placeholder="SYMBOL"
            />
          </div>
          <button 
            onClick={() => fetchMarketData(symbol)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Refresh
          </button>
        </div>
      </header>

      {/* Day Trading Hub */}
      <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
            <h2 className="text-xl font-bold">Day Trading Hub</h2>
          </div>
          <button 
            onClick={fetchTrendingStocks}
            disabled={loadingSuggestions}
            className="text-xs text-emerald-500 hover:text-emerald-400 flex items-center gap-1 disabled:opacity-50"
          >
            {loadingSuggestions ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
            Refresh Trends
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {dayTradeSuggestions.length > 0 ? (
            dayTradeSuggestions.map((suggestion, idx) => (
              <motion.div 
                key={suggestion.symbol}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-5 space-y-4 hover:border-emerald-500/30 transition-all cursor-pointer"
                onClick={() => {
                  setSymbol(suggestion.symbol);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold font-mono">{suggestion.symbol}</span>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded font-bold",
                      suggestion.trend === 'UP' ? "bg-emerald-500/20 text-emerald-500" :
                      suggestion.trend === 'DOWN' ? "bg-red-500/20 text-red-500" : "bg-zinc-800 text-zinc-400"
                    )}>
                      {suggestion.trend}
                    </span>
                  </div>
                  <span className={cn(
                    "text-[10px] uppercase tracking-wider font-bold",
                    suggestion.volatility === 'HIGH' ? "text-amber-500" : "text-zinc-500"
                  )}>
                    {suggestion.volatility} VOL
                  </span>
                </div>
                
                <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">
                  {suggestion.reason}
                </p>

                <div className="pt-3 border-t border-zinc-800/50">
                  <p className="text-[10px] text-zinc-500 italic">"{suggestion.sentiment}"</p>
                </div>
              </motion.div>
            ))
          ) : (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-5 h-40 animate-pulse" />
            ))
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Market Data & Chart */}
        <div className="lg:col-span-8 space-y-6">
          {/* Market Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard 
              label="Current Price" 
              value={marketData?.quote.c ? `$${marketData.quote.c.toFixed(2)}` : '---'} 
              trend={marketData?.quote.d || 0}
              sub={marketData?.quote.dp ? `${marketData.quote.dp.toFixed(2)}%` : '0%'}
            />
            <StatCard 
              label="Day High" 
              value={marketData?.quote.h ? `$${marketData.quote.h.toFixed(2)}` : '---'} 
            />
            <StatCard 
              label="Day Low" 
              value={marketData?.quote.l ? `$${marketData.quote.l.toFixed(2)}` : '---'} 
            />
            <StatCard 
              label="Prev Close" 
              value={marketData?.quote.pc ? `$${marketData.quote.pc.toFixed(2)}` : '---'} 
            />
          </div>

          {/* Main Chart */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 h-[400px] relative overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-medium flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-500" />
                {symbol} Performance (30D)
              </h3>
              <div className="flex gap-2 text-xs">
                <span className="px-2 py-1 bg-emerald-500/10 text-emerald-500 rounded">Real-time</span>
              </div>
            </div>
            
            {marketData?.candles.t && marketData.candles.t.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis 
                    dataKey="time" 
                    stroke="#71717a" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#71717a" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(val) => `$${val}`}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                    itemStyle={{ color: '#10b981' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="price" 
                    stroke="#10b981" 
                    fillOpacity={1} 
                    fill="url(#colorPrice)" 
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-zinc-900/80 backdrop-blur-sm">
                <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center mb-4">
                  <BarChart3 className="w-6 h-6 text-zinc-500" />
                </div>
                <h4 className="text-sm font-semibold mb-1">Chart Data Unavailable</h4>
                <p className="text-xs text-zinc-500 max-w-[240px]">
                  {(marketData?.candles as any)?.error === "RESTRICTED" 
                    ? "Historical data for this symbol is restricted on the free tier. Try a major stock like AAPL."
                    : "No historical data found for this symbol in the last 30 days."}
                </p>
              </div>
            )}
          </div>

          {/* AI Signal Scanner Section */}
          <SignalScanner riskProfile={riskProfile} />
        </div>

        {/* Right Column: Risk & Portfolio */}
        <div className="lg:col-span-4 space-y-6">
          {/* Risk Management */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
            <h3 className="font-medium flex items-center gap-2 mb-6">
              <Shield className="w-4 h-4 text-emerald-500" />
              Risk Management
            </h3>
            
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-xs text-zinc-500 uppercase flex items-center justify-between">
                  Risk Tolerance
                  <span className="text-emerald-500 font-medium">{riskProfile.tolerance.toUpperCase()}</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['low', 'medium', 'high'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setRiskProfile(prev => ({ ...prev, tolerance: t as any }))}
                      className={cn(
                        "py-2 text-xs rounded-lg border transition-all",
                        riskProfile.tolerance === t 
                          ? "bg-emerald-500/10 border-emerald-500 text-emerald-500" 
                          : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                      )}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs text-zinc-500 uppercase flex items-center justify-between">
                  Trading Capital
                  <Wallet className="w-3 h-3" />
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
                  <input 
                    type="number" 
                    value={riskProfile.capital}
                    onChange={(e) => setRiskProfile(prev => ({ ...prev, capital: Number(e.target.value) }))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs text-zinc-500 uppercase flex items-center justify-between">
                  Max Risk Per Trade
                  <Percent className="w-3 h-3" />
                </label>
                <input 
                  type="range" 
                  min="0.5" 
                  max="5" 
                  step="0.5"
                  value={riskProfile.maxRiskPerTrade}
                  onChange={(e) => setRiskProfile(prev => ({ ...prev, maxRiskPerTrade: Number(e.target.value) }))}
                  className="w-full accent-emerald-500"
                />
                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>Conservative (0.5%)</span>
                  <span className="text-emerald-500 font-bold">{riskProfile.maxRiskPerTrade}%</span>
                  <span>Aggressive (5%)</span>
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-zinc-400">Position Size (Rec)</span>
                  <span className="text-sm font-mono text-emerald-500">
                    ${((riskProfile.capital * (riskProfile.maxRiskPerTrade / 100)) / 0.02).toFixed(2)}
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500 leading-relaxed italic">
                  *Calculated based on a standard 2% stop-loss distance. Adjust entry/stop for precise sizing.
                </p>
              </div>
            </div>
          </div>

          {/* Strategy Insights */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
            <h3 className="font-medium flex items-center gap-2 mb-6">
              <Settings className="w-4 h-4 text-emerald-500" />
              Strategy Insights
            </h3>
            
            <div className="space-y-4">
              {strategyInsights.map((insight, idx) => (
                <StrategyItem 
                  key={idx}
                  name={insight.name} 
                  status={insight.status} 
                  description={insight.description}
                />
              ))}
            </div>
          </div>

          {/* Portfolio Diversification */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
            <h3 className="font-medium flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-emerald-500" />
              Portfolio Health
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Diversification Score</span>
                <span className={cn(
                  "font-bold",
                  portfolioHealth.score >= 80 ? "text-emerald-500" :
                  portfolioHealth.score >= 50 ? "text-amber-500" : "text-red-500"
                )}>{portfolioHealth.score}/100</span>
              </div>
              <div className="w-full bg-zinc-950 h-1.5 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full transition-all duration-1000",
                    portfolioHealth.score >= 80 ? "bg-emerald-500" :
                    portfolioHealth.score >= 50 ? "bg-amber-500" : "bg-red-500"
                  )} 
                  style={{ width: `${portfolioHealth.score}%` }} 
                />
              </div>
              <div className="flex items-start gap-2 text-[10px] text-zinc-500 bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                <AlertCircle className={cn(
                  "w-3 h-3 shrink-0 mt-0.5",
                  portfolioHealth.score >= 80 ? "text-emerald-500" :
                  portfolioHealth.score >= 50 ? "text-amber-500" : "text-red-500"
                )} />
                <p>{portfolioHealth.message}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Live Trade Tracker Section */}
        <div className="mt-8">
          <TradeTracker />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, trend, sub }: { label: string; value: string; trend?: number; sub?: string }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-1">
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</p>
      <div className="flex items-end justify-between">
        <p className="text-lg font-bold font-mono">{value}</p>
        {trend !== undefined && (
          <div className={cn(
            "flex items-center text-[10px] font-medium",
            trend >= 0 ? "text-emerald-500" : "text-red-500"
          )}>
            {trend >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

function StrategyItem({ name, status, description }: { name: string; status: string; description: string }) {
  return (
    <div className="group cursor-pointer">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-zinc-300 group-hover:text-emerald-400 transition-colors">{name}</span>
        <span className={cn(
          "text-[10px] px-1.5 py-0.5 rounded",
          status === 'Active' ? "bg-emerald-500/10 text-emerald-500" : 
          status === 'Volatile' ? "bg-amber-500/10 text-amber-500" : "bg-zinc-800 text-zinc-500"
        )}>{status}</span>
      </div>
      <p className="text-[10px] text-zinc-500 line-clamp-1">{description}</p>
    </div>
  );
}

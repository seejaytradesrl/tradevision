import React, { useState, useEffect } from 'react';
import { 
  Plus, Trash2, TrendingUp, TrendingDown, 
  AlertCircle, CheckCircle2, Loader2, 
  LogIn, LogOut, RefreshCw, BrainCircuit, Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from './AuthProvider';
import { 
  db, auth, googleProvider, signInWithPopup, signOut, 
  collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, 
  doc, Timestamp, OperationType, handleFirestoreError 
} from '../lib/firebase';
import { cn } from '../lib/utils';
import { GoogleGenAI } from "@google/genai";

interface Trade {
  id: string;
  symbol: string;
  entryPrice: number;
  quantity: number;
  type: 'buy' | 'sell';
  status: 'open' | 'closed';
  userId: string;
  createdAt: any;
  stopLoss: number;
  takeProfit: number;
  currentPrice?: number;
  suggestion?: string;
  suggestionLoading?: boolean;
}

export default function TradeTracker() {
  const { user, isAuthReady } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTrade, setNewTrade] = useState({ 
    symbol: '', 
    entryPrice: '', 
    quantity: '', 
    type: 'buy' as 'buy' | 'sell',
    stopLoss: '',
    takeProfit: ''
  });
  const [isAdding, setIsAdding] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Periodic price refresh (every 15 seconds)
  useEffect(() => {
    if (!user || trades.length === 0) return;

    const interval = setInterval(() => {
      trades.forEach(trade => {
        fetchLivePrice(trade.id, trade.symbol);
      });
      setLastUpdated(new Date());
    }, 15000);

    return () => clearInterval(interval);
  }, [user, trades.length]);

  // Periodic AI Signal refresh (every 5 minutes)
  useEffect(() => {
    if (!user || trades.length === 0) return;

    const interval = setInterval(() => {
      trades.forEach(trade => {
        if (trade.currentPrice) {
          getAiSuggestion(trade, true); // true indicates it's an automated refresh
        }
      });
    }, 300000); // 5 minutes

    return () => clearInterval(interval);
  }, [user, trades.length]);

  useEffect(() => {
    if (!isAuthReady || !user) {
      setTrades([]);
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'trades'), where('userId', '==', user.uid), where('status', '==', 'open'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tradesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Trade[];
      
      setTrades(tradesData);
      setLoading(false);
      
      // Fetch live prices for each trade
      tradesData.forEach(trade => {
        fetchLivePrice(trade.id, trade.symbol);
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trades');
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  const getAiSuggestion = async (trade: Trade, isAuto = false) => {
    if (!trade.currentPrice) return;

    if (!isAuto) {
      setTrades(prev => prev.map(t => t.id === trade.id ? { ...t, suggestionLoading: true } : t));
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const model = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze this active trade:
        Symbol: ${trade.symbol}
        Type: ${trade.type.toUpperCase()}
        Entry Price: $${trade.entryPrice}
        Current Price: $${trade.currentPrice}
        Quantity: ${trade.quantity}
        Stop Loss: $${trade.stopLoss}
        Take Profit: $${trade.takeProfit}
        
        Provide a concise recommendation (max 40 words). 
        1. Should they HOLD, CLOSE, or SCALE?
        2. Should they adjust their Stop Loss or Take Profit levels based on current market action?
        3. Be specific and technical.`,
      });

      const response = await model;
      const suggestion = response.text;

      setTrades(prev => prev.map(t => t.id === trade.id ? { ...t, suggestion, suggestionLoading: false } : t));
    } catch (err) {
      console.error("AI Suggestion error:", err);
      if (!isAuto) {
        setTrades(prev => prev.map(t => t.id === trade.id ? { ...t, suggestionLoading: false } : t));
      }
    }
  };

  const fetchLivePrice = async (tradeId: string, symbol: string) => {
    try {
      const res = await fetch(`/api/market-data/${symbol}`);
      if (!res.ok) return;
      const data = await res.json();
      const currentPrice = data.quote.c;
      
      setTrades(prev => {
        const trade = prev.find(t => t.id === tradeId);
        // If we didn't have a price before, trigger an initial AI suggestion
        if (trade && !trade.currentPrice) {
          getAiSuggestion({ ...trade, currentPrice }, true);
        }
        return prev.map(t => t.id === tradeId ? { ...t, currentPrice } : t);
      });
    } catch (err) {
      console.error(`Error fetching price for ${symbol}:`, err);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleAddTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsAdding(true);
    try {
      await addDoc(collection(db, 'trades'), {
        symbol: newTrade.symbol.toUpperCase(),
        entryPrice: parseFloat(newTrade.entryPrice),
        quantity: parseFloat(newTrade.quantity),
        type: newTrade.type,
        stopLoss: parseFloat(newTrade.stopLoss),
        takeProfit: parseFloat(newTrade.takeProfit),
        status: 'open',
        userId: user.uid,
        createdAt: Timestamp.now()
      });
      setNewTrade({ symbol: '', entryPrice: '', quantity: '', type: 'buy', stopLoss: '', takeProfit: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'trades');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteTrade = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'trades', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `trades/${id}`);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 text-center">
        <Wallet className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
        <h3 className="text-xl font-semibold mb-2">Track Your Trades</h3>
        <p className="text-zinc-400 mb-6 max-w-md mx-auto">
          Sign in to log your active trades, track profits in real-time, and get AI-powered exit strategies.
        </p>
        <button
          onClick={handleLogin}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-black font-semibold px-6 py-3 rounded-xl transition-all mx-auto"
        >
          <LogIn className="w-5 h-5" />
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Activity className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Live Trade Tracker</h2>
            <div className="flex items-center gap-2">
              <p className="text-sm text-zinc-500">Real-time monitoring & AI exit signals</p>
              <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-bold uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded-full animate-pulse">
                <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                Live
              </span>
              <span className="text-[10px] text-zinc-600">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
          title="Sign Out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      {/* Add Trade Form */}
      <form onSubmit={handleAddTrade} className="space-y-4 bg-zinc-900/30 p-6 rounded-2xl border border-zinc-800/50">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold ml-1">Symbol</label>
            <input
              required
              type="text"
              placeholder="AAPL"
              value={newTrade.symbol}
              onChange={e => setNewTrade({ ...newTrade, symbol: e.target.value })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold ml-1">Trade Type</label>
            <div className="flex bg-zinc-950 border border-zinc-800 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setNewTrade({ ...newTrade, type: 'buy' })}
                className={cn(
                  "flex-1 py-1 rounded-lg text-xs font-bold transition-all",
                  newTrade.type === 'buy' ? "bg-emerald-500 text-black" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                BUY
              </button>
              <button
                type="button"
                onClick={() => setNewTrade({ ...newTrade, type: 'sell' })}
                className={cn(
                  "flex-1 py-1 rounded-lg text-xs font-bold transition-all",
                  newTrade.type === 'sell' ? "bg-rose-500 text-white" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                SELL
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold ml-1">Quantity</label>
            <input
              required
              type="number"
              step="0.01"
              placeholder="10"
              value={newTrade.quantity}
              onChange={e => setNewTrade({ ...newTrade, quantity: e.target.value })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold ml-1">Entry Price</label>
            <input
              required
              type="number"
              step="0.01"
              placeholder="150.00"
              value={newTrade.entryPrice}
              onChange={e => setNewTrade({ ...newTrade, entryPrice: e.target.value })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold ml-1">Stop Loss</label>
            <input
              required
              type="number"
              step="0.01"
              placeholder="145.00"
              value={newTrade.stopLoss}
              onChange={e => setNewTrade({ ...newTrade, stopLoss: e.target.value })}
              className="w-full bg-zinc-950 border border-rose-500/30 rounded-xl px-4 py-2 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold ml-1">Take Profit</label>
            <input
              required
              type="number"
              step="0.01"
              placeholder="165.00"
              value={newTrade.takeProfit}
              onChange={e => setNewTrade({ ...newTrade, takeProfit: e.target.value })}
              className="w-full bg-zinc-950 border border-emerald-500/30 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            disabled={isAdding}
            className="w-full md:w-auto bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-black font-bold px-8 h-[42px] rounded-xl flex items-center justify-center gap-2 transition-all"
          >
            {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Log Active Position
          </button>
        </div>
      </form>

      {/* Trades List */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : trades.length === 0 ? (
          <div className="text-center p-12 border border-dashed border-zinc-800 rounded-2xl">
            <p className="text-zinc-500">No active trades tracked. Add one above to start monitoring.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {trades.map((trade) => {
              const profit = trade.currentPrice ? (trade.currentPrice - trade.entryPrice) * trade.quantity : 0;
              const profitPercent = trade.currentPrice ? ((trade.currentPrice - trade.entryPrice) / trade.entryPrice) * 100 : 0;
              const isProfit = profit >= 0;

              return (
                <motion.div
                  layout
                  key={trade.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 group relative"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg",
                        isProfit ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                      )}>
                        {trade.symbol.substring(0, 2)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-lg">{trade.symbol}</span>
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded uppercase font-bold",
                            trade.type === 'buy' ? "bg-emerald-500/20 text-emerald-500" : "bg-rose-500/20 text-rose-500"
                          )}>
                            {trade.type}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-500">
                          Entry: ${trade.entryPrice?.toFixed(2) || '0.00'} × {trade.quantity || 0}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Risk/Reward</div>
                        <div className="flex items-center gap-2 text-xs font-mono">
                          <span className="text-rose-500">SL: ${trade.stopLoss?.toFixed(2) || '---'}</span>
                          <span className="text-zinc-700">|</span>
                          <span className="text-emerald-500">TP: ${trade.takeProfit?.toFixed(2) || '---'}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Current Price</div>
                        <div className="font-mono text-lg">
                          {trade.currentPrice ? `$${trade.currentPrice.toFixed(2)}` : '---'}
                        </div>
                      </div>
                      
                      <div className="text-right min-w-[100px]">
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">P&L</div>
                        <div className={cn(
                          "font-mono text-lg font-bold flex items-center justify-end gap-1",
                          isProfit ? "text-emerald-500" : "text-rose-500"
                        )}>
                          {isProfit ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                          {isProfit ? '+' : ''}{(profit || 0).toFixed(2)}
                          <span className="text-xs font-normal opacity-70 ml-1">
                            ({(profitPercent || 0).toFixed(2)}%)
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => getAiSuggestion(trade)}
                        disabled={trade.suggestionLoading || !trade.currentPrice}
                        className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                      >
                        {trade.suggestionLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <BrainCircuit className="w-4 h-4" />
                        )}
                        AI Signal
                      </button>
                      <button
                        onClick={() => handleDeleteTrade(trade.id)}
                        className="p-2 text-zinc-600 hover:text-rose-500 transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {trade.suggestion && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="mt-4 pt-4 border-t border-zinc-800/50"
                      >
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 flex gap-3">
                          <div className="mt-0.5">
                            <BrainCircuit className="w-4 h-4 text-emerald-500" />
                          </div>
                          <p className="text-sm text-zinc-300 italic">
                            "{trade.suggestion}"
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Wallet(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </svg>
  )
}

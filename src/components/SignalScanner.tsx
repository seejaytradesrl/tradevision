import React, { useState } from 'react';
import { 
  Clock, Search, Upload, BrainCircuit, 
  ArrowRight, Target, Shield, AlertCircle,
  Loader2, Camera, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { cn } from '../lib/utils';
import { RiskProfile } from '../types';

interface SignalScannerProps {
  onTradeLogged?: (trade: any) => void;
  riskProfile?: RiskProfile;
}

export default function SignalScanner({ onTradeLogged, riskProfile }: SignalScannerProps) {
  const [duration, setDuration] = useState<'5m' | '15m' | '1h'>('15m');
  const [scanning, setScanning] = useState(false);
  const [targetStock, setTargetStock] = useState<{ symbol: string; reason: string } | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    setAnalysis(null);
    setImage(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const model = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `I want to perform a ${duration} trade. 
        Suggest one high-volatility US stock or crypto ticker that is currently showing interesting technical patterns for this timeframe.
        Return the response in JSON format: { "symbol": "TICKER", "reason": "Short explanation why" }`,
        config: { responseMimeType: "application/json" }
      });

      const response = await model;
      const data = JSON.parse(response.text);
      setTargetStock(data);
    } catch (err) {
      console.error("Scan error:", err);
      setError("Failed to generate a target. Please try again.");
    } finally {
      setScanning(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const runAnalysis = async () => {
    if (!image || !targetStock) return;
    setAnalyzing(true);
    setError(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const model = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: image.split(',')[1]
            }
          },
          {
            text: `Analyze this ${duration} chart for ${targetStock.symbol}. 
            Based on technical indicators (RSI, MACD, Support/Resistance) visible in the screenshot:
            1. Determine the best Action (BUY, SELL, or WAIT).
            2. Provide Entry Price, Stop Loss, and Take Profit.
            3. Give a 1-sentence technical justification.
            
            IMPORTANT: The user has a ${riskProfile?.tolerance || 'medium'} risk tolerance and risks ${riskProfile?.maxRiskPerTrade || 2}% per trade. Adjust the Stop Loss and Take Profit tightness accordingly.
            
            Return JSON: { "action": "BUY|SELL|WAIT", "entry": number, "stopLoss": number, "takeProfit": number, "reason": "string", "confidence": number }`
          }
        ],
        config: { responseMimeType: "application/json" }
      });

      const response = await model;
      const result = JSON.parse(response.text);
      setAnalysis(result);
    } catch (err) {
      console.error("Analysis error:", err);
      setError("Failed to analyze the screenshot. Ensure the chart is clear.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl overflow-hidden">
      <div className="p-6 border-b border-zinc-800 bg-zinc-900/30">
        <div className="flex items-center gap-3 mb-1">
          <Sparkles className="w-5 h-5 text-emerald-500" />
          <h2 className="text-xl font-bold">AI Signal Scanner</h2>
        </div>
        <p className="text-sm text-zinc-500">Pick a timeframe and let AI find your next setup</p>
      </div>

      <div className="p-6 space-y-8">
        {/* Step 1: Duration & Scan */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
            <Clock className="w-3 h-3" />
            Step 1: Select Trade Speed
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(['5m', '15m', '1h'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={cn(
                  "py-3 rounded-2xl border font-bold transition-all",
                  duration === d 
                    ? "bg-emerald-500 border-emerald-400 text-black shadow-[0_0_20px_rgba(16,185,129,0.2)]" 
                    : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                )}
              >
                {d === '5m' ? 'Scalp (5m)' : d === '15m' ? 'Intraday (15m)' : 'Swing (1h)'}
              </button>
            ))}
          </div>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="w-full bg-zinc-100 hover:bg-white text-black font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {scanning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
            {scanning ? 'Scanning Markets...' : 'Scan for Opportunities'}
          </button>
        </div>

        {/* Step 2: Target & Upload */}
        <AnimatePresence mode="wait">
          {targetStock && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6 pt-6 border-t border-zinc-800"
            >
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-emerald-500 uppercase tracking-widest">AI Target Found</span>
                  <span className="text-[10px] text-zinc-500 font-mono">Timeframe: {duration}</span>
                </div>
                <h3 className="text-2xl font-black mb-1">{targetStock.symbol}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{targetStock.reason}</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
                  <Camera className="w-3 h-3" />
                  Step 2: Upload {targetStock.symbol} Chart
                </div>
                
                <label className="block group">
                  <div className={cn(
                    "border-2 border-dashed border-zinc-800 rounded-2xl p-8 text-center cursor-pointer transition-all group-hover:border-emerald-500/50 group-hover:bg-emerald-500/5",
                    image && "border-emerald-500/30 bg-emerald-500/5"
                  )}>
                    <input type="file" className="hidden" onChange={handleImageUpload} accept="image/*" />
                    {image ? (
                      <div className="relative inline-block">
                        <img src={image} alt="Chart" className="max-h-64 rounded-xl shadow-2xl border border-zinc-800" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                          <p className="text-white text-xs font-bold">Change Image</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 py-4">
                        <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center">
                          <Upload className="w-6 h-6 text-zinc-500" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-zinc-300">Upload Screenshot</p>
                          <p className="text-xs text-zinc-500 mt-1">Drag and drop or click to browse</p>
                        </div>
                      </div>
                    )}
                  </div>
                </label>

                {image && (
                  <button
                    onClick={runAnalysis}
                    disabled={analyzing}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  >
                    {analyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <BrainCircuit className="w-5 h-5" />}
                    {analyzing ? 'AI Analyzing Chart...' : 'Generate Trade Setup'}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step 3: Results */}
        <AnimatePresence>
          {analysis && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="pt-6 border-t border-zinc-800 space-y-4"
            >
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
                <Target className="w-3 h-3" />
                Step 3: AI Execution Plan
              </div>

              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div className={cn(
                    "px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase",
                    analysis.action === 'BUY' ? "bg-emerald-500 text-black" : 
                    analysis.action === 'SELL' ? "bg-rose-500 text-white" : "bg-zinc-800 text-zinc-400"
                  )}>
                    {analysis.action} SIGNAL
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-zinc-500 font-bold uppercase">Confidence</p>
                    <p className="text-emerald-500 font-mono font-bold">{analysis.confidence}%</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
                    <p className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Entry</p>
                    <p className="font-mono text-lg font-bold">${analysis.entry}</p>
                  </div>
                  <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
                    <p className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Stop Loss</p>
                    <p className="font-mono text-lg font-bold text-rose-500">${analysis.stopLoss}</p>
                  </div>
                  <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
                    <p className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Take Profit</p>
                    <p className="font-mono text-lg font-bold text-emerald-500">${analysis.takeProfit}</p>
                  </div>
                </div>

                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4">
                  <p className="text-sm text-zinc-300 leading-relaxed italic">
                    "{analysis.reason}"
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex items-center gap-3 text-rose-500 text-sm">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

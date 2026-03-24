export interface MarketData {
  quote: {
    c: number; // Current price
    d: number; // Change
    dp: number; // Percent change
    h: number; // High
    l: number; // Low
    o: number; // Open
    pc: number; // Previous close
  };
  candles: {
    c: number[]; // Close prices
    h: number[]; // High prices
    l: number[]; // Low prices
    o: number[]; // Open prices
    t: number[]; // Timestamps
    v: number[]; // Volumes
    s: string;   // Status
  };
}

export interface RiskProfile {
  tolerance: 'low' | 'medium' | 'high';
  capital: number;
  maxRiskPerTrade: number; // Percentage
}

export interface TradeAnalysis {
  action: 'BUY' | 'SELL' | 'HOLD';
  entry: number;
  stopLoss: number;
  takeProfit: number;
  reasoning: string;
  strategy: string;
  confidence: number;
}

export interface TrendingStock {
  symbol: string;
  c: number; // Current
  d: number; // Change
  dp: number; // Percent change
  h: number; // High
  l: number; // Low
  o: number; // Open
  pc: number; // Prev Close
}

export interface DayTradeSuggestion {
  symbol: string;
  reason: string;
  trend: 'UP' | 'DOWN' | 'NEUTRAL';
  volatility: 'LOW' | 'MEDIUM' | 'HIGH';
  sentiment: string;
}

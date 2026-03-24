import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API routes
  app.get(["/api/market-data/:symbol", "/api/market-data/:symbol/"], async (req, res) => {
    const { symbol } = req.params;
    const apiKey = process.env.FINNHUB_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "FINNHUB_API_KEY not configured" });
    }

    try {
      // Fetch quote
      const quoteResponse = await axios.get(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`);
      
      if (quoteResponse.status === 403) {
        return res.status(403).json({ error: "FINNHUB_API_FORBIDDEN", message: "API key is invalid or restricted for this symbol." });
      }

      // Fetch some historical data for the chart (last 30 days)
      const end = Math.floor(Date.now() / 1000);
      const start = end - (30 * 24 * 60 * 60);
      
      let candlesData = { c: [], h: [], l: [], o: [], t: [], v: [], s: "no_data", error: null as string | null };
      try {
        const candlesResponse = await axios.get(`https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${start}&to=${end}&token=${apiKey}`);
        if (candlesResponse.data.s === 'no_data') {
          candlesData.s = 'no_data';
        } else {
          candlesData = { ...candlesResponse.data, error: null };
        }
      } catch (candleError: any) {
        const isForbidden = candleError.response?.status === 403;
        candlesData.error = isForbidden ? "RESTRICTED" : "UNAVAILABLE";
        console.log(`Candle data ${isForbidden ? 'restricted' : 'unavailable'} for ${symbol}`);
      }

      res.json({
        quote: quoteResponse.data,
        candles: candlesData
      });
    } catch (error: any) {
      console.error("Error fetching market data:", error.response?.data || error.message);
      const status = error.response?.status || 500;
      const message = error.response?.data?.error || "Failed to fetch market data";
      
      if (status === 403) {
        return res.status(403).json({ error: "FINNHUB_API_FORBIDDEN", message });
      }
      
      res.status(status).json({ error: message });
    }
  });

  // Trending stocks for day trading
  app.get(["/api/trending-stocks", "/api/trending-stocks/"], async (req, res) => {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "FINNHUB_API_KEY not configured" });
    }

    const symbols = ['AAPL', 'TSLA', 'NVDA', 'AMD', 'MSFT', 'AMZN', 'META', 'GOOGL', 'NFLX', 'COIN'];
    
    try {
      const quotes = await Promise.all(symbols.map(async (symbol) => {
        try {
          const response = await axios.get(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`);
          return {
            symbol,
            ...response.data
          };
        } catch (e) {
          return { symbol, error: true };
        }
      }));

      res.json(quotes.filter(q => !q.error));
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch trending stocks" });
    }
  });

  // API 404 handler - prevents falling through to SPA HTML fallback for missing API routes
  app.all("/api/*", (req, res) => {
    res.status(404).json({ 
      error: "API route not found", 
      path: req.path,
      message: "The requested API endpoint does not exist."
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Unhandled Server Error:", err);
    res.status(500).json({ error: "Internal Server Error", message: err.message });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

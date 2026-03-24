import { GoogleGenAI, Type } from "@google/genai";
import { TradeAnalysis, RiskProfile, TrendingStock, DayTradeSuggestion } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function getTrendingSuggestions(stocks: TrendingStock[]): Promise<DayTradeSuggestion[]> {
  const modelName = "gemini-3.1-flash-lite-preview";
  
  const prompt = `
    You are a professional day trader. Analyze the following real-time stock data and suggest the top 3 stocks to trade right now.
    
    Data:
    ${stocks.map(s => `${s.symbol}: Price $${s.c}, Change ${s.dp.toFixed(2)}%, High $${s.h}, Low $${s.l}`).join('\n')}
    
    For each suggestion, provide:
    1. Symbol
    2. Reason (why it's a good trade now)
    3. Trend (UP, DOWN, or NEUTRAL)
    4. Volatility (LOW, MEDIUM, or HIGH)
    5. Sentiment (Short summary of market mood for this stock)
    
    Focus on high volatility and clear momentum for day trading.
  `;

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            symbol: { type: Type.STRING },
            reason: { type: Type.STRING },
            trend: { type: Type.STRING, enum: ["UP", "DOWN", "NEUTRAL"] },
            volatility: { type: Type.STRING, enum: ["LOW", "MEDIUM", "HIGH"] },
            sentiment: { type: Type.STRING }
          },
          required: ["symbol", "reason", "trend", "volatility", "sentiment"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || '[]') as DayTradeSuggestion[];
  } catch (e) {
    console.error("Failed to parse trending suggestions:", e);
    return [];
  }
}

export async function analyzeChart(
  imageBase64: string, 
  riskProfile: RiskProfile,
  marketContext?: string
): Promise<TradeAnalysis> {
  console.log("Starting analyzeChart...");
  const modelName = "gemini-3.1-pro-preview";
  
  try {
    const prompt = `
      You are a superior daytrader with expert knowledge of market mechanics, technical analysis, and risk management.
      Analyze the provided stock market chart screenshot.
      
      User Risk Profile:
      - Tolerance: ${riskProfile.tolerance}
      - Capital: $${riskProfile.capital}
      - Max Risk Per Trade: ${riskProfile.maxRiskPerTrade}%
      
      Market Context: ${marketContext || 'No additional context provided.'}
      
      Provide a detailed trading recommendation.
    `;

    // Extract mimeType and data from base64 string
    const mimeTypeMatch = imageBase64.match(/^data:(image\/[a-z]+);base64,/);
    const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/png";
    const data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");

    console.log("Sending request to Gemini API with model:", modelName);
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            action: {
              type: Type.STRING,
              enum: ["BUY", "SELL", "HOLD"],
              description: "The recommended trading action."
            },
            entry: {
              type: Type.NUMBER,
              description: "The ideal price to enter the trade."
            },
            stopLoss: {
              type: Type.NUMBER,
              description: "Where to exit if the trade goes against us."
            },
            takeProfit: {
              type: Type.NUMBER,
              description: "Target price for profit taking."
            },
            reasoning: {
              type: Type.STRING,
              description: "A technical explanation of why this trade makes sense."
            },
            strategy: {
              type: Type.STRING,
              description: "Which technical strategy is most appropriate here."
            },
            confidence: {
              type: Type.NUMBER,
              description: "A percentage score of your confidence in this setup (0-100)."
            }
          },
          required: ["action", "entry", "stopLoss", "takeProfit", "reasoning", "strategy", "confidence"]
        }
      }
    });

    console.log("Received response from Gemini API");
    const text = response.text;
    if (!text) {
      console.error("Empty response text from Gemini API");
      throw new Error("No response from AI");
    }
    
    console.log("Parsing AI response...");
    return JSON.parse(text) as TradeAnalysis;
  } catch (e: any) {
    console.error("Gemini API Error:", e);
    if (e.message?.includes("API_KEY_INVALID")) {
      throw new Error("Invalid Gemini API Key. Please check your secrets.");
    }
    throw new Error(e.message || "AI analysis failed to generate valid data.");
  }
}

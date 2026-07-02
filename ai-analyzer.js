/**
 * AI Analyzer using OpenRouter API
 * Provides intelligent market analysis and sentiment
 */

const https = require('https');
const config = require('./config');

class AIAnalyzer {
  constructor() {
    this.enabled = config.openrouter && config.openrouter.enabled;
    this.apiKey = config.openrouter?.apiKey;
    this.model = config.openrouter?.model || 'anthropic/claude-3.5-sonnet';
  }

  async makeRequest(prompt, maxTokens = 2000) {
    if (!this.enabled || !this.apiKey || this.apiKey === 'YOUR_OPENROUTER_API_KEY_HERE') {
      return null;
    }

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert crypto futures trader specializing in technical analysis and market microstructure. Provide concise, actionable analysis based on the data provided. Focus on probability and risk/reward.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxTokens,
        temperature: config.openrouter.temperature || 0.3,
      });

      const options = {
        hostname: 'openrouter.ai',
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/crypto-trading-analyzer',
          'X-Title': 'Crypto Trading Analyzer',
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.choices && response.choices[0]) {
              resolve(response.choices[0].message.content);
            } else {
              reject(new Error('Invalid response format'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  buildAnalysisPrompt(symbol, technicalData, advancedData) {
    const {
      price,
      priceChange24h,
      rsi,
      ema20,
      ema50,
      macd,
      bb,
      orderBook,
      volume,
    } = technicalData;

    const {
      openInterest,
      openInterestChange,
      longShortRatio,
      topTraderRatio,
      fundingRate,
      liquidations24h,
      cvd,
    } = advancedData;

    return `Analyze ${symbol} for futures trading:

PRICE & TREND:
- Current Price: $${price.toFixed(4)} (${priceChange24h >= 0 ? '+' : ''}${priceChange24h.toFixed(2)}% 24h)
- EMA20: $${ema20?.toFixed(4)} | EMA50: $${ema50?.toFixed(4)}
- Price ${price > ema20 ? 'above' : 'below'} EMA20, ${price > ema50 ? 'above' : 'below'} EMA50

MOMENTUM:
- RSI: ${rsi?.toFixed(2)} ${rsi < 35 ? '(OVERSOLD)' : rsi > 65 ? '(OVERBOUGHT)' : '(NEUTRAL)'}
- MACD: ${macd?.macdLine.toFixed(6)} (${macd?.macdLine > 0 ? 'Bullish' : 'Bearish'})
- Bollinger: Price ${price > bb?.upper ? 'above upper' : price < bb?.lower ? 'below lower' : 'inside'} bands

ORDER BOOK:
- Bid/Ask Ratio: ${orderBook?.bidAskRatio?.toFixed(2)} (${orderBook?.pressure})
- Volume 24h: ${(volume / 1000000).toFixed(2)}M

FUTURES DATA:
${openInterest ? `- Open Interest: $${(openInterest / 1000000).toFixed(2)}M (${openInterestChange >= 0 ? '+' : ''}${openInterestChange?.toFixed(2)}%)` : ''}
${longShortRatio ? `- Long/Short Ratio: ${longShortRatio.toFixed(2)} (${longShortRatio > 2 ? 'Too many longs (bearish)' : longShortRatio < 0.5 ? 'Too many shorts (bullish)' : 'Balanced'})` : ''}
${topTraderRatio ? `- Top Trader Ratio: ${topTraderRatio.toFixed(2)}` : ''}
${fundingRate ? `- Funding Rate: ${(fundingRate * 100).toFixed(4)}% ${fundingRate > 0 ? '(Longs pay shorts)' : '(Shorts pay longs)'}` : ''}
${liquidations24h ? `- 24h Liquidations: $${(liquidations24h / 1000000).toFixed(2)}M` : ''}
${cvd !== null ? `- CVD (Cumulative Volume Delta): ${cvd > 0 ? '+' : ''}${(cvd / 1000000).toFixed(2)}M` : ''}

Provide:
1. Signal (BUY/SELL/HOLD) with confidence (0-100%)
2. Key factors supporting your decision (max 3)
3. Risk level (LOW/MEDIUM/HIGH)
4. Suggested stop loss % and take profit %
5. One-sentence market regime (trending/ranging/volatile)

Keep response under 200 words.`;
  }

  async analyzeMarket(symbol, technicalData, advancedData) {
    try {
      if (!this.enabled) {
        return null;
      }

      const prompt = this.buildAnalysisPrompt(symbol, technicalData, advancedData);
      const analysis = await this.makeRequest(prompt, 1500);

      if (!analysis) {
        return null;
      }

      // Parse AI response
      return {
        rawAnalysis: analysis,
        signal: this.extractSignal(analysis),
        confidence: this.extractConfidence(analysis),
        keyFactors: this.extractKeyFactors(analysis),
        riskLevel: this.extractRiskLevel(analysis),
        stopLoss: this.extractStopLoss(analysis),
        takeProfit: this.extractTakeProfit(analysis),
        marketRegime: this.extractMarketRegime(analysis),
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error(`❌ AI Analysis error for ${symbol}:`, error.message);
      return null;
    }
  }

  extractSignal(text) {
    const signalMatch = text.match(/Signal[:\s]*(BUY|SELL|HOLD)/i);
    return signalMatch ? signalMatch[1].toUpperCase() : 'HOLD';
  }

  extractConfidence(text) {
    const confidenceMatch = text.match(/confidence[:\s]*(\d+)%?/i);
    return confidenceMatch ? parseInt(confidenceMatch[1]) : 50;
  }

  extractKeyFactors(text) {
    const factors = [];
    const lines = text.split('\n');

    for (const line of lines) {
      if (line.match(/^\d+\.|^-|^•/) && !line.match(/Signal|confidence|Risk|stop|take|regime/i)) {
        factors.push(line.replace(/^\d+\.\s*|^-\s*|^•\s*/g, '').trim());
      }
    }

    return factors.slice(0, 3);
  }

  extractRiskLevel(text) {
    const riskMatch = text.match(/Risk[:\s]*(LOW|MEDIUM|HIGH)/i);
    return riskMatch ? riskMatch[1].toUpperCase() : 'MEDIUM';
  }

  extractStopLoss(text) {
    const slMatch = text.match(/stop\s*loss[:\s]*(\d+\.?\d*)%?/i);
    return slMatch ? parseFloat(slMatch[1]) : 3;
  }

  extractTakeProfit(text) {
    const tpMatch = text.match(/take\s*profit[:\s]*(\d+\.?\d*)%?/i);
    return tpMatch ? parseFloat(tpMatch[1]) : 6;
  }

  extractMarketRegime(text) {
    const regimeMatch = text.match(/regime[:\s]*(trending|ranging|volatile)/i);
    return regimeMatch ? regimeMatch[1].toLowerCase() : 'unknown';
  }

  async getMarketSentiment(symbols, topMovers) {
    try {
      if (!this.enabled || !symbols || symbols.length === 0) {
        return null;
      }

      const moversText = topMovers
        .slice(0, 5)
        .map(m => `${m.symbol}: ${m.change >= 0 ? '+' : ''}${m.change.toFixed(2)}%`)
        .join(', ');

      const prompt = `Overall crypto market sentiment analysis:

Top movers (24h): ${moversText}

Total symbols monitored: ${symbols.length}

Provide:
1. Overall market sentiment (BULLISH/BEARISH/NEUTRAL) with confidence
2. Market conditions (risk-on/risk-off)
3. Which sectors are showing strength (DeFi, L1/L2, Memes, AI)
4. Key risk factors
5. Trading recommendation (aggressive/moderate/conservative)

Keep under 150 words.`;

      const sentiment = await this.makeRequest(prompt, 1000);

      return {
        analysis: sentiment,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('❌ Market sentiment error:', error.message);
      return null;
    }
  }
}

module.exports = new AIAnalyzer();

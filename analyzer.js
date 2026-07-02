#!/usr/bin/env node

/**
 * Crypto Market Analysis & Signal Generator
 * Analyzes real-time market data and provides trading signals
 */

const https = require('https');

// Configuration
const CONFIG = {
  symbol: 'XLMUSDT',
  intervals: ['5m', '15m', '1h', '4h'],
  analysisInterval: 60000, // Run analysis every 60 seconds
};

// Fetch data from Binance API
function fetchData(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Get current ticker price
async function getCurrentPrice(symbol) {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
  return await fetchData(url);
}

// Get klines (candlestick) data
async function getKlines(symbol, interval, limit = 100) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  return await fetchData(url);
}

// Get order book depth
async function getOrderBook(symbol, limit = 100) {
  const url = `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=${limit}`;
  return await fetchData(url);
}

// Calculate Simple Moving Average (SMA)
function calculateSMA(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((sum, price) => sum + price, 0) / period;
}

// Calculate Exponential Moving Average (EMA)
function calculateEMA(prices, period) {
  if (prices.length < period) return null;
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((sum, price) => sum + price, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  return ema;
}

// Calculate RSI (Relative Strength Index)
function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;

  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  let gains = 0;
  let losses = 0;

  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) gains += changes[i];
    else losses -= changes[i];
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period; i < changes.length; i++) {
    if (changes[i] > 0) {
      avgGain = (avgGain * (period - 1) + changes[i]) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - changes[i]) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Calculate MACD (Moving Average Convergence Divergence)
function calculateMACD(prices) {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);

  if (!ema12 || !ema26) return null;

  const macdLine = ema12 - ema26;
  return { macdLine, ema12, ema26 };
}

// Calculate Bollinger Bands
function calculateBollingerBands(prices, period = 20, stdDev = 2) {
  if (prices.length < period) return null;

  const sma = calculateSMA(prices, period);
  const slice = prices.slice(-period);

  const squaredDiffs = slice.map(price => Math.pow(price - sma, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / period;
  const standardDeviation = Math.sqrt(variance);

  return {
    upper: sma + (standardDeviation * stdDev),
    middle: sma,
    lower: sma - (standardDeviation * stdDev),
  };
}

// Analyze order book for support/resistance
function analyzeOrderBook(orderBook, currentPrice) {
  const bids = orderBook.bids.map(b => ({ price: parseFloat(b[0]), qty: parseFloat(b[1]) }));
  const asks = orderBook.asks.map(a => ({ price: parseFloat(a[0]), qty: parseFloat(a[1]) }));

  // Find large orders (walls)
  const bidVolumes = bids.map(b => b.qty);
  const askVolumes = asks.map(a => a.qty);
  const avgBidVol = bidVolumes.reduce((sum, v) => sum + v, 0) / bidVolumes.length;
  const avgAskVol = askVolumes.reduce((sum, v) => sum + v, 0) / askVolumes.length;

  const bidWalls = bids.filter(b => b.qty > avgBidVol * 3);
  const askWalls = asks.filter(a => a.qty > avgAskVol * 3);

  const totalBidVolume = bids.reduce((sum, b) => sum + b.qty, 0);
  const totalAskVolume = asks.reduce((sum, a) => sum + a.qty, 0);
  const bidAskRatio = totalBidVolume / totalAskVolume;

  return {
    bidWalls: bidWalls.slice(0, 3),
    askWalls: askWalls.slice(0, 3),
    bidAskRatio,
    pressure: bidAskRatio > 1.2 ? 'BULLISH' : bidAskRatio < 0.8 ? 'BEARISH' : 'NEUTRAL',
  };
}

// Generate trading signal based on technical analysis
function generateSignal(analysis) {
  const signals = [];
  let bullishScore = 0;
  let bearishScore = 0;

  // RSI Analysis
  if (analysis.rsi < 30) {
    signals.push({ indicator: 'RSI', signal: 'BULLISH', reason: `RSI ${analysis.rsi.toFixed(2)} - Oversold` });
    bullishScore += 2;
  } else if (analysis.rsi > 70) {
    signals.push({ indicator: 'RSI', signal: 'BEARISH', reason: `RSI ${analysis.rsi.toFixed(2)} - Overbought` });
    bearishScore += 2;
  } else if (analysis.rsi >= 30 && analysis.rsi <= 40) {
    signals.push({ indicator: 'RSI', signal: 'BULLISH', reason: `RSI ${analysis.rsi.toFixed(2)} - Approaching oversold` });
    bullishScore += 1;
  } else if (analysis.rsi >= 60 && analysis.rsi <= 70) {
    signals.push({ indicator: 'RSI', signal: 'BEARISH', reason: `RSI ${analysis.rsi.toFixed(2)} - Approaching overbought` });
    bearishScore += 1;
  }

  // Moving Average Analysis
  if (analysis.price > analysis.ema20 && analysis.ema20 > analysis.ema50) {
    signals.push({ indicator: 'EMA', signal: 'BULLISH', reason: 'Price above EMA20 & EMA50 (uptrend)' });
    bullishScore += 2;
  } else if (analysis.price < analysis.ema20 && analysis.ema20 < analysis.ema50) {
    signals.push({ indicator: 'EMA', signal: 'BEARISH', reason: 'Price below EMA20 & EMA50 (downtrend)' });
    bearishScore += 2;
  }

  // Bollinger Bands Analysis
  if (analysis.price < analysis.bb.lower) {
    signals.push({ indicator: 'BB', signal: 'BULLISH', reason: 'Price below lower Bollinger Band' });
    bullishScore += 1.5;
  } else if (analysis.price > analysis.bb.upper) {
    signals.push({ indicator: 'BB', signal: 'BEARISH', reason: 'Price above upper Bollinger Band' });
    bearishScore += 1.5;
  }

  // MACD Analysis
  if (analysis.macd && analysis.macd.macdLine > 0) {
    signals.push({ indicator: 'MACD', signal: 'BULLISH', reason: 'MACD line positive' });
    bullishScore += 1;
  } else if (analysis.macd && analysis.macd.macdLine < 0) {
    signals.push({ indicator: 'MACD', signal: 'BEARISH', reason: 'MACD line negative' });
    bearishScore += 1;
  }

  // Order Book Analysis
  if (analysis.orderBook.pressure === 'BULLISH') {
    signals.push({ indicator: 'OrderBook', signal: 'BULLISH', reason: `Bid/Ask ratio ${analysis.orderBook.bidAskRatio.toFixed(2)} - More buyers` });
    bullishScore += 1.5;
  } else if (analysis.orderBook.pressure === 'BEARISH') {
    signals.push({ indicator: 'OrderBook', signal: 'BEARISH', reason: `Bid/Ask ratio ${analysis.orderBook.bidAskRatio.toFixed(2)} - More sellers` });
    bearishScore += 1.5;
  }

  // Volume Analysis
  if (analysis.volumeChange > 50) {
    const signal = bullishScore > bearishScore ? 'BULLISH' : 'BEARISH';
    signals.push({ indicator: 'Volume', signal, reason: `Volume spike +${analysis.volumeChange.toFixed(1)}%` });
    if (signal === 'BULLISH') bullishScore += 1;
    else bearishScore += 1;
  }

  // Calculate final signal
  const netScore = bullishScore - bearishScore;
  let action = 'HOLD';
  let confidence = 'LOW';

  if (netScore >= 4) {
    action = 'STRONG BUY';
    confidence = 'HIGH';
  } else if (netScore >= 2) {
    action = 'BUY';
    confidence = 'MEDIUM';
  } else if (netScore <= -4) {
    action = 'STRONG SELL';
    confidence = 'HIGH';
  } else if (netScore <= -2) {
    action = 'SELL';
    confidence = 'MEDIUM';
  } else {
    confidence = 'LOW';
  }

  return {
    action,
    confidence,
    bullishScore,
    bearishScore,
    netScore,
    signals,
  };
}

// Calculate support and resistance levels
function calculateLevels(klines, currentPrice) {
  const highs = klines.map(k => parseFloat(k[2]));
  const lows = klines.map(k => parseFloat(k[3]));

  // Find pivot points
  const pivots = [];
  for (let i = 2; i < highs.length - 2; i++) {
    // Resistance
    if (highs[i] > highs[i-1] && highs[i] > highs[i-2] &&
        highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
      pivots.push({ price: highs[i], type: 'resistance' });
    }
    // Support
    if (lows[i] < lows[i-1] && lows[i] < lows[i-2] &&
        lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
      pivots.push({ price: lows[i], type: 'support' });
    }
  }

  // Get nearest levels
  const resistances = pivots
    .filter(p => p.type === 'resistance' && p.price > currentPrice)
    .sort((a, b) => a.price - b.price)
    .slice(0, 3);

  const supports = pivots
    .filter(p => p.type === 'support' && p.price < currentPrice)
    .sort((a, b) => b.price - a.price)
    .slice(0, 3);

  return { supports, resistances };
}

// Main analysis function
async function analyzeMarket(symbol) {
  try {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 ANALYZING ${symbol} - ${new Date().toLocaleString()}`);
    console.log('='.repeat(80));

    // Fetch all data in parallel
    const [ticker, klines1h, klines4h, orderBook] = await Promise.all([
      getCurrentPrice(symbol),
      getKlines(symbol, '1h', 100),
      getKlines(symbol, '4h', 100),
      getOrderBook(symbol, 100),
    ]);

    const currentPrice = parseFloat(ticker.lastPrice);
    const priceChange24h = parseFloat(ticker.priceChangePercent);
    const volume24h = parseFloat(ticker.volume);
    const quoteVolume24h = parseFloat(ticker.quoteVolume);

    // Extract closing prices
    const closes1h = klines1h.map(k => parseFloat(k[4]));
    const closes4h = klines4h.map(k => parseFloat(k[4]));

    // Calculate volume change
    const avgVolume = klines1h.slice(0, -1).reduce((sum, k) => sum + parseFloat(k[5]), 0) / (klines1h.length - 1);
    const currentVolume = parseFloat(klines1h[klines1h.length - 1][5]);
    const volumeChange = ((currentVolume - avgVolume) / avgVolume) * 100;

    // Technical indicators
    const rsi = calculateRSI(closes1h, 14);
    const ema20 = calculateEMA(closes1h, 20);
    const ema50 = calculateEMA(closes1h, 50);
    const macd = calculateMACD(closes1h);
    const bb = calculateBollingerBands(closes1h, 20, 2);
    const orderBookAnalysis = analyzeOrderBook(orderBook, currentPrice);
    const levels = calculateLevels(klines4h, currentPrice);

    const analysis = {
      symbol,
      price: currentPrice,
      priceChange24h,
      volume24h,
      volumeChange,
      rsi,
      ema20,
      ema50,
      macd,
      bb,
      orderBook: orderBookAnalysis,
      levels,
    };

    // Generate signal
    const signal = generateSignal(analysis);

    // Display results
    console.log(`\n📊 MARKET DATA:`);
    console.log(`   Price: $${currentPrice.toFixed(4)} (${priceChange24h >= 0 ? '+' : ''}${priceChange24h.toFixed(2)}%)`);
    console.log(`   24h Volume: ${(volume24h / 1000000).toFixed(2)}M ${symbol.replace('USDT', '')} ($${(quoteVolume24h / 1000000).toFixed(2)}M)`);
    console.log(`   Volume Change: ${volumeChange >= 0 ? '+' : ''}${volumeChange.toFixed(1)}%`);

    console.log(`\n📈 TECHNICAL INDICATORS:`);
    console.log(`   RSI (14): ${rsi.toFixed(2)} ${rsi < 30 ? '🔥 OVERSOLD' : rsi > 70 ? '⚠️  OVERBOUGHT' : ''}`);
    console.log(`   EMA 20: $${ema20.toFixed(4)} ${currentPrice > ema20 ? '✅' : '❌'}`);
    console.log(`   EMA 50: $${ema50.toFixed(4)} ${currentPrice > ema50 ? '✅' : '❌'}`);
    console.log(`   MACD Line: ${macd.macdLine.toFixed(6)} ${macd.macdLine > 0 ? '✅ Bullish' : '❌ Bearish'}`);
    console.log(`   Bollinger Bands:`);
    console.log(`      Upper: $${bb.upper.toFixed(4)}`);
    console.log(`      Middle: $${bb.middle.toFixed(4)}`);
    console.log(`      Lower: $${bb.lower.toFixed(4)}`);
    console.log(`      Position: ${currentPrice > bb.upper ? 'Above (Overbought)' : currentPrice < bb.lower ? 'Below (Oversold)' : 'Inside'}`);

    console.log(`\n📖 ORDER BOOK:`);
    console.log(`   Bid/Ask Ratio: ${orderBookAnalysis.bidAskRatio.toFixed(2)} (${orderBookAnalysis.pressure})`);
    if (orderBookAnalysis.bidWalls.length > 0) {
      console.log(`   Buy Walls:`);
      orderBookAnalysis.bidWalls.forEach(w => console.log(`      $${w.price.toFixed(4)} - ${w.qty.toFixed(0)} ${symbol.replace('USDT', '')}`));
    }
    if (orderBookAnalysis.askWalls.length > 0) {
      console.log(`   Sell Walls:`);
      orderBookAnalysis.askWalls.forEach(w => console.log(`      $${w.price.toFixed(4)} - ${w.qty.toFixed(0)} ${symbol.replace('USDT', '')}`));
    }

    console.log(`\n🎯 SUPPORT & RESISTANCE:`);
    if (levels.supports.length > 0) {
      console.log(`   Support Levels:`);
      levels.supports.forEach((s, i) => console.log(`      S${i+1}: $${s.price.toFixed(4)} (${((currentPrice - s.price) / currentPrice * 100).toFixed(2)}% below)`));
    }
    if (levels.resistances.length > 0) {
      console.log(`   Resistance Levels:`);
      levels.resistances.forEach((r, i) => console.log(`      R${i+1}: $${r.price.toFixed(4)} (${((r.price - currentPrice) / currentPrice * 100).toFixed(2)}% above)`));
    }

    console.log(`\n🎲 TRADING SIGNALS:`);
    signal.signals.forEach(s => {
      const icon = s.signal === 'BULLISH' ? '🟢' : '🔴';
      console.log(`   ${icon} ${s.indicator}: ${s.reason}`);
    });

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n🚦 RECOMMENDATION: ${signal.action}`);
    console.log(`   Confidence: ${signal.confidence}`);
    console.log(`   Score: Bullish ${signal.bullishScore} | Bearish ${signal.bearishScore} | Net ${signal.netScore}`);

    if (signal.action.includes('BUY')) {
      const entryPrice = currentPrice;
      const stopLoss = levels.supports.length > 0 ? levels.supports[0].price * 0.998 : currentPrice * 0.97;
      const takeProfit = levels.resistances.length > 0 ? levels.resistances[0].price : currentPrice * 1.03;
      const riskReward = (takeProfit - entryPrice) / (entryPrice - stopLoss);

      console.log(`\n💰 TRADE SETUP:`);
      console.log(`   Entry: $${entryPrice.toFixed(4)}`);
      console.log(`   Stop Loss: $${stopLoss.toFixed(4)} (-${((entryPrice - stopLoss) / entryPrice * 100).toFixed(2)}%)`);
      console.log(`   Take Profit: $${takeProfit.toFixed(4)} (+${((takeProfit - entryPrice) / entryPrice * 100).toFixed(2)}%)`);
      console.log(`   Risk/Reward: 1:${riskReward.toFixed(2)}`);
      console.log(`\n   ⚠️  Suggested Position Size: 1-2% of portfolio (adjust based on your risk tolerance)`);
    } else if (signal.action.includes('SELL')) {
      const exitPrice = currentPrice;
      console.log(`\n💰 EXIT SETUP:`);
      console.log(`   Exit Price: $${exitPrice.toFixed(4)}`);
      console.log(`   Consider exiting positions or taking profits`);
      if (levels.supports.length > 0) {
        console.log(`   Watch support at: $${levels.supports[0].price.toFixed(4)}`);
      }
    } else {
      console.log(`\n   💤 No strong signal at this time. Wait for better setup.`);
    }

    console.log(`\n${'='.repeat(80)}\n`);

  } catch (error) {
    console.error('❌ Error analyzing market:', error.message);
  }
}

// Run continuous analysis
async function runContinuousAnalysis() {
  console.log('🚀 Crypto Market Analyzer Started');
  console.log(`📊 Monitoring ${CONFIG.symbol}`);
  console.log(`⏱️  Analysis interval: ${CONFIG.analysisInterval / 1000}s\n`);

  // Run first analysis immediately
  await analyzeMarket(CONFIG.symbol);

  // Then run on interval
  setInterval(() => {
    analyzeMarket(CONFIG.symbol);
  }, CONFIG.analysisInterval);
}

// Start the analyzer
runContinuousAnalysis();

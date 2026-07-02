/**
 * Main Trading System Server
 * Orchestrates analysis, paper trading, alerts, and web dashboard
 */

const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const path = require('path');
const { exec } = require('child_process');

const config = require('./config');
const PaperTrading = require('./paper-trading');
const AlertSystem = require('./alert-system');

// Initialize systems
const paperTrading = new PaperTrading(config.paperTrading);
const alertSystem = new AlertSystem(config);

// Express and WebSocket setup
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store connected WebSocket clients
const clients = new Set();

// Serve static files
app.use(express.static(__dirname));

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// WebSocket connection handler
wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('📱 Dashboard connected');

  // Send initial data
  sendPerformanceUpdate();

  ws.on('close', () => {
    clients.delete(ws);
    console.log('📱 Dashboard disconnected');
  });
});

// Broadcast to all connected clients
function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

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

// Calculate indicators (copy from analyzer.js)
function calculateSMA(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((sum, price) => sum + price, 0) / period;
}

function calculateEMA(prices, period) {
  if (prices.length < period) return null;
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((sum, price) => sum + price, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  return ema;
}

function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;
  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }
  let gains = 0, losses = 0;
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

function calculateMACD(prices) {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  if (!ema12 || !ema26) return null;
  const macdLine = ema12 - ema26;
  return { macdLine, ema12, ema26 };
}

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

function analyzeOrderBook(orderBook, currentPrice) {
  const bids = orderBook.bids.map(b => ({ price: parseFloat(b[0]), qty: parseFloat(b[1]) }));
  const asks = orderBook.asks.map(a => ({ price: parseFloat(a[0]), qty: parseFloat(a[1]) }));
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

function calculateLevels(klines, currentPrice) {
  const highs = klines.map(k => parseFloat(k[2]));
  const lows = klines.map(k => parseFloat(k[3]));
  const pivots = [];
  for (let i = 2; i < highs.length - 2; i++) {
    if (highs[i] > highs[i-1] && highs[i] > highs[i-2] &&
        highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
      pivots.push({ price: highs[i], type: 'resistance' });
    }
    if (lows[i] < lows[i-1] && lows[i] < lows[i-2] &&
        lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
      pivots.push({ price: lows[i], type: 'support' });
    }
  }
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

function generateSignal(analysis) {
  const signals = [];
  let bullishScore = 0;
  let bearishScore = 0;

  if (analysis.rsi < config.strategy.rsiOversold) {
    signals.push({ indicator: 'RSI', signal: 'BULLISH', reason: `RSI ${analysis.rsi.toFixed(2)} - Oversold` });
    bullishScore += 2;
  } else if (analysis.rsi > config.strategy.rsiOverbought) {
    signals.push({ indicator: 'RSI', signal: 'BEARISH', reason: `RSI ${analysis.rsi.toFixed(2)} - Overbought` });
    bearishScore += 2;
  }

  if (analysis.price > analysis.ema20 && analysis.ema20 > analysis.ema50) {
    signals.push({ indicator: 'EMA', signal: 'BULLISH', reason: 'Price above EMA20 & EMA50 (uptrend)' });
    bullishScore += 2;
  } else if (analysis.price < analysis.ema20 && analysis.ema20 < analysis.ema50) {
    signals.push({ indicator: 'EMA', signal: 'BEARISH', reason: 'Price below EMA20 & EMA50 (downtrend)' });
    bearishScore += 2;
  }

  if (analysis.price < analysis.bb.lower) {
    signals.push({ indicator: 'BB', signal: 'BULLISH', reason: 'Price below lower Bollinger Band' });
    bullishScore += 1.5;
  } else if (analysis.price > analysis.bb.upper) {
    signals.push({ indicator: 'BB', signal: 'BEARISH', reason: 'Price above upper Bollinger Band' });
    bearishScore += 1.5;
  }

  if (analysis.macd && analysis.macd.macdLine > 0) {
    signals.push({ indicator: 'MACD', signal: 'BULLISH', reason: 'MACD line positive' });
    bullishScore += 1;
  } else if (analysis.macd && analysis.macd.macdLine < 0) {
    signals.push({ indicator: 'MACD', signal: 'BEARISH', reason: 'MACD line negative' });
    bearishScore += 1;
  }

  if (analysis.orderBook.pressure === 'BULLISH') {
    signals.push({ indicator: 'OrderBook', signal: 'BULLISH', reason: `Bid/Ask ratio ${analysis.orderBook.bidAskRatio.toFixed(2)} - More buyers` });
    bullishScore += 1.5;
  } else if (analysis.orderBook.pressure === 'BEARISH') {
    signals.push({ indicator: 'OrderBook', signal: 'BEARISH', reason: `Bid/Ask ratio ${analysis.orderBook.bidAskRatio.toFixed(2)} - More sellers` });
    bearishScore += 1.5;
  }

  const netScore = bullishScore - bearishScore;
  let action = 'HOLD';
  let confidence = 'LOW';

  if (netScore >= config.strategy.strongSignalThreshold) {
    action = 'STRONG BUY';
    confidence = 'HIGH';
  } else if (netScore >= config.strategy.minBullishScore) {
    action = 'BUY';
    confidence = 'MEDIUM';
  } else if (netScore <= -config.strategy.strongSignalThreshold) {
    action = 'STRONG SELL';
    confidence = 'HIGH';
  } else if (netScore <= -config.strategy.minBearishScore) {
    action = 'SELL';
    confidence = 'MEDIUM';
  }

  return { action, confidence, bullishScore, bearishScore, netScore, signals };
}

// Main analysis function
async function analyzeSymbol(symbol) {
  try {
    const [ticker, klines1h, klines4h, orderBook] = await Promise.all([
      getCurrentPrice(symbol),
      getKlines(symbol, '1h', 100),
      getKlines(symbol, '4h', 100),
      getOrderBook(symbol, 100),
    ]);

    const currentPrice = parseFloat(ticker.lastPrice);
    const priceChange24h = parseFloat(ticker.priceChangePercent);
    const closes1h = klines1h.map(k => parseFloat(k[4]));

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
      rsi,
      ema20,
      ema50,
      macd,
      bb,
      orderBook: orderBookAnalysis,
      levels,
    };

    const signal = generateSignal(analysis);

    let tradeSetup = null;
    if (signal.action.includes('BUY') || signal.action.includes('SELL')) {
      const entryPrice = currentPrice;
      const stopLoss = levels.supports.length > 0
        ? levels.supports[0].price * 0.998
        : currentPrice * 0.97;
      const takeProfit = levels.resistances.length > 0
        ? levels.resistances[0].price
        : currentPrice * 1.03;
      const riskReward = (takeProfit - entryPrice) / (entryPrice - stopLoss);

      tradeSetup = {
        entry: entryPrice,
        stopLoss,
        takeProfit,
        stopLossPercent: ((entryPrice - stopLoss) / entryPrice) * 100,
        takeProfitPercent: ((takeProfit - entryPrice) / entryPrice) * 100,
        riskReward,
      };
    }

    return { symbol, analysis, signal, tradeSetup };
  } catch (error) {
    console.error(`❌ Error analyzing ${symbol}:`, error.message);
    return null;
  }
}

// Run analysis for all symbols
async function runAnalysis() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 RUNNING ANALYSIS - ${new Date().toLocaleString()}`);
  console.log('='.repeat(80));

  const results = await Promise.all(
    config.symbols.map(symbol => analyzeSymbol(symbol))
  );

  const validResults = results.filter(r => r !== null);

  // Check for paper trading opportunities
  if (config.paperTrading.enabled) {
    const currentPrices = {};
    validResults.forEach(r => {
      currentPrices[r.symbol] = r.analysis.price;
    });

    // Check existing positions for stop loss / take profit
    const closedTrades = paperTrading.checkOpenPositions(currentPrices);
    closedTrades.forEach(trade => {
      console.log(`\n💰 Paper Trade Closed: ${trade.symbol} ${trade.type}`);
      console.log(`   Entry: $${trade.entryPrice.toFixed(4)} → Exit: $${trade.exitPrice.toFixed(4)}`);
      console.log(`   P&L: ${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)} (${trade.pnlPercent.toFixed(2)}%)`);
      console.log(`   Reason: ${trade.closeReason}`);

      // Send alert
      alertSystem.sendPaperTradingUpdate(trade);
    });

    // Look for new trading opportunities
    validResults.forEach(result => {
      const { symbol, signal, analysis, tradeSetup } = result;

      if ((signal.action.includes('BUY') || signal.action.includes('SELL')) &&
          signal.confidence !== 'LOW' &&
          tradeSetup &&
          tradeSetup.riskReward >= config.riskManagement.minRiskRewardRatio) {

        const openResult = paperTrading.openTrade(signal, analysis);
        if (openResult.success) {
          console.log(`\n✅ Paper Trade Opened: ${symbol} ${openResult.trade.type}`);
          console.log(`   Entry: $${openResult.trade.entryPrice.toFixed(4)}`);
          console.log(`   Stop Loss: $${openResult.trade.stopLoss.toFixed(4)}`);
          console.log(`   Take Profit: $${openResult.trade.takeProfit.toFixed(4)}`);
        }
      }
    });
  }

  // Send alerts for strong signals
  validResults.forEach(result => {
    if (result.tradeSetup) {
      alertSystem.sendAlert(result.symbol, result.signal, result.analysis, result.tradeSetup);
    }
  });

  // Display summary
  console.log(`\n📊 SUMMARY:`);
  validResults.forEach(result => {
    const { symbol, analysis, signal } = result;
    const emoji = signal.action.includes('BUY') ? '🟢' : signal.action.includes('SELL') ? '🔴' : '⚪';
    console.log(`   ${emoji} ${symbol}: $${analysis.price.toFixed(4)} | ${signal.action} (${signal.confidence})`);
  });

  console.log(`\n💰 Paper Trading Balance: $${paperTrading.balance.toFixed(2)}`);
  console.log(`   Open Positions: ${paperTrading.openPositions.length}`);
  console.log(`   Total Trades: ${paperTrading.stats.totalTrades} | Win Rate: ${paperTrading.stats.winRate.toFixed(1)}%`);
  console.log('='.repeat(80));

  // Broadcast to dashboard
  broadcast({ type: 'analysis', data: validResults });
  sendPerformanceUpdate();
}

function sendPerformanceUpdate() {
  const performance = paperTrading.getPerformance();
  broadcast({ type: 'performance', data: performance });
  broadcast({ type: 'trade', data: performance.recentTrades });
}

// Start the server
function startServer() {
  const port = config.dashboard.port;

  server.listen(port, () => {
    console.log('🚀 Crypto Trading System Started!\n');
    console.log(`📊 Dashboard: http://localhost:${port}`);
    console.log(`📈 Monitoring ${config.symbols.length} symbols`);
    console.log(`⏱️  Analysis interval: ${config.analysisInterval / 1000}s`);
    console.log(`💰 Paper Trading: ${config.paperTrading.enabled ? 'ENABLED' : 'DISABLED'}`);
    console.log(`🔔 Telegram Alerts: ${config.telegram.enabled ? 'ENABLED' : 'DISABLED'}`);
    console.log(`🔔 Discord Alerts: ${config.discord.enabled ? 'DISABLED' : 'DISABLED'}`);
    console.log();

    // Open browser automatically
    if (config.dashboard.autoOpenBrowser) {
      const url = `http://localhost:${port}`;
      const start = process.platform === 'darwin' ? 'open' :
                    process.platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${start} ${url}`);
    }

    // Run first analysis immediately
    runAnalysis();

    // Then run on interval
    setInterval(runAnalysis, config.analysisInterval);
  });
}

// Start the system
startServer();

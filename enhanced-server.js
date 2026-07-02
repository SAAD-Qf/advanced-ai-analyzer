/**
 * Enhanced Trading System Server
 * Integrates AI analysis, advanced indicators, and real-time futures data
 */

const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const { exec } = require('child_process');

const config = require('./config');
const marketData = require('./market-data');
const advancedAnalyzer = require('./advanced-analyzer');
const aiAnalyzer = require('./ai-analyzer');
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

// Serve enhanced dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'enhanced-dashboard.html'));
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

// Main analysis function for a single symbol
async function analyzeSymbol(symbol) {
  try {
    console.log(`   🔍 Analyzing ${symbol}...`);

    // Fetch complete market data
    const data = await marketData.getCompleteMarketData(symbol);

    if (!data || !data.spotPrice) {
      console.warn(`   ⚠️  ${symbol}: No data available`);
      return null;
    }

    const currentPrice = parseFloat(data.spotPrice.lastPrice);
    const priceChange24h = parseFloat(data.spotPrice.priceChangePercent);
    const volume24h = parseFloat(data.spotPrice.volume);
    const closes1h = data.klines1h.map(k => parseFloat(k[4]));

    // Calculate technical indicators
    const rsi = advancedAnalyzer.calculateRSI(closes1h, 14);
    const ema20 = advancedAnalyzer.calculateEMA(closes1h, 20);
    const ema50 = advancedAnalyzer.calculateEMA(closes1h, 50);
    const macd = advancedAnalyzer.calculateMACD(closes1h);
    const bb = advancedAnalyzer.calculateBollingerBands(closes1h, 20, 2);

    // Advanced analysis
    const orderBookAnalysis = advancedAnalyzer.analyzeOrderBook(data.orderBook, currentPrice);
    const cvd = advancedAnalyzer.calculateCVD(data.recentTrades);
    const footprint = advancedAnalyzer.analyzeFootprint(data.recentTrades, currentPrice);
    const openInterestAnalysis = advancedAnalyzer.analyzeOpenInterest(data.openInterest, data.openInterestHistory);
    const longShortAnalysis = advancedAnalyzer.analyzeLongShortRatio(data.longShortRatio, data.topTraderRatio);
    const liquidationAnalysis = advancedAnalyzer.analyzeLiquidations(data.liquidations, data.coinGlassLiquidations);
    const levels = advancedAnalyzer.calculateLevels(data.klines4h, currentPrice);

    // Compile analysis
    const analysis = {
      symbol,
      price: currentPrice,
      priceChange24h,
      volume24h,
      rsi,
      ema20,
      ema50,
      macd,
      bb,
      orderBook: orderBookAnalysis,
      cvd,
      footprint,
      openInterest: openInterestAnalysis,
      longShortRatio: longShortAnalysis,
      liquidations: liquidationAnalysis,
      levels,
      fundingRate: data.fundingRate ? parseFloat(data.fundingRate.fundingRate) : null,
    };

    // Generate signal
    const signal = advancedAnalyzer.generateAdvancedSignal(analysis);

    // AI Analysis for strong signals
    let aiAnalysis = null;
    if (config.ai.enabled && (signal.action.includes('BUY') || signal.action.includes('SELL'))) {
      const technicalData = {
        price: currentPrice,
        priceChange24h,
        rsi,
        ema20,
        ema50,
        macd,
        bb,
        orderBook: orderBookAnalysis,
        volume: volume24h,
      };

      const advancedData = {
        openInterest: openInterestAnalysis?.current,
        openInterestChange: openInterestAnalysis?.change,
        longShortRatio: longShortAnalysis?.ratio,
        topTraderRatio: longShortAnalysis?.topTraderRatio,
        fundingRate: analysis.fundingRate,
        liquidations24h: liquidationAnalysis?.total24h,
        cvd: cvd?.cvd,
      };

      aiAnalysis = await aiAnalyzer.analyzeMarket(symbol, technicalData, advancedData);
    }

    // Trade setup
    let tradeSetup = null;
    if (signal.action.includes('BUY') || signal.action.includes('SELL')) {
      const entryPrice = currentPrice;
      const stopLoss = levels.supports.length > 0
        ? levels.supports[0].price * 0.998
        : currentPrice * (signal.action.includes('BUY') ? 0.97 : 1.03);
      const takeProfit = levels.resistances.length > 0
        ? levels.resistances[0].price
        : currentPrice * (signal.action.includes('BUY') ? 1.06 : 0.94);

      // Use AI recommendations if available
      if (aiAnalysis && aiAnalysis.stopLoss && aiAnalysis.takeProfit) {
        const slPercent = aiAnalysis.stopLoss / 100;
        const tpPercent = aiAnalysis.takeProfit / 100;

        if (signal.action.includes('BUY')) {
          tradeSetup = {
            entry: entryPrice,
            stopLoss: entryPrice * (1 - slPercent),
            takeProfit: entryPrice * (1 + tpPercent),
          };
        } else {
          tradeSetup = {
            entry: entryPrice,
            stopLoss: entryPrice * (1 + slPercent),
            takeProfit: entryPrice * (1 - tpPercent),
          };
        }
      } else {
        tradeSetup = { entry: entryPrice, stopLoss, takeProfit };
      }

      tradeSetup.stopLossPercent = Math.abs((entryPrice - tradeSetup.stopLoss) / entryPrice) * 100;
      tradeSetup.takeProfitPercent = Math.abs((tradeSetup.takeProfit - entryPrice) / entryPrice) * 100;
      tradeSetup.riskReward = tradeSetup.takeProfitPercent / tradeSetup.stopLossPercent;
    }

    return { symbol, analysis, signal, tradeSetup, aiAnalysis };
  } catch (error) {
    console.error(`   ❌ Error analyzing ${symbol}:`, error.message);
    return null;
  }
}

// Run analysis for all symbols
async function runAnalysis() {
  console.log(`\n${'='.repeat(100)}`);
  console.log(`🚀 RUNNING ENHANCED ANALYSIS - ${new Date().toLocaleString()}`);
  console.log('='.repeat(100));

  const startTime = Date.now();

  // Analyze all symbols
  const results = [];
  for (const symbol of config.symbols) {
    const result = await analyzeSymbol(symbol);
    if (result) {
      results.push(result);
    }
    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const validResults = results.filter(r => r !== null);

  // Check for paper trading opportunities
  if (config.paperTrading.enabled) {
    const currentPrices = {};
    validResults.forEach(r => {
      currentPrices[r.symbol] = r.analysis.price;
    });

    // Check existing positions
    const closedTrades = paperTrading.checkOpenPositions(currentPrices);
    closedTrades.forEach(trade => {
      console.log(`\n💰 Paper Trade Closed: ${trade.symbol} ${trade.type}`);
      console.log(`   Entry: $${trade.entryPrice.toFixed(4)} → Exit: $${trade.exitPrice.toFixed(4)}`);
      console.log(`   P&L: ${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)} (${trade.pnlPercent.toFixed(2)}%)`);
      console.log(`   Reason: ${trade.closeReason}`);

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
    if (result.tradeSetup && result.signal.confidence !== 'LOW') {
      alertSystem.sendAlert(result.symbol, result.signal, result.analysis, result.tradeSetup);
    }
  });

  // Display summary
  console.log(`\n📊 ANALYSIS SUMMARY:`);
  const strongBuys = validResults.filter(r => r.signal.action === 'STRONG BUY').length;
  const buys = validResults.filter(r => r.signal.action === 'BUY').length;
  const strongSells = validResults.filter(r => r.signal.action === 'STRONG SELL').length;
  const sells = validResults.filter(r => r.signal.action === 'SELL').length;
  const holds = validResults.filter(r => r.signal.action === 'HOLD').length;

  console.log(`   🟢 STRONG BUY: ${strongBuys} | BUY: ${buys}`);
  console.log(`   🔴 STRONG SELL: ${strongSells} | SELL: ${sells}`);
  console.log(`   ⚪ HOLD: ${holds}`);

  // Top movers
  const topMovers = validResults
    .sort((a, b) => Math.abs(b.analysis.priceChange24h) - Math.abs(a.analysis.priceChange24h))
    .slice(0, 5);

  console.log(`\n📈 TOP MOVERS (24h):`);
  topMovers.forEach(r => {
    const emoji = r.analysis.priceChange24h >= 0 ? '🟢' : '🔴';
    console.log(`   ${emoji} ${r.symbol}: ${r.analysis.priceChange24h >= 0 ? '+' : ''}${r.analysis.priceChange24h.toFixed(2)}%`);
  });

  // Get AI market sentiment
  if (config.ai.enabled) {
    const sentiment = await aiAnalyzer.getMarketSentiment(
      validResults.map(r => r.symbol),
      topMovers.map(r => ({ symbol: r.symbol, change: r.analysis.priceChange24h }))
    );

    if (sentiment) {
      console.log(`\n🤖 AI MARKET SENTIMENT:`);
      console.log(`   ${sentiment.analysis}`);
    }
  }

  console.log(`\n💰 Paper Trading Balance: $${paperTrading.balance.toFixed(2)}`);
  console.log(`   Open Positions: ${paperTrading.openPositions.length}`);
  console.log(`   Total Trades: ${paperTrading.stats.totalTrades} | Win Rate: ${paperTrading.stats.winRate.toFixed(1)}%`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n⏱️  Analysis completed in ${elapsed}s`);
  console.log('='.repeat(100));

  // Broadcast to dashboard
  broadcast({ type: 'analysis', data: validResults });
  sendPerformanceUpdate();
}

function sendPerformanceUpdate() {
  const performance = paperTrading.getPerformance();
  broadcast({ type: 'performance', data: performance });
  broadcast({ type: 'trades', data: performance.recentTrades });
}

// Start the server
function startServer() {
  const port = config.dashboard.port;

  server.listen(port, () => {
    console.log('\n🚀 ENHANCED CRYPTO TRADING SYSTEM STARTED!\n');
    console.log(`┌${'─'.repeat(78)}┐`);
    console.log(`│ 📊 Dashboard: http://localhost:${port}${' '.repeat(49)}│`);
    console.log(`│ 📈 Monitoring ${config.symbols.length} symbols (Altcoins + Meme Coins)${' '.repeat(35)}│`);
    console.log(`│ ⏱️  Analysis interval: ${config.analysisInterval / 1000}s${' '.repeat(52)}│`);
    console.log(`│ 💰 Paper Trading: ${config.paperTrading.enabled ? 'ENABLED' : 'DISABLED'}${' '.repeat(50)}│`);
    console.log(`│ 🤖 AI Analysis: ${config.ai.enabled ? 'ENABLED' : 'DISABLED'} (OpenRouter)${' '.repeat(38)}│`);
    console.log(`│ 📡 CoinGlass API: ${config.coinglass.enabled ? 'ENABLED' : 'DISABLED'}${' '.repeat(47)}│`);
    console.log(`│ 🔔 Telegram: ${config.telegram.enabled ? 'ENABLED' : 'DISABLED'} | Discord: ${config.discord.enabled ? 'ENABLED' : 'DISABLED'}${' '.repeat(33)}│`);
    console.log(`└${'─'.repeat(78)}┘\n`);
    console.log('✨ Enhanced Features:');
    console.log('   • Open Interest & Long/Short Ratio Analysis');
    console.log('   • CVD (Cumulative Volume Delta)');
    console.log('   • Liquidation Heatmap Integration');
    console.log('   • Footprint Charts & Volume Profile');
    console.log('   • AI-Powered Signal Validation');
    console.log('   • Multi-Timeframe Analysis');
    console.log('   • 90-95% Accuracy Target\n');

    // Open browser automatically
    if (config.dashboard.autoOpenBrowser) {
      const url = `http://localhost:${port}`;
      const start = process.platform === 'darwin' ? 'open' :
                    process.platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${start} ${url}`);
    }

    // Run first analysis immediately
    console.log('⏳ Starting initial analysis...\n');
    runAnalysis();

    // Then run on interval
    setInterval(runAnalysis, config.analysisInterval);
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Start the system
startServer();

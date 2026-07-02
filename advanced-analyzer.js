/**
 * Advanced Technical Analyzer
 * Includes CVD, Footprint, Enhanced Indicators, Open Interest Analysis
 */

const config = require('./config');

class AdvancedAnalyzer {
  // ==================== BASIC INDICATORS ====================

  calculateSMA(prices, period) {
    if (prices.length < period) return null;
    const slice = prices.slice(-period);
    return slice.reduce((sum, price) => sum + price, 0) / period;
  }

  calculateEMA(prices, period) {
    if (prices.length < period) return null;
    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((sum, price) => sum + price, 0) / period;
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    return ema;
  }

  calculateRSI(prices, period = 14) {
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

  calculateMACD(prices) {
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    if (!ema12 || !ema26) return null;
    const macdLine = ema12 - ema26;
    return { macdLine, ema12, ema26 };
  }

  calculateBollingerBands(prices, period = 20, stdDev = 2) {
    if (prices.length < period) return null;
    const sma = this.calculateSMA(prices, period);
    const slice = prices.slice(-period);
    const squaredDiffs = slice.map(price => Math.pow(price - sma, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / period;
    const standardDeviation = Math.sqrt(variance);
    return {
      upper: sma + (standardDeviation * stdDev),
      middle: sma,
      lower: sma - (standardDeviation * stdDev),
      bandwidth: ((standardDeviation * stdDev * 2) / sma) * 100,
    };
  }

  // ==================== ADVANCED INDICATORS ====================

  // Cumulative Volume Delta (CVD)
  calculateCVD(trades) {
    if (!trades || trades.length === 0) return { cvd: 0, buyVolume: 0, sellVolume: 0 };

    let buyVolume = 0;
    let sellVolume = 0;

    trades.forEach(trade => {
      const volume = parseFloat(trade.qty || trade.quoteQty || 0);
      if (trade.isBuyerMaker === false) {
        buyVolume += volume; // Taker buy (aggressive buy)
      } else {
        sellVolume += volume; // Taker sell (aggressive sell)
      }
    });

    return {
      cvd: buyVolume - sellVolume,
      buyVolume,
      sellVolume,
      ratio: sellVolume > 0 ? buyVolume / sellVolume : buyVolume > 0 ? 999 : 1,
    };
  }

  // Volume Profile / Footprint Analysis
  analyzeFootprint(trades, currentPrice, priceStep = 0.001) {
    if (!trades || trades.length === 0) return null;

    const levels = new Map();

    trades.forEach(trade => {
      const price = parseFloat(trade.price);
      const volume = parseFloat(trade.qty || trade.quoteQty || 0);
      const isBuy = trade.isBuyerMaker === false;

      const level = Math.round(price / priceStep) * priceStep;
      if (!levels.has(level)) {
        levels.set(level, { buyVolume: 0, sellVolume: 0, totalVolume: 0, trades: 0 });
      }

      const data = levels.get(level);
      data.totalVolume += volume;
      data.trades += 1;
      if (isBuy) {
        data.buyVolume += volume;
      } else {
        data.sellVolume += volume;
      }
    });

    // Convert to array and sort by volume
    const footprint = Array.from(levels.entries())
      .map(([price, data]) => ({
        price,
        ...data,
        delta: data.buyVolume - data.sellVolume,
        dominance: data.totalVolume > 0 ? (Math.max(data.buyVolume, data.sellVolume) / data.totalVolume) : 0.5,
      }))
      .sort((a, b) => b.totalVolume - a.totalVolume);

    // Find high volume nodes (HVN)
    const avgVolume = footprint.reduce((sum, f) => sum + f.totalVolume, 0) / footprint.length;
    const highVolumeNodes = footprint.filter(f => f.totalVolume > avgVolume * 2).slice(0, 5);

    // Find point of control (POC) - highest volume level
    const poc = footprint[0];

    return {
      highVolumeNodes,
      pointOfControl: poc,
      currentPriceLevel: footprint.find(f => Math.abs(f.price - currentPrice) < priceStep * 2),
      totalLevels: footprint.length,
    };
  }

  // Order Book Analysis
  analyzeOrderBook(orderBook, currentPrice) {
    if (!orderBook || !orderBook.bids || !orderBook.asks) return null;

    const bids = orderBook.bids.map(b => ({ price: parseFloat(b[0]), qty: parseFloat(b[1]) }));
    const asks = orderBook.asks.map(a => ({ price: parseFloat(a[0]), qty: parseFloat(a[1]) }));

    const bidVolumes = bids.map(b => b.qty);
    const askVolumes = asks.map(a => a.qty);
    const avgBidVol = bidVolumes.reduce((sum, v) => sum + v, 0) / bidVolumes.length;
    const avgAskVol = askVolumes.reduce((sum, v) => sum + v, 0) / askVolumes.length;

    const bidWalls = bids.filter(b => b.qty > avgBidVol * 3).slice(0, 5);
    const askWalls = asks.filter(a => a.qty > avgAskVol * 3).slice(0, 5);

    const totalBidVolume = bids.reduce((sum, b) => sum + b.qty, 0);
    const totalAskVolume = asks.reduce((sum, a) => sum + a.qty, 0);
    const bidAskRatio = totalAskVolume > 0 ? totalBidVolume / totalAskVolume : 1;

    // Calculate order book depth imbalance
    const top5Bids = bids.slice(0, 5).reduce((sum, b) => sum + b.qty, 0);
    const top5Asks = asks.slice(0, 5).reduce((sum, a) => sum + a.qty, 0);
    const imbalance = top5Asks > 0 ? (top5Bids - top5Asks) / (top5Bids + top5Asks) : 0;

    return {
      bidWalls,
      askWalls,
      bidAskRatio,
      imbalance,
      pressure: bidAskRatio > 1.2 ? 'BULLISH' : bidAskRatio < 0.8 ? 'BEARISH' : 'NEUTRAL',
      imbalancePressure: imbalance > 0.2 ? 'BULLISH' : imbalance < -0.2 ? 'BEARISH' : 'NEUTRAL',
    };
  }

  // Open Interest Analysis
  analyzeOpenInterest(currentOI, oiHistory) {
    if (!currentOI || !oiHistory || oiHistory.length === 0) return null;

    const current = parseFloat(currentOI.openInterest || 0);
    const previous = parseFloat(oiHistory[0]?.sumOpenInterest || current);
    const oiChange = previous > 0 ? ((current - previous) / previous) * 100 : 0;

    // OI trend
    const recentOI = oiHistory.slice(0, 5).map(h => parseFloat(h.sumOpenInterest || 0));
    const oiTrend = recentOI.length > 1 ? (recentOI[0] > recentOI[recentOI.length - 1] ? 'INCREASING' : 'DECREASING') : 'STABLE';

    return {
      current,
      change: oiChange,
      trend: oiTrend,
      significant: Math.abs(oiChange) > config.strategy.oiChangeThreshold,
    };
  }

  // Long/Short Ratio Analysis
  analyzeLongShortRatio(lsData, topTraderData) {
    if (!lsData || lsData.length === 0) return null;

    const latest = lsData[lsData.length - 1];
    const ratio = parseFloat(latest.longShortRatio || 1);
    const longAccount = parseFloat(latest.longAccount || 0);
    const shortAccount = parseFloat(latest.shortAccount || 0);

    let topTraderRatio = null;
    if (topTraderData && topTraderData.length > 0) {
      const topLatest = topTraderData[topTraderData.length - 1];
      topTraderRatio = parseFloat(topLatest.longShortRatio || 1);
    }

    // Sentiment based on ratio
    let sentiment = 'NEUTRAL';
    let contrarian = null;

    if (ratio > config.strategy.extremeLongRatio) {
      sentiment = 'EXTREMELY_BULLISH';
      contrarian = 'BEARISH'; // Too many longs = potential squeeze down
    } else if (ratio > 1.5) {
      sentiment = 'BULLISH';
    } else if (ratio < config.strategy.extremeShortRatio) {
      sentiment = 'EXTREMELY_BEARISH';
      contrarian = 'BULLISH'; // Too many shorts = potential short squeeze
    } else if (ratio < 0.67) {
      sentiment = 'BEARISH';
    }

    return {
      ratio,
      longAccount,
      shortAccount,
      topTraderRatio,
      sentiment,
      contrarian,
      divergence: topTraderRatio ? Math.abs(ratio - topTraderRatio) > 0.5 : false,
    };
  }

  // Liquidation Analysis
  analyzeLiquidations(liquidationOrders, coinGlassData) {
    let total24h = 0;
    let longs24h = 0;
    let shorts24h = 0;

    if (liquidationOrders && liquidationOrders.length > 0) {
      const last24h = Date.now() - 24 * 60 * 60 * 1000;
      liquidationOrders.forEach(order => {
        const time = order.time || order.timestamp;
        if (time > last24h) {
          const qty = parseFloat(order.origQty || 0);
          const price = parseFloat(order.price || 0);
          const value = qty * price;

          if (order.side === 'BUY') {
            shorts24h += value; // Buy liquidation = short squeeze
          } else {
            longs24h += value; // Sell liquidation = long squeeze
          }
          total24h += value;
        }
      });
    }

    // CoinGlass data (more accurate)
    if (coinGlassData && coinGlassData.data) {
      const cgData = coinGlassData.data;
      if (cgData.longLiquidationUsd) longs24h = parseFloat(cgData.longLiquidationUsd);
      if (cgData.shortLiquidationUsd) shorts24h = parseFloat(cgData.shortLiquidationUsd);
      total24h = longs24h + shorts24h;
    }

    const pressure = total24h > 0 ? (shorts24h > longs24h ? 'BULLISH' : 'BEARISH') : 'NEUTRAL';

    return {
      total24h,
      longs24h,
      shorts24h,
      ratio: longs24h > 0 ? shorts24h / longs24h : shorts24h > 0 ? 999 : 1,
      pressure,
      significant: total24h > config.strategy.liquidationThreshold,
    };
  }

  // Support & Resistance Levels
  calculateLevels(klines, currentPrice) {
    if (!klines || klines.length < 10) return { supports: [], resistances: [] };

    const highs = klines.map(k => parseFloat(k[2]));
    const lows = klines.map(k => parseFloat(k[3]));
    const pivots = [];

    for (let i = 2; i < highs.length - 2; i++) {
      if (highs[i] > highs[i-1] && highs[i] > highs[i-2] &&
          highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
        pivots.push({ price: highs[i], type: 'resistance', strength: 1 });
      }
      if (lows[i] < lows[i-1] && lows[i] < lows[i-2] &&
          lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
        pivots.push({ price: lows[i], type: 'support', strength: 1 });
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

  // ==================== SIGNAL GENERATION ====================

  generateAdvancedSignal(analysis) {
    const signals = [];
    let bullishScore = 0;
    let bearishScore = 0;

    // RSI
    if (analysis.rsi < config.strategy.rsiOversold) {
      signals.push({ indicator: 'RSI', signal: 'BULLISH', weight: 2, reason: `Oversold ${analysis.rsi.toFixed(2)}` });
      bullishScore += 2;
    } else if (analysis.rsi > config.strategy.rsiOverbought) {
      signals.push({ indicator: 'RSI', signal: 'BEARISH', weight: 2, reason: `Overbought ${analysis.rsi.toFixed(2)}` });
      bearishScore += 2;
    }

    // EMA Trend
    if (analysis.price > analysis.ema20 && analysis.ema20 > analysis.ema50) {
      signals.push({ indicator: 'EMA', signal: 'BULLISH', weight: 2, reason: 'Uptrend confirmed' });
      bullishScore += 2;
    } else if (analysis.price < analysis.ema20 && analysis.ema20 < analysis.ema50) {
      signals.push({ indicator: 'EMA', signal: 'BEARISH', weight: 2, reason: 'Downtrend confirmed' });
      bearishScore += 2;
    }

    // Bollinger Bands
    if (analysis.price < analysis.bb.lower) {
      signals.push({ indicator: 'BB', signal: 'BULLISH', weight: 1.5, reason: 'Below lower band' });
      bullishScore += 1.5;
    } else if (analysis.price > analysis.bb.upper) {
      signals.push({ indicator: 'BB', signal: 'BEARISH', weight: 1.5, reason: 'Above upper band' });
      bearishScore += 1.5;
    }

    // MACD
    if (analysis.macd && analysis.macd.macdLine > 0) {
      signals.push({ indicator: 'MACD', signal: 'BULLISH', weight: 1, reason: 'Positive momentum' });
      bullishScore += 1;
    } else if (analysis.macd && analysis.macd.macdLine < 0) {
      signals.push({ indicator: 'MACD', signal: 'BEARISH', weight: 1, reason: 'Negative momentum' });
      bearishScore += 1;
    }

    // Order Book
    if (analysis.orderBook.pressure === 'BULLISH') {
      signals.push({ indicator: 'OrderBook', signal: 'BULLISH', weight: 1.5, reason: `Bid/Ask ${analysis.orderBook.bidAskRatio.toFixed(2)}` });
      bullishScore += 1.5;
    } else if (analysis.orderBook.pressure === 'BEARISH') {
      signals.push({ indicator: 'OrderBook', signal: 'BEARISH', weight: 1.5, reason: `Bid/Ask ${analysis.orderBook.bidAskRatio.toFixed(2)}` });
      bearishScore += 1.5;
    }

    // CVD
    if (analysis.cvd && analysis.cvd.cvd > config.strategy.cvdSignificantChange) {
      signals.push({ indicator: 'CVD', signal: 'BULLISH', weight: 2, reason: 'Strong buy pressure' });
      bullishScore += 2;
    } else if (analysis.cvd && analysis.cvd.cvd < -config.strategy.cvdSignificantChange) {
      signals.push({ indicator: 'CVD', signal: 'BEARISH', weight: 2, reason: 'Strong sell pressure' });
      bearishScore += 2;
    }

    // Open Interest
    if (analysis.openInterest && analysis.openInterest.significant) {
      if (analysis.openInterest.change > 0 && analysis.price > analysis.ema20) {
        signals.push({ indicator: 'OI', signal: 'BULLISH', weight: 1.5, reason: `OI +${analysis.openInterest.change.toFixed(1)}%` });
        bullishScore += 1.5;
      } else if (analysis.openInterest.change > 0 && analysis.price < analysis.ema20) {
        signals.push({ indicator: 'OI', signal: 'BEARISH', weight: 1.5, reason: `OI up, price down` });
        bearishScore += 1.5;
      }
    }

    // Long/Short Ratio (Contrarian)
    if (analysis.longShortRatio && analysis.longShortRatio.contrarian) {
      if (analysis.longShortRatio.contrarian === 'BULLISH') {
        signals.push({ indicator: 'L/S Ratio', signal: 'BULLISH', weight: 2, reason: 'Too many shorts' });
        bullishScore += 2;
      } else {
        signals.push({ indicator: 'L/S Ratio', signal: 'BEARISH', weight: 2, reason: 'Too many longs' });
        bearishScore += 2;
      }
    }

    // Liquidations
    if (analysis.liquidations && analysis.liquidations.significant) {
      if (analysis.liquidations.pressure === 'BULLISH') {
        signals.push({ indicator: 'Liquidations', signal: 'BULLISH', weight: 1.5, reason: 'Short squeeze' });
        bullishScore += 1.5;
      } else if (analysis.liquidations.pressure === 'BEARISH') {
        signals.push({ indicator: 'Liquidations', signal: 'BEARISH', weight: 1.5, reason: 'Long squeeze' });
        bearishScore += 1.5;
      }
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

    return {
      action,
      confidence,
      bullishScore,
      bearishScore,
      netScore,
      signals,
      accuracy: this.estimateAccuracy(signals, netScore),
    };
  }

  estimateAccuracy(signals, netScore) {
    // More signals = higher confidence
    const signalCount = signals.length;
    const scoreStrength = Math.abs(netScore);

    let accuracy = 50; // Base

    if (signalCount >= 8) accuracy += 20;
    else if (signalCount >= 6) accuracy += 15;
    else if (signalCount >= 4) accuracy += 10;

    if (scoreStrength >= 8) accuracy += 20;
    else if (scoreStrength >= 5) accuracy += 15;
    else if (scoreStrength >= 3) accuracy += 10;

    // Check for conflicting signals
    const bullish = signals.filter(s => s.signal === 'BULLISH').length;
    const bearish = signals.filter(s => s.signal === 'BEARISH').length;
    const agreement = Math.abs(bullish - bearish) / signalCount;

    accuracy += agreement * 10;

    return Math.min(95, Math.max(50, Math.round(accuracy)));
  }
}

module.exports = new AdvancedAnalyzer();

/**
 * Paper Trading Module - Simulates trades without real money
 */

const fs = require('fs');
const path = require('path');

class PaperTrading {
  constructor(config) {
    this.config = config;
    this.dataFile = path.join(__dirname, 'paper-trades.json');
    this.loadData();
  }

  loadData() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
        this.balance = data.balance;
        this.trades = data.trades;
        this.openPositions = data.openPositions;
        this.closedTrades = data.closedTrades;
        this.stats = data.stats;
      } else {
        this.reset();
      }
    } catch (error) {
      console.error('Error loading paper trading data:', error.message);
      this.reset();
    }
  }

  reset() {
    this.balance = this.config.initialBalance;
    this.trades = [];
    this.openPositions = [];
    this.closedTrades = [];
    this.stats = {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalProfit: 0,
      totalLoss: 0,
      winRate: 0,
      avgProfit: 0,
      avgLoss: 0,
      largestWin: 0,
      largestLoss: 0,
      currentStreak: 0,
      bestStreak: 0,
      worstStreak: 0,
    };
    this.saveData();
  }

  saveData() {
    const data = {
      balance: this.balance,
      trades: this.trades,
      openPositions: this.openPositions,
      closedTrades: this.closedTrades,
      stats: this.stats,
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
  }

  openTrade(signal, analysis) {
    // Check if we can open more positions
    if (this.openPositions.length >= this.config.maxOpenPositions) {
      return { success: false, reason: 'Max open positions reached' };
    }

    // Check if we already have position in this symbol
    const existingPosition = this.openPositions.find(p => p.symbol === analysis.symbol);
    if (existingPosition) {
      return { success: false, reason: 'Already have position in this symbol' };
    }

    // Calculate position size
    const positionSize = this.balance * this.config.defaultPositionSize;
    const entryPrice = analysis.price;
    const quantity = positionSize / entryPrice;

    // Calculate stop loss and take profit
    let stopLoss, takeProfit;

    if (signal.action.includes('BUY')) {
      stopLoss = analysis.levels.supports.length > 0
        ? analysis.levels.supports[0].price * 0.998
        : entryPrice * (1 - this.config.stopLossPercent);

      takeProfit = analysis.levels.resistances.length > 0
        ? analysis.levels.resistances[0].price
        : entryPrice * (1 + this.config.takeProfitPercent);
    } else {
      // For SELL (short), reverse the logic
      stopLoss = analysis.levels.resistances.length > 0
        ? analysis.levels.resistances[0].price * 1.002
        : entryPrice * (1 + this.config.stopLossPercent);

      takeProfit = analysis.levels.supports.length > 0
        ? analysis.levels.supports[0].price
        : entryPrice * (1 - this.config.takeProfitPercent);
    }

    const trade = {
      id: Date.now().toString(),
      symbol: analysis.symbol,
      type: signal.action.includes('BUY') ? 'LONG' : 'SHORT',
      entryPrice,
      quantity,
      positionSize,
      stopLoss,
      takeProfit,
      entryTime: new Date().toISOString(),
      confidence: signal.confidence,
      signals: signal.signals,
      status: 'OPEN',
    };

    this.openPositions.push(trade);
    this.trades.push(trade);
    this.balance -= positionSize; // Reserve balance
    this.saveData();

    return { success: true, trade };
  }

  checkOpenPositions(currentPrices) {
    const closedThisCheck = [];

    for (let i = this.openPositions.length - 1; i >= 0; i--) {
      const position = this.openPositions[i];
      const currentPrice = currentPrices[position.symbol];

      if (!currentPrice) continue;

      let shouldClose = false;
      let closeReason = '';

      if (position.type === 'LONG') {
        // Check stop loss
        if (currentPrice <= position.stopLoss) {
          shouldClose = true;
          closeReason = 'STOP_LOSS';
        }
        // Check take profit
        else if (currentPrice >= position.takeProfit) {
          shouldClose = true;
          closeReason = 'TAKE_PROFIT';
        }
      } else {
        // SHORT position
        if (currentPrice >= position.stopLoss) {
          shouldClose = true;
          closeReason = 'STOP_LOSS';
        }
        else if (currentPrice <= position.takeProfit) {
          shouldClose = true;
          closeReason = 'TAKE_PROFIT';
        }
      }

      if (shouldClose) {
        const closedTrade = this.closeTrade(position, currentPrice, closeReason);
        closedThisCheck.push(closedTrade);
      }
    }

    return closedThisCheck;
  }

  closeTrade(position, exitPrice, reason) {
    // Calculate profit/loss
    let pnl;
    if (position.type === 'LONG') {
      pnl = (exitPrice - position.entryPrice) * position.quantity;
    } else {
      pnl = (position.entryPrice - exitPrice) * position.quantity;
    }

    const pnlPercent = (pnl / position.positionSize) * 100;

    // Update position
    position.exitPrice = exitPrice;
    position.exitTime = new Date().toISOString();
    position.closeReason = reason;
    position.pnl = pnl;
    position.pnlPercent = pnlPercent;
    position.status = 'CLOSED';

    // Update balance
    this.balance += position.positionSize + pnl;

    // Move to closed trades
    this.closedTrades.push(position);

    // Remove from open positions
    const index = this.openPositions.findIndex(p => p.id === position.id);
    if (index > -1) {
      this.openPositions.splice(index, 1);
    }

    // Update stats
    this.updateStats(position);
    this.saveData();

    return position;
  }

  updateStats(trade) {
    this.stats.totalTrades++;

    if (trade.pnl > 0) {
      this.stats.winningTrades++;
      this.stats.totalProfit += trade.pnl;
      this.stats.largestWin = Math.max(this.stats.largestWin, trade.pnl);
      this.stats.currentStreak = this.stats.currentStreak >= 0 ? this.stats.currentStreak + 1 : 1;
    } else {
      this.stats.losingTrades++;
      this.stats.totalLoss += Math.abs(trade.pnl);
      this.stats.largestLoss = Math.min(this.stats.largestLoss, trade.pnl);
      this.stats.currentStreak = this.stats.currentStreak <= 0 ? this.stats.currentStreak - 1 : -1;
    }

    this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.currentStreak);
    this.stats.worstStreak = Math.min(this.stats.worstStreak, this.stats.currentStreak);

    this.stats.winRate = (this.stats.winningTrades / this.stats.totalTrades) * 100;
    this.stats.avgProfit = this.stats.winningTrades > 0 ? this.stats.totalProfit / this.stats.winningTrades : 0;
    this.stats.avgLoss = this.stats.losingTrades > 0 ? this.stats.totalLoss / this.stats.losingTrades : 0;
  }

  getPerformance() {
    const totalPnL = this.stats.totalProfit - this.stats.totalLoss;
    const roi = ((this.balance - this.config.initialBalance) / this.config.initialBalance) * 100;

    return {
      balance: this.balance,
      initialBalance: this.config.initialBalance,
      totalPnL,
      roi,
      openPositions: this.openPositions.length,
      stats: this.stats,
      recentTrades: this.closedTrades.slice(-10).reverse(),
    };
  }

  manualCloseTrade(tradeId, currentPrice) {
    const position = this.openPositions.find(p => p.id === tradeId);
    if (!position) {
      return { success: false, reason: 'Trade not found' };
    }

    const closedTrade = this.closeTrade(position, currentPrice, 'MANUAL_CLOSE');
    return { success: true, trade: closedTrade };
  }
}

module.exports = PaperTrading;

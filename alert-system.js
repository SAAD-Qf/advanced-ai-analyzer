/**
 * Alert System - Sends trading signals via Telegram and Discord
 */

const https = require('https');

class AlertSystem {
  constructor(config) {
    this.config = config;
    this.lastAlerts = new Map(); // Track last alert time per symbol to avoid spam
    this.cooldownPeriod = 300000; // 5 minutes cooldown between alerts for same symbol
  }

  shouldSendAlert(symbol, signal) {
    // Check if confidence meets minimum requirement
    const confidenceLevels = { 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3 };
    const minLevel = confidenceLevels[this.config.minAlertConfidence] || 2;
    const signalLevel = confidenceLevels[signal.confidence] || 1;

    if (signalLevel < minLevel) {
      return false;
    }

    // Check if signal is actionable (not HOLD)
    if (signal.action === 'HOLD') {
      return false;
    }

    // Check cooldown
    const lastAlertTime = this.lastAlerts.get(symbol);
    if (lastAlertTime && (Date.now() - lastAlertTime) < this.cooldownPeriod) {
      return false;
    }

    return true;
  }

  async sendAlert(symbol, signal, analysis, tradeSetup) {
    if (!this.shouldSendAlert(symbol, signal)) {
      return;
    }

    const message = this.formatAlertMessage(symbol, signal, analysis, tradeSetup);

    const promises = [];

    if (this.config.telegram.enabled) {
      promises.push(this.sendTelegramAlert(message));
    }

    if (this.config.discord.enabled) {
      promises.push(this.sendDiscordAlert(message, signal));
    }

    try {
      await Promise.all(promises);
      this.lastAlerts.set(symbol, Date.now());
      console.log(`✅ Alert sent for ${symbol}: ${signal.action}`);
    } catch (error) {
      console.error('❌ Error sending alert:', error.message);
    }
  }

  formatAlertMessage(symbol, signal, analysis, tradeSetup) {
    const emoji = signal.action.includes('BUY') ? '🟢' : '🔴';
    const priceChange = analysis.priceChange24h >= 0 ? `+${analysis.priceChange24h.toFixed(2)}%` : `${analysis.priceChange24h.toFixed(2)}%`;

    let message = `${emoji} *${signal.action}* SIGNAL\n\n`;
    message += `📊 *${symbol}*\n`;
    message += `💰 Price: $${analysis.price.toFixed(4)} (${priceChange})\n`;
    message += `🎯 Confidence: ${signal.confidence}\n`;
    message += `📈 Score: ${signal.netScore} (Bull: ${signal.bullishScore} | Bear: ${signal.bearishScore})\n\n`;

    message += `*Indicators:*\n`;
    signal.signals.forEach(s => {
      const icon = s.signal === 'BULLISH' ? '🟢' : '🔴';
      message += `${icon} ${s.indicator}: ${s.reason}\n`;
    });

    if (tradeSetup) {
      message += `\n*Trade Setup:*\n`;
      message += `📍 Entry: $${tradeSetup.entry.toFixed(4)}\n`;
      message += `🛑 Stop Loss: $${tradeSetup.stopLoss.toFixed(4)} (${tradeSetup.stopLossPercent.toFixed(2)}%)\n`;
      message += `🎯 Take Profit: $${tradeSetup.takeProfit.toFixed(4)} (${tradeSetup.takeProfitPercent.toFixed(2)}%)\n`;
      message += `⚖️ Risk/Reward: 1:${tradeSetup.riskReward.toFixed(2)}\n`;
    }

    message += `\n🕐 ${new Date().toLocaleString()}`;

    return message;
  }

  sendTelegramAlert(message) {
    return new Promise((resolve, reject) => {
      const telegramMessage = message.replace(/\*/g, ''); // Remove markdown for simplicity
      const url = `https://api.telegram.org/bot${this.config.telegram.botToken}/sendMessage`;
      const payload = JSON.stringify({
        chat_id: this.config.telegram.chatId,
        text: telegramMessage,
        parse_mode: 'Markdown',
      });

      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length,
        },
      };

      const req = https.request(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`Telegram API error: ${res.statusCode}`));
          }
        });
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  sendDiscordAlert(message, signal) {
    return new Promise((resolve, reject) => {
      const color = signal.action.includes('BUY') ? 65280 : 16711680; // Green for buy, red for sell
      const discordMessage = message.replace(/\*/g, '**'); // Convert to Discord markdown

      const payload = JSON.stringify({
        embeds: [{
          title: `${signal.action} Signal`,
          description: discordMessage,
          color: color,
          timestamp: new Date().toISOString(),
        }],
      });

      const url = new URL(this.config.discord.webhookUrl);
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length,
        },
      };

      const req = https.request(options, (res) => {
        if (res.statusCode === 204) {
          resolve();
        } else {
          reject(new Error(`Discord webhook error: ${res.statusCode}`));
        }
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  sendPaperTradingUpdate(trade) {
    if (!this.config.telegram.enabled && !this.config.discord.enabled) {
      return;
    }

    const emoji = trade.pnl > 0 ? '✅' : '❌';
    const pnlSign = trade.pnl >= 0 ? '+' : '';

    let message = `${emoji} *Paper Trade Closed*\n\n`;
    message += `📊 *${trade.symbol}*\n`;
    message += `📍 Type: ${trade.type}\n`;
    message += `💰 Entry: $${trade.entryPrice.toFixed(4)}\n`;
    message += `💰 Exit: $${trade.exitPrice.toFixed(4)}\n`;
    message += `📈 P&L: ${pnlSign}$${trade.pnl.toFixed(2)} (${pnlSign}${trade.pnlPercent.toFixed(2)}%)\n`;
    message += `🔖 Reason: ${trade.closeReason}\n`;
    message += `⏱️ Duration: ${this.calculateDuration(trade.entryTime, trade.exitTime)}\n`;
    message += `\n🕐 ${new Date().toLocaleString()}`;

    if (this.config.telegram.enabled) {
      this.sendTelegramAlert(message).catch(err => console.error('Telegram error:', err.message));
    }

    if (this.config.discord.enabled) {
      const signal = { action: trade.pnl > 0 ? 'PROFIT' : 'LOSS' };
      this.sendDiscordAlert(message, signal).catch(err => console.error('Discord error:', err.message));
    }
  }

  calculateDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end - start;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h`;
    if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`;
    return `${diffMins}m`;
  }
}

module.exports = AlertSystem;

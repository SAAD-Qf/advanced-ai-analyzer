# Crypto Trading Analyzer

Real-time cryptocurrency market analysis and trading signal generator that analyzes Binance market data and provides actionable trading recommendations.

## Features

- **Real-time Price Data** - Live data from Binance API
- **Technical Indicators**:
  - RSI (Relative Strength Index)
  - EMA (Exponential Moving Averages - 20, 50)
  - MACD (Moving Average Convergence Divergence)
  - Bollinger Bands
- **Order Book Analysis** - Bid/Ask ratio, buy/sell walls
- **Support & Resistance Levels** - Automatic pivot point detection
- **Volume Analysis** - Volume spikes and trends
- **Trading Signals** - BUY, SELL, or HOLD recommendations with confidence levels
- **Trade Setup** - Entry, stop loss, take profit levels with risk/reward ratios

## Installation

```bash
cd crypto-trading-analyzer
npm start
```

## Usage

The analyzer runs continuously and updates every 60 seconds.

**Analyze XLM/USDT (default):**
```bash
node analyzer.js
```

**Analyze other pairs:**
Edit `analyzer.js` line 12:
```javascript
symbol: 'BTCUSDT',  // or ETHUSDT, SOLUSDT, etc.
```

## Understanding the Output

### Signal Meanings

- **STRONG BUY** - High confidence bullish signal (Net Score ≥ +4)
- **BUY** - Medium confidence bullish signal (Net Score ≥ +2)
- **HOLD** - No clear direction (Net Score between -2 and +2)
- **SELL** - Medium confidence bearish signal (Net Score ≤ -2)
- **STRONG SELL** - High confidence bearish signal (Net Score ≤ -4)

### Technical Indicators Explained

**RSI (Relative Strength Index)**
- < 30: Oversold (potential buy opportunity)
- > 70: Overbought (potential sell opportunity)
- 30-70: Normal range

**EMA (Exponential Moving Average)**
- Price above EMA20 & EMA50: Uptrend ✅
- Price below EMA20 & EMA50: Downtrend ❌

**Bollinger Bands**
- Price below lower band: Oversold
- Price above upper band: Overbought
- Price inside bands: Normal volatility

**MACD**
- Positive: Bullish momentum
- Negative: Bearish momentum

**Order Book**
- Bid/Ask Ratio > 1.2: More buyers (bullish)
- Bid/Ask Ratio < 0.8: More sellers (bearish)

## Trade Setup

When a BUY signal is generated, the analyzer provides:
- **Entry Price** - Current market price
- **Stop Loss** - Below nearest support (risk management)
- **Take Profit** - At nearest resistance (profit target)
- **Risk/Reward Ratio** - Should be at least 1:2 for good trades

### Recommended Risk Management

- Use **1-2% of portfolio** per trade
- Always use **stop loss** orders
- Don't trade if confidence is LOW
- Wait for HIGH confidence signals for best results

## Disclaimer

⚠️ **This tool is for educational purposes only.**

- Not financial advice
- Past performance doesn't guarantee future results
- Cryptocurrency trading is highly risky
- Only trade with money you can afford to lose
- Always do your own research (DYOR)
- The creator is not responsible for trading losses

## Data Source

- Market data: Binance Public API (free, no authentication required)
- Real-time price, volume, and order book data
- No CoinGlass integration yet (requires API key)

## Future Enhancements

- [ ] CoinGlass liquidation data integration
- [ ] Multi-timeframe analysis
- [ ] Alert notifications (Telegram/Discord)
- [ ] Trading history tracker
- [ ] Paper trading mode
- [ ] Multiple symbol monitoring

/**
 * Enhanced Configuration File - Advanced Crypto Trading System
 */

module.exports = {
  // Trading pairs to monitor - Altcoins and Meme Coins
  symbols: [
    // Major Altcoins
    'BTCUSDT',
    'ETHUSDT',
    'BNBUSDT',
    'SOLUSDT',
    'XRPUSDT',
    'ADAUSDT',
    'AVAXUSDT',
    'DOTUSDT',
    'MATICUSDT',
    'LINKUSDT',
    'ATOMUSDT',
    'NEARUSDT',
    'APTUSDT',
    'ARBUSDT',
    'OPUSDT',

    // DeFi Tokens
    'UNIUSDT',
    'AAVEUSDT',
    'CRVUSDT',
    'SUSHIUSDT',
    'COMPUSDT',

    // Layer 1/2
    'SUIUSDT',
    'INJUSDT',
    'TIAUSDT',
    'STXUSDT',

    // Meme Coins
    'DOGEUSDT',
    'SHIBUSDT',
    'PEPEUSDT',
    'FLOKIUSDT',
    'BONKUSDT',
    'WIFUSDT',
    '1000SATSUSDT',
    'ORDIUSDT',

    // AI & Gaming
    'FETCHUSDT',
    'RENDERUSDT',
    'AGIXUSDT',
    'SANDUSDT',
    'MANAUSDT',
  ],

  // Analysis interval (how often to check markets, in milliseconds)
  analysisInterval: 30000, // 30 seconds for futures trading

  // Minimum confidence level to generate alerts
  minAlertConfidence: 'MEDIUM',

  // OpenRouter API Configuration for AI Analysis
  openrouter: {
    enabled: true,
    apiKey: 'YOUR_OPENROUTER_API_KEY_HERE', // Get from openrouter.ai
    model: 'anthropic/claude-3.5-sonnet', // Recommended model for analysis
    // Alternative models:
    // 'openai/gpt-4-turbo-preview'
    // 'google/gemini-pro'
    // 'meta-llama/llama-3-70b-instruct'
    maxTokens: 2000,
    temperature: 0.3, // Lower for more consistent analysis
  },

  // CoinGlass API Configuration for Liquidation Data
  coinglass: {
    enabled: true,
    apiKey: 'YOUR_COINGLASS_API_KEY', // Get from coinglass.com/pricing
    endpoints: {
      liquidation: 'https://open-api.coinglass.com/public/v2/liquidation',
      liquidationHeatmap: 'https://open-api.coinglass.com/public/v2/liquidation_heatmap',
      longShortRatio: 'https://open-api.coinglass.com/public/v2/long_short',
      openInterest: 'https://open-api.coinglass.com/public/v2/open_interest',
    },
  },

  // Binance Futures API Configuration
  binance: {
    spotBaseUrl: 'https://api.binance.com',
    futuresBaseUrl: 'https://fapi.binance.com',
    // Optional: Add API key for higher rate limits (not required for public data)
    apiKey: '', // Leave empty for public endpoints
    apiSecret: '',
  },

  // Telegram Bot Configuration
  telegram: {
    enabled: false,
    botToken: 'YOUR_BOT_TOKEN_HERE',
    chatId: 'YOUR_CHAT_ID_HERE',
  },

  // Discord Webhook Configuration
  discord: {
    enabled: false,
    webhookUrl: 'YOUR_DISCORD_WEBHOOK_URL',
  },

  // Paper Trading Configuration
  paperTrading: {
    enabled: true,
    initialBalance: 10000,
    defaultPositionSize: 0.02, // 2% of portfolio per trade
    stopLossPercent: 0.03, // 3% stop loss (tighter for futures)
    takeProfitPercent: 0.06, // 6% take profit (2:1 risk/reward)
    maxLeverage: 5, // Maximum leverage for simulation
  },

  // Web Dashboard Configuration
  dashboard: {
    enabled: true,
    port: 3000,
    autoOpenBrowser: true,
  },

  // Advanced Trading Strategy Settings
  strategy: {
    // RSI Settings
    rsiOversold: 35,
    rsiOverbought: 65,

    // Signal Thresholds
    minBullishScore: 3,
    minBearishScore: 3,
    strongSignalThreshold: 5,

    // Multi-Timeframe Analysis
    timeframes: ['5m', '15m', '1h', '4h'],

    // Open Interest Settings
    oiChangeThreshold: 5, // 5% change is significant

    // Long/Short Ratio Settings
    extremeLongRatio: 2.5, // >2.5 is extremely bullish (contrarian bearish)
    extremeShortRatio: 0.4, // <0.4 is extremely bearish (contrarian bullish)

    // CVD Settings
    cvdSignificantChange: 1000000, // $1M USD change is significant

    // Liquidation Settings
    liquidationThreshold: 5000000, // $5M in liquidations is significant
  },

  // Risk Management
  riskManagement: {
    maxOpenPositions: 5,
    maxRiskPerTrade: 0.02,
    minRiskRewardRatio: 2.0, // 1:2 minimum for futures
    maxDailyLoss: 0.05, // Stop trading if -5% daily loss
  },

  // AI Analysis Settings
  ai: {
    enabled: true,
    analyzeOnSignal: true, // Run AI analysis when strong signal detected
    sentiment: true, // Include sentiment analysis
    marketRegime: true, // Analyze market regime (trending, ranging, volatile)
    confidence: true, // Get AI confidence score
  },

  // Advanced Features
  advanced: {
    footprintCharts: true,
    volumeProfile: true,
    orderFlow: true,
    marketDepth: 20, // Analyze top 20 levels of order book
    aggregationTrades: 100, // Aggregate last 100 trades for flow analysis
  },

  // Logging
  logging: {
    level: 'info', // 'debug', 'info', 'warn', 'error'
    saveToFile: true,
    fileName: 'trading-system.log',
  },
};

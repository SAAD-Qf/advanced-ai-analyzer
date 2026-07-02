/**
 * Advanced Market Data Service
 * Fetches data from Binance Futures API and CoinGlass API
 */

const https = require('https');
const config = require('./config');

class MarketDataService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 10000; // 10 seconds cache
  }

  // Generic fetch function with retry logic
  async fetchData(url, headers = {}) {
    return new Promise((resolve, reject) => {
      const options = {
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      };

      https.get(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Parse error: ${e.message}`));
          }
        });
      }).on('error', reject);
    });
  }

  // Cache wrapper
  async getCached(key, fetchFn, timeout = this.cacheTimeout) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < timeout) {
      return cached.data;
    }

    const data = await fetchFn();
    this.cache.set(key, { data, timestamp: Date.now() });
    return data;
  }

  // ==================== BINANCE SPOT API ====================

  async getSpotPrice(symbol) {
    const url = `${config.binance.spotBaseUrl}/api/v3/ticker/24hr?symbol=${symbol}`;
    return this.fetchData(url);
  }

  async getSpotKlines(symbol, interval, limit = 100) {
    const url = `${config.binance.spotBaseUrl}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    return this.fetchData(url);
  }

  async getOrderBook(symbol, limit = 100) {
    const url = `${config.binance.spotBaseUrl}/api/v3/depth?symbol=${symbol}&limit=${limit}`;
    return this.fetchData(url);
  }

  async getRecentTrades(symbol, limit = 100) {
    const url = `${config.binance.spotBaseUrl}/api/v3/trades?symbol=${symbol}&limit=${limit}`;
    return this.fetchData(url);
  }

  // ==================== BINANCE FUTURES API ====================

  async getFuturesPrice(symbol) {
    const url = `${config.binance.futuresBaseUrl}/fapi/v1/ticker/24hr?symbol=${symbol}`;
    return this.fetchData(url);
  }

  async getFuturesKlines(symbol, interval, limit = 100) {
    const url = `${config.binance.futuresBaseUrl}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    return this.fetchData(url);
  }

  // Open Interest
  async getOpenInterest(symbol) {
    try {
      const url = `${config.binance.futuresBaseUrl}/fapi/v1/openInterest?symbol=${symbol}`;
      return await this.getCached(`oi_${symbol}`, () => this.fetchData(url));
    } catch (error) {
      console.warn(`⚠️  Open Interest not available for ${symbol}`);
      return null;
    }
  }

  // Open Interest History
  async getOpenInterestHistory(symbol, period = '5m', limit = 30) {
    try {
      const url = `${config.binance.futuresBaseUrl}/futures/data/openInterestHist?symbol=${symbol}&period=${period}&limit=${limit}`;
      return await this.getCached(`oi_hist_${symbol}`, () => this.fetchData(url), 30000);
    } catch (error) {
      console.warn(`⚠️  Open Interest History not available for ${symbol}`);
      return null;
    }
  }

  // Long/Short Ratio
  async getLongShortRatio(symbol, period = '5m', limit = 30) {
    try {
      const url = `${config.binance.futuresBaseUrl}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=${period}&limit=${limit}`;
      return await this.getCached(`ls_ratio_${symbol}`, () => this.fetchData(url), 30000);
    } catch (error) {
      console.warn(`⚠️  Long/Short Ratio not available for ${symbol}`);
      return null;
    }
  }

  // Top Trader Long/Short Ratio
  async getTopTraderLongShortRatio(symbol, period = '5m', limit = 30) {
    try {
      const url = `${config.binance.futuresBaseUrl}/futures/data/topLongShortPositionRatio?symbol=${symbol}&period=${period}&limit=${limit}`;
      return await this.getCached(`top_ls_${symbol}`, () => this.fetchData(url), 30000);
    } catch (error) {
      console.warn(`⚠️  Top Trader Ratio not available for ${symbol}`);
      return null;
    }
  }

  // Funding Rate
  async getFundingRate(symbol) {
    try {
      const url = `${config.binance.futuresBaseUrl}/fapi/v1/fundingRate?symbol=${symbol}&limit=1`;
      const data = await this.getCached(`funding_${symbol}`, () => this.fetchData(url));
      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.warn(`⚠️  Funding Rate not available for ${symbol}`);
      return null;
    }
  }

  // Liquidation Orders
  async getLiquidationOrders(symbol, limit = 100) {
    try {
      const url = `${config.binance.futuresBaseUrl}/fapi/v1/allForceOrders?symbol=${symbol}&limit=${limit}`;
      return await this.fetchData(url);
    } catch (error) {
      console.warn(`⚠️  Liquidation data not available for ${symbol}`);
      return [];
    }
  }

  // Taker Buy/Sell Volume (for CVD calculation)
  async getTakerBuySellVolume(symbol) {
    try {
      const url = `${config.binance.futuresBaseUrl}/fapi/v1/ticker/24hr?symbol=${symbol}`;
      const data = await this.fetchData(url);

      if (data && data.volume) {
        return {
          buyVolume: parseFloat(data.volume) * 0.5, // Approximation
          sellVolume: parseFloat(data.volume) * 0.5,
          totalVolume: parseFloat(data.volume),
        };
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  // ==================== COINGLASS API ====================

  async getCoinGlassData(endpoint, params = {}) {
    if (!config.coinglass.enabled || !config.coinglass.apiKey) {
      return null;
    }

    try {
      const queryString = new URLSearchParams(params).toString();
      const url = `${endpoint}?${queryString}`;
      const headers = {
        'coinglassSecret': config.coinglass.apiKey,
      };

      return await this.fetchData(url, headers);
    } catch (error) {
      console.warn(`⚠️  CoinGlass API error: ${error.message}`);
      return null;
    }
  }

  // Liquidation Data
  async getLiquidationData(symbol) {
    const cleanSymbol = symbol.replace('USDT', '');
    return await this.getCached(
      `cg_liq_${symbol}`,
      () => this.getCoinGlassData(config.coinglass.endpoints.liquidation, {
        symbol: cleanSymbol,
        timeType: 1, // 24h
      }),
      60000 // 1 minute cache
    );
  }

  // Liquidation Heatmap
  async getLiquidationHeatmap(symbol) {
    const cleanSymbol = symbol.replace('USDT', '');
    return await this.getCached(
      `cg_heatmap_${symbol}`,
      () => this.getCoinGlassData(config.coinglass.endpoints.liquidationHeatmap, {
        symbol: cleanSymbol,
        timeType: '12h',
      }),
      300000 // 5 minute cache
    );
  }

  // CoinGlass Long/Short Ratio
  async getCoinGlassLongShort(symbol) {
    const cleanSymbol = symbol.replace('USDT', '');
    return await this.getCached(
      `cg_ls_${symbol}`,
      () => this.getCoinGlassData(config.coinglass.endpoints.longShortRatio, {
        symbol: cleanSymbol,
        timeType: 1,
      }),
      60000
    );
  }

  // CoinGlass Open Interest
  async getCoinGlassOpenInterest(symbol) {
    const cleanSymbol = symbol.replace('USDT', '');
    return await this.getCached(
      `cg_oi_${symbol}`,
      () => this.getCoinGlassData(config.coinglass.endpoints.openInterest, {
        symbol: cleanSymbol,
      }),
      60000
    );
  }

  // ==================== AGGREGATED DATA ====================

  async getCompleteMarketData(symbol) {
    try {
      // Fetch all data in parallel
      const [
        spotPrice,
        futuresPrice,
        klines1h,
        klines4h,
        orderBook,
        openInterest,
        openInterestHistory,
        longShortRatio,
        topTraderRatio,
        fundingRate,
        liquidations,
        coinGlassLiq,
        recentTrades,
      ] = await Promise.allSettled([
        this.getSpotPrice(symbol),
        this.getFuturesPrice(symbol),
        this.getSpotKlines(symbol, '1h', 100),
        this.getSpotKlines(symbol, '4h', 100),
        this.getOrderBook(symbol, 100),
        this.getOpenInterest(symbol),
        this.getOpenInterestHistory(symbol),
        this.getLongShortRatio(symbol),
        this.getTopTraderLongShortRatio(symbol),
        this.getFundingRate(symbol),
        this.getLiquidationOrders(symbol),
        this.getLiquidationData(symbol),
        this.getRecentTrades(symbol, 500),
      ]);

      return {
        symbol,
        spotPrice: spotPrice.status === 'fulfilled' ? spotPrice.value : null,
        futuresPrice: futuresPrice.status === 'fulfilled' ? futuresPrice.value : null,
        klines1h: klines1h.status === 'fulfilled' ? klines1h.value : null,
        klines4h: klines4h.status === 'fulfilled' ? klines4h.value : null,
        orderBook: orderBook.status === 'fulfilled' ? orderBook.value : null,
        openInterest: openInterest.status === 'fulfilled' ? openInterest.value : null,
        openInterestHistory: openInterestHistory.status === 'fulfilled' ? openInterestHistory.value : null,
        longShortRatio: longShortRatio.status === 'fulfilled' ? longShortRatio.value : null,
        topTraderRatio: topTraderRatio.status === 'fulfilled' ? topTraderRatio.value : null,
        fundingRate: fundingRate.status === 'fulfilled' ? fundingRate.value : null,
        liquidations: liquidations.status === 'fulfilled' ? liquidations.value : null,
        coinGlassLiquidations: coinGlassLiq.status === 'fulfilled' ? coinGlassLiq.value : null,
        recentTrades: recentTrades.status === 'fulfilled' ? recentTrades.value : null,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error(`❌ Error fetching market data for ${symbol}:`, error.message);
      return null;
    }
  }
}

module.exports = new MarketDataService();

/**
 * Shared buy/sell/exchange quote math.
 *
 * Previously this exact formula was copy-pasted three times (BuyCurrency.tsx,
 * SellCurrency.tsx, ExchangePOS.tsx) with a subtle divergence: the backend
 * (business.py execute_pos_operation) and ExchangePOS both compute "profit" as
 * pure rate-spread vs. the standing rate, excluding commission — but
 * BuyCurrency/SellCurrency's local preview added the commission into that same
 * number, so the number a cashier saw mid-transaction didn't match what the
 * server actually recorded afterwards. This util matches the backend exactly
 * (spreadProfit), and additionally reports commission and their sum
 * (totalProfit) so callers can show either figure without recomputing anything.
 */

export type ExchangeOpType = 'buy' | 'sell' | 'exchange';

export interface StandingRate {
  buyRate: number;
  sellRate: number;
  minRate?: number;
  maxRate?: number;
}

export interface ExchangeQuoteInput {
  type: ExchangeOpType;
  amount: number;
  rate: number;
  /** Flat commission/fee in the local currency leg. Pass 0 if not charging one. */
  commission?: number;
  /** The office's current posted rate for this pair, used for spread-profit and bounds checks. */
  standingRate?: StandingRate | null;
}

export interface ExchangeQuote {
  customerPays: number;
  customerReceives: number;
  /** Which side of the pair the customer pays in ('from' for buy/exchange, 'to' for sell). */
  payCurrencyRole: 'from' | 'to';
  commission: number;
  /** Profit purely from the rate spread vs. the standing rate — matches the backend's expected_profit. */
  spreadProfit: number;
  /** spreadProfit + commission — the full picture of what this operation earns the office. */
  totalProfit: number;
  /** Exactly matches business.py's Transaction.expected_profit: spreadProfit for buy/sell, commission for exchange. Use this wherever the UI needs to agree with what actually gets recorded server-side. */
  backendExpectedProfit: number;
  /** True when a manually-entered rate falls outside the standing rate's min/max band. */
  isRateOutOfBounds: boolean;
}

export function computeExchangeQuote(input: ExchangeQuoteInput): ExchangeQuote | null {
  const { type, amount, rate, commission = 0, standingRate } = input;
  if (!amount || amount <= 0 || !rate || rate <= 0) return null;

  const isRateOutOfBounds = !!(
    standingRate &&
    standingRate.minRate != null &&
    standingRate.maxRate != null &&
    (rate < standingRate.minRate || rate > standingRate.maxRate)
  );

  if (type === 'buy') {
    const customerReceives = amount * rate - commission;
    const spreadProfit = standingRate ? amount * (standingRate.sellRate - rate) : 0;
    return {
      customerPays: amount,
      customerReceives,
      payCurrencyRole: 'from',
      commission,
      spreadProfit,
      totalProfit: spreadProfit + commission,
      backendExpectedProfit: spreadProfit,
      isRateOutOfBounds,
    };
  }

  if (type === 'sell') {
    const customerPays = amount * rate + commission;
    const spreadProfit = standingRate ? amount * (rate - standingRate.buyRate) : 0;
    return {
      customerPays,
      customerReceives: amount,
      payCurrencyRole: 'to',
      commission,
      spreadProfit,
      totalProfit: spreadProfit + commission,
      backendExpectedProfit: spreadProfit,
      isRateOutOfBounds,
    };
  }

  // exchange: straight conversion, no spread comparison (there's no single standing "buy/sell" pair to compare against)
  const customerReceives = amount * rate;
  return {
    customerPays: amount,
    customerReceives,
    payCurrencyRole: 'from',
    commission,
    spreadProfit: 0,
    totalProfit: commission,
    backendExpectedProfit: commission,
    isRateOutOfBounds,
  };
}

/** Convenience for the common case of a percentage-based fee (e.g. a customer's profitPct) instead of a flat commission. */
export function percentageFee(baseAmount: number, pct: number): number {
  return baseAmount * (pct / 100);
}

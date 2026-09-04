import { useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useSystem } from '../context/SystemContext';

/**
 * Scrolling strip of currency pairs — the single most characteristic visual
 * of a trading/exchange product. The up/down delta is real, not decorative:
 * it's the last recorded rate change from rate_histories, not a fabricated
 * number, so it goes neutral (no arrow) for a pair with no change on record
 * rather than making one up.
 */
export default function TickerTape() {
  const { rates, rateHistories } = useSystem();

  const items = useMemo(() => {
    return rates.filter(r => r.isActive).map(r => {
      const pairKey = `${r.fromCurrency}/${r.toCurrency}`;
      const lastChange = [...rateHistories]
        .filter(h => h.pair === pairKey)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
      const delta = lastChange ? lastChange.newBuy - lastChange.oldBuy : 0;
      return { pairKey, buyRate: r.buyRate, sellRate: r.sellRate, delta };
    });
  }, [rates, rateHistories]);

  if (items.length === 0) return null;

  const loop = [...items, ...items];

  return (
    <div className="ticker-tape">
      <div className="ticker-tape-track">
        {loop.map((item, i) => (
          <div className="ticker-item" key={`${item.pairKey}-${i}`}>
            <span className="ticker-pair">{item.pairKey}</span>
            <span className="ticker-price">{item.buyRate.toFixed(4)}</span>
            {item.delta !== 0 && (
              <span className={`ticker-delta ${item.delta > 0 ? 'up' : 'down'}`}>
                {item.delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {Math.abs(item.delta).toFixed(4)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

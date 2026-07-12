package main

import (
	"fmt"
	"sync"
	"sync/atomic"
	"time"
)

var orderSeq atomic.Int64

// newOrder builds an order receipt with a monotonic id and current timestamp.
func newOrder(side, asset string, amount, price, total float64) *Order {
	return &Order{
		ID:       fmt.Sprintf("ord_%06d", orderSeq.Add(1)),
		Side:     side,
		Asset:    asset,
		Amount:   amount,
		Price:    price,
		Total:    total,
		FilledAt: time.Now().UTC().Format(time.RFC3339),
	}
}

// quoteAsset is the fiat currency every trade settles in (Turkish Lira),
// mirroring a Paribu-style TRY market.
const quoteAsset = "TRY"

// prices is a fixed mock price table (asset -> TRY). No live market data — this
// is a deterministic demo server. TRY trivially prices at 1.
var prices = map[string]float64{
	"TRY":  1,
	"BTC":  4_250_000,
	"ETH":  235_000,
	"USDT": 41.50,
	"SOL":  9_800,
}

// Wallet is the whole (single-account) in-memory state. All access goes through
// the mutex so concurrent requests stay consistent. There is no database.
type Wallet struct {
	mu       sync.Mutex
	balances map[string]float64
}

func newWallet() *Wallet {
	return &Wallet{
		// A realistic starting point for the demo: some TRY, nothing else.
		balances: map[string]float64{quoteAsset: 100_000},
	}
}

func knownAsset(asset string) bool {
	_, ok := prices[asset]
	return ok
}

// snapshot returns a copy of all non-zero balances (safe to serialize).
func (wl *Wallet) snapshot() map[string]float64 {
	wl.mu.Lock()
	defer wl.mu.Unlock()
	out := make(map[string]float64, len(wl.balances))
	for k, v := range wl.balances {
		out[k] = v
	}
	return out
}

// Deposit credits funds to the wallet ("para geldi").
func (wl *Wallet) Deposit(asset string, amount float64) error {
	if !knownAsset(asset) {
		return fmt.Errorf("unknown asset %q", asset)
	}
	if amount <= 0 {
		return fmt.Errorf("amount must be positive")
	}
	wl.mu.Lock()
	defer wl.mu.Unlock()
	wl.balances[asset] += amount
	return nil
}

// Withdraw debits funds from the wallet ("para gitti").
func (wl *Wallet) Withdraw(asset string, amount float64) error {
	if !knownAsset(asset) {
		return fmt.Errorf("unknown asset %q", asset)
	}
	if amount <= 0 {
		return fmt.Errorf("amount must be positive")
	}
	wl.mu.Lock()
	defer wl.mu.Unlock()
	if wl.balances[asset] < amount {
		return fmt.Errorf("insufficient %s balance: have %.8f, need %.8f", asset, wl.balances[asset], amount)
	}
	wl.balances[asset] -= amount
	return nil
}

// Order is the receipt returned for a buy or sell.
type Order struct {
	ID       string  `json:"id"`
	Side     string  `json:"side"`  // "buy" | "sell"
	Asset    string  `json:"asset"` // e.g. "BTC"
	Amount   float64 `json:"amount"`
	Price    float64 `json:"price"`     // TRY per unit
	Total    float64 `json:"total_try"` // amount * price
	FilledAt string  `json:"filled_at"`
}

// Buy spends TRY to acquire a crypto asset ("kripto aldım").
func (wl *Wallet) Buy(asset string, amount float64) (*Order, error) {
	price, err := tradablePrice(asset, amount)
	if err != nil {
		return nil, err
	}
	cost := amount * price
	wl.mu.Lock()
	defer wl.mu.Unlock()
	if wl.balances[quoteAsset] < cost {
		return nil, fmt.Errorf("insufficient %s balance: have %.2f, need %.2f", quoteAsset, wl.balances[quoteAsset], cost)
	}
	wl.balances[quoteAsset] -= cost
	wl.balances[asset] += amount
	return newOrder("buy", asset, amount, price, cost), nil
}

// Sell converts a crypto asset back to TRY ("kripto sattım").
func (wl *Wallet) Sell(asset string, amount float64) (*Order, error) {
	price, err := tradablePrice(asset, amount)
	if err != nil {
		return nil, err
	}
	proceeds := amount * price
	wl.mu.Lock()
	defer wl.mu.Unlock()
	if wl.balances[asset] < amount {
		return nil, fmt.Errorf("insufficient %s balance: have %.8f, need %.8f", asset, wl.balances[asset], amount)
	}
	wl.balances[asset] -= amount
	wl.balances[quoteAsset] += proceeds
	return newOrder("sell", asset, amount, price, proceeds), nil
}

// tradablePrice validates a crypto asset + amount and returns its TRY price.
func tradablePrice(asset string, amount float64) (float64, error) {
	if asset == quoteAsset {
		return 0, fmt.Errorf("cannot trade the quote asset %s against itself", quoteAsset)
	}
	if !knownAsset(asset) {
		return 0, fmt.Errorf("unknown asset %q", asset)
	}
	if amount <= 0 {
		return 0, fmt.Errorf("amount must be positive")
	}
	return prices[asset], nil
}

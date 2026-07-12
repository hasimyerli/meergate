package main

import "net/http"

// balancesResponse is returned by the wallet/order endpoints so a caller (or a
// meerGate test) can immediately assert on the resulting state.
type balancesResponse struct {
	Balances map[string]float64 `json:"balances"`
	Quote    string             `json:"quote_asset"`
}

// fundRequest covers deposit and withdraw ("para geldi" / "para gitti").
type fundRequest struct {
	Asset  string  `json:"asset"`
	Amount float64 `json:"amount"`
}

// tradeRequest covers buy and sell ("kripto aldım" / "kripto sattım").
type tradeRequest struct {
	Asset  string  `json:"asset"`
	Amount float64 `json:"amount"`
}

type tradeResponse struct {
	Order    *Order             `json:"order"`
	Balances map[string]float64 `json:"balances"`
}

func (s *Server) handleBalances(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, balancesResponse{
		Balances: s.wallet.snapshot(),
		Quote:    quoteAsset,
	})
}

func (s *Server) handleDeposit(w http.ResponseWriter, r *http.Request) {
	var req fundRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if err := s.wallet.Deposit(req.Asset, req.Amount); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, balancesResponse{Balances: s.wallet.snapshot(), Quote: quoteAsset})
}

func (s *Server) handleWithdraw(w http.ResponseWriter, r *http.Request) {
	var req fundRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if err := s.wallet.Withdraw(req.Asset, req.Amount); err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, balancesResponse{Balances: s.wallet.snapshot(), Quote: quoteAsset})
}

func (s *Server) handleBuy(w http.ResponseWriter, r *http.Request) {
	var req tradeRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	order, err := s.wallet.Buy(req.Asset, req.Amount)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, tradeResponse{Order: order, Balances: s.wallet.snapshot()})
}

func (s *Server) handleSell(w http.ResponseWriter, r *http.Request) {
	var req tradeRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	order, err := s.wallet.Sell(req.Asset, req.Amount)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, tradeResponse{Order: order, Balances: s.wallet.snapshot()})
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "mock-exchange"})
}

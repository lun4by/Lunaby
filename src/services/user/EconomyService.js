const MariaModDB = require('../database/MariaModDB');

const MAX_BET = 250000;

function normalizeBetInput(rawInput) {
  if (rawInput === null || rawInput === undefined) {
    return null;
  }

  if (typeof rawInput === 'number') {
    return rawInput;
  }

  const text = String(rawInput).trim().toLowerCase();
  if (!text) {
    return null;
  }

  if (text === 'all') {
    return 'all';
  }

  const parsed = Math.trunc(Number(text));
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveBetAmount(rawInput, balance) {
  const normalized = normalizeBetInput(rawInput);
  if (normalized === null) {
    throw new Error('Số tiền cược không hợp lệ.');
  }

  if (normalized === 'all') {
    if (balance <= 0) {
      throw new Error('Bạn không có đủ credits để cược all.');
    }
    return Math.min(balance, MAX_BET);
  }

  if (normalized <= 0) {
    throw new Error('Số tiền cược phải lớn hơn 0.');
  }

  return Math.min(normalized, MAX_BET);
}

class EconomyService {
  async getBalance(userId) {
    return MariaModDB.getUserCredits(userId);
  }

  async claimDaily(userId) {
    return MariaModDB.claimDailyCredits(userId);
  }

  async playCoinflip(userId, bet, choice) {
    return MariaModDB.playCoinflip(userId, bet, choice);
  }

  async playBlackjack(userId, bet) {
    return MariaModDB.playBlackjack(userId, bet);
  }

  async beginBlackjack(userId, bet) {
    return MariaModDB.beginBlackjackBet(userId, bet);
  }

  async settleBlackjack(userId, amountToAdd) {
    return MariaModDB.settleBlackjackBet(userId, amountToAdd);
  }

  resolveBetAmount(rawInput, balance) {
    return resolveBetAmount(rawInput, balance);
  }
}

module.exports = new EconomyService();
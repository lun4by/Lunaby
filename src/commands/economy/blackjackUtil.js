const emojis = require('../../config/emojis');

const CARD_BACK_EMOJI = emojis.blackjack?.back || '🂠';
const CARD_EMOJIS = emojis.blackjack?.cards || [];
const CARD_FLIP_EMOJIS = emojis.blackjack?.cardsf || [];

function createDeck() {
  return Array.from({ length: 52 }, (_v, index) => index + 1);
}

function randCard(deck, type) {
  const index = Math.floor(Math.random() * deck.length);
  const card = deck.splice(index, 1)[0];
  return { card, type };
}

function initDeck(deck, player, dealer) {
  const usedCards = new Set([...player, ...dealer].map((entry) => entry.card));
  return deck.filter((card) => !usedCards.has(card));
}

function cardValue(hand) {
  let text = '';
  let points = 0;
  let shownPoints = 0;
  let aces = 0;

  for (const cardState of hand) {
    const value = cardState.card % 13;
    const isVisible = cardState.type === 'f' || cardState.type === 'c';

    if (cardState.type === 'f') {
      text += `${CARD_FLIP_EMOJIS[cardState.card] || CARD_EMOJIS[cardState.card] || CARD_BACK_EMOJI} `;
    } else if (cardState.type === 'c') {
      text += `${CARD_EMOJIS[cardState.card] || CARD_BACK_EMOJI} `;
    } else {
      text += `${CARD_BACK_EMOJI} `;
    }

    if (value >= 10 || value === 0) {
      points += 10;
      if (isVisible) shownPoints += 10;
      continue;
    }

    if (value > 1) {
      points += value;
      if (isVisible) shownPoints += value;
      continue;
    }

    points += 1;
    if (isVisible) shownPoints += 1;
    aces++;
  }

  let usedAces = 0;
  for (let i = 0; i < aces; i++) {
    points += 10;
    if (points > 21) {
      usedAces++;
      points -= 10;
    }
  }

  return {
    display: text.trim(),
    points,
    shownPoints,
    ace: aces > 0 && usedAces < aces,
  };
}

module.exports = {
  createDeck,
  randCard,
  initDeck,
  cardValue,
};
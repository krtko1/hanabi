import IGameState, {
  IAction,
  IHand,
  ICard,
  ICardHint,
  IHintAction,
  IGameOptions,
  IColor,
  IPlayer,
  IGameStatus,
  INumber
} from "./state";
import { cloneDeep, isEqual, findIndex, flatMap, range, omit } from "lodash";
import assert from "assert";
import { shuffle } from "shuffle-seed";

export function commitAction(state: IGameState, action: IAction): IGameState {
  // the function should be pure
  const s = cloneDeep(state) as IGameState;

  assert(action.from === state.currentPlayer);
  const player = s.players[action.from];

  if (action.action === "discard" || action.action === "play") {
    // remove the card from hand
    const [card] = player.hand.splice(action.cardIndex, 1);
    /** PLAY */
    if (action.action === "play") {
      if (isPlayable(card, s.playedCards)) {
        if (!s.playedCards) {
          s.playedCards = [];
        }
        s.playedCards.push(card);
        if (card.number === 5) {
          // play a 5, win a hint
          s.tokens.hints += 1;
        }
      } else {
        // strike !
        s.tokens.strikes -= 1;
        s.discardPile.push(action.card);
      }
    } else {
      if (!s.discardPile) {
        s.discardPile = [];
      }

      /** DISCARD */
      s.discardPile.push(card);
      if (s.tokens.hints < 8) s.tokens.hints += 1;
    }

    // in both cases (play, discard) we need to remove a card from the hand and get a new one
    const newCard = s.drawPile.pop();
    if (newCard) {
      newCard.hint = emptyHint(state.options);
      player.hand.unshift(newCard);
    }
  }

  /** HINT */
  if (action.action === "hint") {
    assert(s.tokens.hints > 0);
    s.tokens.hints -= 1;

    assert(action.from !== action.to);
    const hand = s.players[action.to].hand;
    applyHint(hand, action);
  }

  // there's no card in the pile (or the last card was just drawn)
  // decrease the actionsLeft counter.
  // The game ends when it reaches 0.
  if (s.drawPile.length === 0) {
    s.actionsLeft -= 1;
  }

  // update player
  s.currentPlayer = (s.currentPlayer + 1) % s.options.playersCount;

  return s;
}

/**
 * Side effect function that applies the given hint on a given hand's cards
 */
function applyHint(hand: IHand, hint: IHintAction) {
  hand.forEach(card => {
    if (card[hint.type] === hint.value) {
      // positive hint, e.g. card is a red 5 and the hint is "color red"
      Object.keys(card.hint[hint.type]).forEach(value => {
        if (value == hint.value) {
          // == because we want '2' == 2
          // it has to be this value
          card.hint[hint.type][value] = 2;
        } else {
          // all other values are impossible
          card.hint[hint.type][value] = 0;
        }
      });
    } else {
      // negative hint
      card.hint[hint.type][hint.value] = 0;
    }
  });
}

export function isPlayable(card: ICard, playedCards: ICard[]): boolean {
  const isPreviousHere =
    card.number === 1 || // first card on the pile
    findIndex(
      playedCards,
      c => card.number === c.number + 1 && card.color === c.color
    ) > -1; // previous card belongs to the playedCards

  const isSameNotHere = findIndex(playedCards, c => isEqual(c, card)) === -1;

  return isPreviousHere && isSameNotHere;
}

export function emptyHint(options: IGameOptions): ICardHint {
  return {
    color: {
      blue: 1,
      red: 1,
      green: 1,
      white: 1,
      yellow: 1,
      multicolor: options.multicolor ? 1 : 0
    },
    number: { 0: 0, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }
  };
}

export function emptyPlayer(id: string, name: string): IPlayer {
  return {
    hand: [],
    name,
    id
  };
}

export function isGameOver(state: IGameState) {
  return (
    state.actionsLeft <= 0 ||
    state.tokens.strikes <= 0 ||
    state.playedCards.length === (state.options.multicolor ? 30 : 25)
  );
}

export function getScore(state: IGameState) {
  return state.playedCards.length;
}

export function getPlayedCardsPile(state: IGameState) {
  const playedCardsPile = {};
  state.playedCards.forEach(
    c =>
      (playedCardsPile[c.color] = Math.max(
        playedCardsPile[c.color] || 0,
        c.number
      ))
  );

  return playedCardsPile;
}

/**
 * new game utilities
 */

export const colors: IColor[] = [
  IColor.BLUE,
  IColor.RED,
  IColor.GREEN,
  IColor.WHITE,
  IColor.YELLOW,
  IColor.MULTICOLOR
];

export const numbers: INumber[] = [1, 2, 3, 4, 5];

const startingHandSize = { 2: 5, 3: 5, 4: 4, 5: 4 };

export function joinGame(state: IGameState, player: IPlayer): IGameState {
  const game = cloneDeep(state) as IGameState;
  const hand = game.drawPile.splice(0, startingHandSize[game.playersCount]);

  game.players = game.players || [];
  game.players.push({ ...player, hand, index: game.players.length });

  hand.forEach(card => (card.hint = emptyHint(state.options)));

  hand[0].hint.number[1] = 0;
  hand[0].hint.number[2] = 0;
  hand[0].hint.number[3] = 0;
  hand[0].hint.number[4] = 2;
  hand[0].hint.number[5] = 0;
  hand[0].hint.color.blue = 0;
  hand[0].hint.color.green = 0;
  hand[0].hint.color.red = 0;
  hand[0].hint.color.yellow = 0;
  hand[0].hint.color.white = 2;

  hand[1].hint.number[1] = 0;
  hand[1].hint.number[4] = 0;
  hand[1].hint.number[5] = 0;

  hand[2].hint.color.green = 0;
  hand[2].hint.color.white = 0;

  hand[3].hint.color.blue = 0;
  hand[3].hint.color.green = 0;
  hand[3].hint.color.red = 2;
  hand[3].hint.color.yellow = 0;
  hand[3].hint.color.white = 0;

  return game;
}

export function newGame(options: IGameOptions): IGameState {
  if (options.seed === undefined) options.seed = +new Date() * Math.random();

  assert(options.playersCount > 1 && options.playersCount < 6);

  const gameColors = [...colors];
  if (!options.multicolor) {
    gameColors.splice(gameColors.indexOf(IColor.MULTICOLOR), 1);
  }

  const cards: ICard[] = flatMap(gameColors, color => [
    { number: 1, color },
    { number: 1, color },
    { number: 1, color },
    { number: 2, color },
    { number: 2, color },
    { number: 3, color },
    { number: 3, color },
    { number: 4, color },
    { number: 4, color },
    { number: 5, color }
  ]);

  // Add extensions cards when applicable
  if (options.multicolor) {
    cards.push(
      { number: 1, color: IColor.MULTICOLOR },
      { number: 2, color: IColor.MULTICOLOR },
      { number: 3, color: IColor.MULTICOLOR },
      { number: 4, color: IColor.MULTICOLOR },
      { number: 5, color: IColor.MULTICOLOR }
    );
  }

  const deck = shuffle(cards, options.seed);

  const currentPlayer = shuffle(range(options.playersCount), options.seed)[0];

  return {
    status: IGameStatus.LOBBY,
    playersCount: options.playersCount,
    playedCards: [],
    drawPile: deck,
    discardPile: [],
    players: [],
    tokens: {
      hints: 8,
      strikes: 3
    },
    currentPlayer,
    options,
    actionsLeft: options.playersCount + 1 // this will be decreased when the draw pile is empty
  };
}
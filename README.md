# KhepriChess

A chess engine written in Typescript and using Javascript's native 64-bit integer support ([bigint](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt)) for things like bitboards and hashing.

### Play against KhepriChess!
[Browser example](https://kurt1288.github.io/KhepriChess/examples/khepri.html)

## Install

Files for both browser and UCI usage can be found in the dist directory.

1. In a browser:

   ```html
   <script src="kheprichess.js" />
   ```
   or

   ```js
   import Engine from 'kheprichess';
   ```

2. Through UCI protocol:

   1. Download and install [nodejs](https://nodejs.org/en/).
   2. To add the engine to your GUI:
      * In Arena, the command line should be the path to the nodejs executable. In the "Command Line Parameters" field, specify the path to the `kheprichessuci.js` file.
      * In Cute Chess, the command field should look something like `<Nodejs directory>\node.exe "<Khepri directory>\kheprichessuci.js"`

## A note about browser use

Please note that this engine works with the UCI protocol and its general design priciple. What this means is that there is no exposed move validation, piece placement, check detection, etc. like you would find in the [chess.js](https://github.com/jhlywa/chess.js) library (which does those things, but doesn't have the AI part). As such, the engine will attempt to make any move you tell it to, even an invalid one.

For an example of integrating KhepriChess with validation from chess.js, please see [the example](https://kurt1288.github.io/KhepriChess/examples/khepri.html).

## Api

### Constructor

Initialize the engine, to the start position by default. Pass a FEN string to initialize to that FEN position instead.

```js
// initialize with default starting position
const engine = new Engine();

// initialize to specific position by passing a FEN string
const engine = new Engine('8/8/p7/8/1PK5/5k1p/8/6Q1 b - - 2 49');
```

### Print Board

Out the current board to the console. Option boolean set to true can be passed to output as unicode instead of ascii.

```js
// Prints the current board with ascii characters (P, Q, K, etc.)
engine.PrintBoard();

// Prints the current board with unicode characters (♛, ♞, ♟︎, etc.)
engine.PrintBoard(true);
```

### Parse FEN

Sets the current board position to the given FEN string.

```js
engine.ParseFEN('8/8/p7/8/1PK5/5k1p/8/6Q1 b - - 2 49');
```

### Set Transposition Table Size

Sets the hash table size. Value must be between 1 and 512, inclusive.

```js
engine.InitHashTable(128);
```

### Parse UCI Position

Tell the engine to parse the UCI position command. The string passed in should generally follow the format of `position startpos moves [list of space-delimited moves]`

```js
// from the starting board position, make the moves e2->e4 and d7->d5
engine.ParseUCIPostion('position startpos moves e2e4 d7d5');
```

### Parse UCI Go

Tells the engine to begin searching the current position for the best move.

```js
// search to a depth of 5
engine.ParseUCIGo('go depth 5');

// search for 5 seconds
engine.ParseUCIGo('go movetime 5');
```

### Search

Search the current position, to the provided depth, for the best move.

```js
// search the current position for the best move, to a depth of 10.
engine.Search(10);
```

### Performance Test

Run a perft test on the current position (warning, high depth values can be slow).

```js
// run to a depth of 5.
engine.Perft(5);
```

## Improvements/To Do

A generalized list of things that I'd like to do can be found [here](https://github.com/kurt1288/KhepriChess/wiki/Improvements).

## Special Thanks

A huge thanks to Maksim Korzh, aka Code Monkey King, and his [video tutorial series](https://www.youtube.com/playlist?list=PLmN0neTso3Jxh8ZIylk74JpwfiWNI76Cs) on bitboards. Without it, I never would have gotten anywhere.

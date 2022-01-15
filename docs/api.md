# Api

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
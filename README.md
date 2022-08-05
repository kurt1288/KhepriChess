# KhepriChess 𓆣

A UCI-compatible chess engine written in Typescript that uses Javascript's native 64-bit integer support ([bigint](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt)) for things like bitboards and hashing.

### Play against KhepriChess!
[Browser example](https://kurt1288.github.io/KhepriChess/examples/khepri.html)

## Install

You can download builds from the [Releases page](https://github.com/kurt1288/KhepriChess/releases). Included are files for use in a browser (kheprichess_browser.js) and use in a UCI-supporting application (kheprichess_uci.js).

## Usage

1. In a browser:

   ```html
   <script src="kheprichess_browser.js" />
   ```
   or

   ```js
   import Engine from 'kheprichess_browser';
   ```

2. In a GUI that supports the UCI protocol:

   1. Download and install [nodejs](https://nodejs.org/en/).
   2. To add the engine to your GUI:
      * In Arena, the command line should be the path to the nodejs executable. In the "Command Line Parameters" field, specify the path to the `kheprichess_uci.js` file.
      * In Cute Chess, the command field should look something like `<Nodejs directory>\node.exe "<Khepri directory>\kheprichess_uci.js"`

Please note there is no exposed move validation, piece placement, check detection, etc. like you would find in the [chess.js](https://github.com/jhlywa/chess.js) library (which does those things, but doesn't have the AI part). As such, the engine will attempt to make any move you tell it to, even an invalid one.

For an example of integrating KhepriChess with validation from chess.js, please see [the example](https://kurt1288.github.io/KhepriChess/examples/khepri.html).

## Api

Found [here](docs/api.md).

## Improvements/To Do

A generalized list of things that I'd like to do can be found [here](https://github.com/kurt1288/KhepriChess/wiki/Improvements).

## Special Thanks

A huge thanks to Maksim Korzh, aka Code Monkey King, and his [video tutorial series](https://www.youtube.com/playlist?list=PLmN0neTso3Jxh8ZIylk74JpwfiWNI76Cs) on bitboards. Without it, I never would have gotten anywhere.

# KhepriChess 𓆣

KhepriChess is a JavaScript (written in TypeScript) chess engine. It uses native 64-bit integers for bitboard representation.

### Play against KhepriChess!
[Browser example](https://kurt1288.github.io/KhepriChess/examples/khepri.html)

[Lichess](https://lichess.org/@/KhepriChess)

## Usage

KhepriChess can be used in both a browser or with a GUI the can run UCI engines. Please make sure you use the appropriately named file for the necessary application.

### Browsers

Use the `kheprichess_browser.js" file. Add the file to your HTML page like you would any other JS file, either

```js
<script src="kheprichess_browser.js" />
```
or
```js
import Engine from 'kheprichess_browser';
```

For a more in-depth example of using it in the browser, please see the [the example page](https://kurt1288.github.io/KhepriChess/examples/khepri.html).

### UCI

Nodejs is required. Please download the latest version (or the LTS version) [here](https://nodejs.org/en/).

Once node is installed, you can add KhepriChess to a GUI program, like Arena or Cute Chess.

* In [Arena](http://www.playwitharena.de/), the command line should be the path to the nodejs executable. In the "Command Line Parameters" field, specify the path to the kheprichess_uci.js file.

* In [Cute Chess](https://cutechess.com/), the command field should look something like `<Nodejs directory>\node.exe "<Khepri directory>\kheprichess_uci.js"`.

## Polyglot

KhepriChess supports the use of a polyglot opening book. Simply place a book file with the name of `khepri_polyglot.bin` in the same directory that the JS file is running from and it will automatically detect and load it.

Please note: The browser version does not support polyglot.

## Special Thanks

A huge thanks to Maksim Korzh, aka Code Monkey King, and his [video tutorial series](https://www.youtube.com/playlist?list=PLmN0neTso3Jxh8ZIylk74JpwfiWNI76Cs) on bitboards. Without it, I never would have gotten anywhere.

Also a huge thanks to everyone at the [talkchess](https://talkchess.com/forum3/index.php) forums for providing value support and answers to my terrible questions.

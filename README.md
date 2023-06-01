# KhepriChess 𓆣

<div align="center">
![GitHub](https://img.shields.io/github/license/kurt1288/KhepriChess?style=for-the-badge)
![GitHub all releases](https://img.shields.io/github/downloads/kurt1288/KhepriChess/total?style=for-the-badge)
![GitHub package.json version](https://img.shields.io/github/package-json/v/kurt1288/KhepriChess?style=for-the-badge)
</div>

KhepriChess is a chess engine written in TypeScript (JavaScript).

For instructions on using KhepriChess, see the [Usage](#usage) section below.

## About

Why a chess engine in JavaScript? My goal here is simply to see what JS can do and learn something about chess engine programming along the way. And I wanted to try something that hadn't been done in a JS chess engine...

### Board Representation

Unlike other JS chess engines, KhepriChess uses 64-bit bitboards for board representation. Prior to the introduction of `BigInt`, JS was unable to represent *integers* larger than 32-bits. For chess bitboards, this meant having to use two 32-bit boards: one for the upper 32-bits and one for the lower 32-bits.

There is a trade-off, though, to using `BigInt`. While it makes various aspects of programming a chess engine easier, the way BigInts are implemented in JS make them *extremely* slow (compared to regular Numbers). More on this can be found in [this](https://v8.dev/blog/bigint#representing-bigints-in-memory) V8 blog post.

## Play against KhepriChess!
[Browser example](https://kurt1288.github.io/KhepriChess/examples/khepri.html)

[Lichess](https://lichess.org/@/KhepriChess)

## Usage

KhepriChess is only an engine and does not provide any sort of UI. For that, you can use it in a browser or a UCI-compatible GUI. A `.js` file provided for browsers and prebuilt binaries for Windows, Linux, and Mac.

### Browsers

KhepriChess can be added with:

```js
<script src="kheprichess_browser.js" />
```
or
```js
import Engine from 'kheprichess_browser';
```

For a more in-depth example of using it in the browser, please see the [the example page](https://kurt1288.github.io/KhepriChess/examples/khepri.html).

### UCI

Follow the instructions for the particular GUI program on adding a new engine. Some free programs are:

* [Cute Chess](https://cutechess.com/)
* [Banksia GUI](https://banksiagui.com/)
* [Arena](http://www.playwitharena.de/)

## Chess960

KhepriChess supports the Chess960 (Fischer Random Chess) variant. To enable:

* Browser: set the `isChess960` property to true
* UCI: Use the UCI option

## Polyglot

KhepriChess supports the use of a polyglot opening book. Simply place a book file with the name of `khepri_polyglot.bin` in the same directory that the JS file is running from and it will automatically detect and load it.

Please note: The browser version does not support polyglot.

## Special Thanks

A huge thanks to Maksim Korzh, aka Code Monkey King, and his [video tutorial series](https://www.youtube.com/playlist?list=PLmN0neTso3Jxh8ZIylk74JpwfiWNI76Cs) on bitboards. Without it, I never would have gotten anywhere.

Also a huge thanks to everyone at the [talkchess](https://talkchess.com/forum3/index.php) forums for providing value support and answers to my terrible questions.

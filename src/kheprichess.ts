interface IPieceChars {
   [index: string]: Pieces
}

interface IPromotedPieces {
   [index: number]: string
};

interface BoardCopy {
   bitboards: bigint[]
   occupancies: bigint[]
   side: SideToMove
   enpassant: Square
   castle: number
   hashKey: bigint
}

enum GamePhase {
   Opening,
   Endgame,
   MiddleGame
}

enum Square {
   a8, b8, c8, d8, e8, f8, g8, h8,
   a7, b7, c7, d7, e7, f7, g7, h7,
   a6, b6, c6, d6, e6, f6, g6, h6,
   a5, b5, c5, d5, e5, f5, g5, h5,
   a4, b4, c4, d4, e4, f4, g4, h4,
   a3, b3, c3, d3, e3, f3, g3, h3,
   a2, b2, c2, d2, e2, f2, g2, h2,
   a1, b1, c1, d1, e1, f1, g1, h1, no_sq,
}

enum SideToMove {
   White,
   Black,
   Both,
}

enum Piece {
   rook,
   bishop,
}

enum CastleRights {
   /**
    *    bin   dec
    *    0001  1     white king castle king side
    *    0010  2     white king castle queen side
    *    0100  4     black king castle king side
    *    1000  8     black king castle queen side
    */
   wk = 1, wq = 2, bk = 4, bq = 8
}

enum Pieces {
   /**
    * Uppercase = white, lowercase = black
    */
   P, N, B, R, Q, K, p, n, b, r, q, k
}

const SquareToCoords = [
   "a8", "b8", "c8", "d8", "e8", "f8", "g8", "h8",
   "a7", "b7", "c7", "d7", "e7", "f7", "g7", "h7",
   "a6", "b6", "c6", "d6", "e6", "f6", "g6", "h6",
   "a5", "b5", "c5", "d5", "e5", "f5", "g5", "h5",
   "a4", "b4", "c4", "d4", "e4", "f4", "g4", "h4",
   "a3", "b3", "c3", "d3", "e3", "f3", "g3", "h3",
   "a2", "b2", "c2", "d2", "e2", "f2", "g2", "h2",
   "a1", "b1", "c1", "d1", "e1", "f1", "g1", "h1",
];

const castlingRights = [
    7, 15, 15, 15,  3, 15, 15, 11,
   15, 15, 15, 15, 15, 15, 15, 15,
   15, 15, 15, 15, 15, 15, 15, 15,
   15, 15, 15, 15, 15, 15, 15, 15,
   15, 15, 15, 15, 15, 15, 15, 15,
   15, 15, 15, 15, 15, 15, 15, 15,
   15, 15, 15, 15, 15, 15, 15, 15,
   13, 15, 15, 15, 12, 15, 15, 14
];

/**
 * Why this array? It's a lot faster to look up the
 * corresponding bigint value for a given square
 * than it is to cast it to a BigInt.
 * i.e squareBigInt[index] is faster than BigInt(index)
 */
const squareBigInt = [
    0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n,
    9n, 10n, 11n, 12n, 13n, 14n, 15n, 16n,
   17n, 18n, 19n, 20n, 21n, 22n, 23n, 24n,
   25n, 26n, 27n, 28n, 29n, 30n, 31n, 32n,
   33n, 34n, 35n, 36n, 37n, 38n, 39n, 40n,
   41n, 42n, 43n, 44n, 45n, 46n, 47n, 48n,
   49n, 50n, 51n, 52n, 53n, 54n, 55n, 56n,
   57n, 58n, 59n, 60n, 61n, 62n, 63n, 64n, 65n
];

/*
 * <><><><><><><><><><><><><><><><><><>
 *
 *       Pseudo random numbers
 *
 * <><><><><><><><><><><><><><><><><><>
 */
let randomStateSeed = 1804289383;
function getRandomU32Number() {
   let number = randomStateSeed;

   // XORShift. See https://github.com/bryc/code/blob/master/jshash/PRNGs.md
   number ^= number << 13;
   number ^= number >>> 17;
   number ^= number << 5;

   randomStateSeed = number;

   return BigInt.asUintN(32, BigInt(number));
}

function getRandomU64Number() {
   const u1 = BigInt.asUintN(64, getRandomU32Number() & 0xFFFFn);
   const u2 = BigInt.asUintN(64, getRandomU32Number() & 0xFFFFn);
   const u3 = BigInt.asUintN(64, getRandomU32Number() & 0xFFFFn);
   const u4 = BigInt.asUintN(64, getRandomU32Number() & 0xFFFFn);

   return BigInt.asUintN(64, BigInt(u1 | (u2 << 16n) | (u3 << 32n) | (u4 << 48n)));
}

function generateMagicNumber() {
   return BigInt.asUintN(64, getRandomU64Number() & getRandomU64Number() & getRandomU64Number());
}

/*
 * <><><><><><><><><><><><><><><><><><>
 *
 *            Main Engine
 *
 * <><><><><><><><><><><><><><><><><><>
 */

class Engine {
   readonly name = "KhepriChess";
   readonly version = "1.0.0";
   readonly author = "Kurt Peters";
   private bitboards = [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
   private occupancies = [0n, 0n, 0n];
   private side: SideToMove = -1;
   private enpassant = Square.no_sq;
   private castle = 0;
   private nodesCount = 0;
   private gamePhase = GamePhase.Opening;
   private readonly notAFile = 18374403900871474942n;
   private readonly notHFile = 9187201950435737471n;
   private readonly notHGFile = 4557430888798830399n;
   private readonly notABFile = 18229723555195321596n;
   private readonly asciiPieces = "PNBRQKpnbrqk";
   private readonly unicodePieces = [ "♙", "♘", "♗", "♖", "♕", "♔", "♟︎", "♞", "♝", "♜", "♛", "♚" ];
   private readonly moveStack: BoardCopy[] = [];
   private readonly pawnAttacks: bigint[][] = Array.from(Array(2), () => new Array(64));
   private readonly knightAttacks: bigint[] = Array(64);
   private readonly kingAttacks: bigint[] = Array(64);
   private readonly sliderRays: bigint[] = Array(64);
   private readonly bishopMasks: bigint[] = Array(64);
   private readonly bishopAttacks: bigint[][] = Array.from(Array(64), () => new Array(512));
   private readonly bishopRelevantBits = [
      6n, 5n, 5n, 5n, 5n, 5n, 5n, 6n, 
      5n, 5n, 5n, 5n, 5n, 5n, 5n, 5n, 
      5n, 5n, 7n, 7n, 7n, 7n, 5n, 5n, 
      5n, 5n, 7n, 9n, 9n, 7n, 5n, 5n, 
      5n, 5n, 7n, 9n, 9n, 7n, 5n, 5n, 
      5n, 5n, 7n, 7n, 7n, 7n, 5n, 5n, 
      5n, 5n, 5n, 5n, 5n, 5n, 5n, 5n, 
      6n, 5n, 5n, 5n, 5n, 5n, 5n, 6n,
   ];
   private readonly rookMasks: bigint[] = Array(64);
   private readonly rookAttacks: bigint[][] = Array.from(Array(64), () => new Array(4096));
   private readonly rookRelevantBits = [
      12n, 11n, 11n, 11n, 11n, 11n, 11n, 12n, 
      11n, 10n, 10n, 10n, 10n, 10n, 10n, 11n, 
      11n, 10n, 10n, 10n, 10n, 10n, 10n, 11n, 
      11n, 10n, 10n, 10n, 10n, 10n, 10n, 11n, 
      11n, 10n, 10n, 10n, 10n, 10n, 10n, 11n, 
      11n, 10n, 10n, 10n, 10n, 10n, 10n, 11n, 
      11n, 10n, 10n, 10n, 10n, 10n, 10n, 11n, 
      12n, 11n, 11n, 11n, 11n, 11n, 11n, 12n,
   ];

   // convert ASCII character pieces to encoded constants
   private readonly asciiEncodePieces: IPieceChars = {
      ['P']: Pieces.P,
      ['N']: Pieces.N,
      ['B']: Pieces.B,
      ['R']: Pieces.R,
      ['Q']: Pieces.Q,
      ['K']: Pieces.K,
      ['p']: Pieces.p,
      ['n']: Pieces.n,
      ['b']: Pieces.b,
      ['r']: Pieces.r,
      ['q']: Pieces.q,
      ['k']: Pieces.k
   };

   private readonly promotedPieces: IPromotedPieces = {
      [Pieces.Q as number]: 'q',
      [Pieces.R as number]: 'r',
      [Pieces.B as number]: 'b',
      [Pieces.N as number]: 'n',
      [Pieces.q as number]: 'q',
      [Pieces.r as number]: 'r',
      [Pieces.b as number]: 'b',
      [Pieces.n as number]: 'n'
   }

   private readonly rookMagicNumbers = [
      0x8a80104000800020n,
      0x140002000100040n,
      0x2801880a0017001n,
      0x100081001000420n,
      0x200020010080420n,
      0x3001c0002010008n,
      0x8480008002000100n,
      0x2080088004402900n,
      0x800098204000n,
      0x2024401000200040n,
      0x100802000801000n,
      0x120800800801000n,
      0x208808088000400n,
      0x2802200800400n,
      0x2200800100020080n,
      0x801000060821100n,
      0x80044006422000n,
      0x100808020004000n,
      0x12108a0010204200n,
      0x140848010000802n,
      0x481828014002800n,
      0x8094004002004100n,
      0x4010040010010802n,
      0x20008806104n,
      0x100400080208000n,
      0x2040002120081000n,
      0x21200680100081n,
      0x20100080080080n,
      0x2000a00200410n,
      0x20080800400n,
      0x80088400100102n,
      0x80004600042881n,
      0x4040008040800020n,
      0x440003000200801n,
      0x4200011004500n,
      0x188020010100100n,
      0x14800401802800n,
      0x2080040080800200n,
      0x124080204001001n,
      0x200046502000484n,
      0x480400080088020n,
      0x1000422010034000n,
      0x30200100110040n,
      0x100021010009n,
      0x2002080100110004n,
      0x202008004008002n,
      0x20020004010100n,
      0x2048440040820001n,
      0x101002200408200n,
      0x40802000401080n,
      0x4008142004410100n,
      0x2060820c0120200n,
      0x1001004080100n,
      0x20c020080040080n,
      0x2935610830022400n,
      0x44440041009200n,
      0x280001040802101n,
      0x2100190040002085n,
      0x80c0084100102001n,
      0x4024081001000421n,
      0x20030a0244872n,
      0x12001008414402n,
      0x2006104900a0804n,
      0x1004081002402n
   ];

   private readonly bishopMagicNumbers = [
      0x40040844404084n,
      0x2004208a004208n,
      0x10190041080202n,
      0x108060845042010n,
      0x581104180800210n,
      0x2112080446200010n,
      0x1080820820060210n,
      0x3c0808410220200n,
      0x4050404440404n,
      0x21001420088n,
      0x24d0080801082102n,
      0x1020a0a020400n,
      0x40308200402n,
      0x4011002100800n,
      0x401484104104005n,
      0x801010402020200n,
      0x400210c3880100n,
      0x404022024108200n,
      0x810018200204102n,
      0x4002801a02003n,
      0x85040820080400n,
      0x810102c808880400n,
      0xe900410884800n,
      0x8002020480840102n,
      0x220200865090201n,
      0x2010100a02021202n,
      0x152048408022401n,
      0x20080002081110n,
      0x4001001021004000n,
      0x800040400a011002n,
      0xe4004081011002n,
      0x1c004001012080n,
      0x8004200962a00220n,
      0x8422100208500202n,
      0x2000402200300c08n,
      0x8646020080080080n,
      0x80020a0200100808n,
      0x2010004880111000n,
      0x623000a080011400n,
      0x42008c0340209202n,
      0x209188240001000n,
      0x400408a884001800n,
      0x110400a6080400n,
      0x1840060a44020800n,
      0x90080104000041n,
      0x201011000808101n,
      0x1a2208080504f080n,
      0x8012020600211212n,
      0x500861011240000n,
      0x180806108200800n,
      0x4000020e01040044n,
      0x300000261044000an,
      0x802241102020002n,
      0x20906061210001n,
      0x5a84841004010310n,
      0x4010801011c04n,
      0xa010109502200n,
      0x4a02012000n,
      0x500201010098b028n,
      0x8040002811040900n,
      0x28000010020204n,
      0x6000020202d0240n,
      0x8918844842082200n,
      0x4010011029020020n
   ];

   private readonly pieceValue = [
      // position in array corresponds to the enum values of the pieces
      // opening/middlegame scores
      [82, 337, 365, 477, 1025, 12000, -82, -337, -365, -477, -1025, -12000],
      // endgame scores
      [94, 281, 297, 512,  936, 12000, -94, -281, -297, -512,  -936, -12000]
   ];

   private readonly pieceSquareValues = [
      // opening/middle game values
      [
         // pawn
         [
               0,   0,   0,   0,   0,   0,  0,   0,
              98, 134,  61,  95,  68, 126, 34, -11,
              -6,   7,  26,  31,  65,  56, 25, -20,
             -14,  13,   6,  21,  23,  12, 17, -23,
             -27,  -2,  -5,  12,  17,   6, 10, -25,
             -26,  -4,  -4, -10,   3,   3, 33, -12,
             -35,  -1, -20, -23, -15,  24, 38, -22,
               0,   0,   0,   0,   0,   0,  0,   0
         ],
         
         // knight
         [
            -167, -89, -34, -49,  61, -97, -15, -107,
             -73, -41,  72,  36,  23,  62,   7,  -17,
             -47,  60,  37,  65,  84, 129,  73,   44,
              -9,  17,  19,  53,  37,  69,  18,   22,
             -13,   4,  16,  13,  28,  19,  21,   -8,
             -23,  -9,  12,  10,  19,  17,  25,  -16,
             -29, -53, -12,  -3,  -1,  18, -14,  -19,
            -105, -21, -58, -33, -17, -28, -19,  -23
         ],

         // bishop
         [
            -29,   4, -82, -37, -25, -42,   7,  -8,
            -26,  16, -18, -13,  30,  59,  18, -47,
            -16,  37,  43,  40,  35,  50,  37,  -2,
             -4,   5,  19,  50,  37,  37,   7,  -2,
             -6,  13,  13,  26,  34,  12,  10,   4,
              0,  15,  15,  15,  14,  27,  18,  10,
              4,  15,  16,   0,   7,  21,  33,   1,
            -33,  -3, -14, -21, -13, -12, -39, -21
         ],

         // rook
         [
             32,  42,  32,  51, 63,  9,  31,  43,
             27,  32,  58,  62, 80, 67,  26,  44,
             -5,  19,  26,  36, 17, 45,  61,  16,
            -24, -11,   7,  26, 24, 35,  -8, -20,
            -36, -26, -12,  -1,  9, -7,   6, -23,
            -45, -25, -16, -17,  3,  0,  -5, -33,
            -44, -16, -20,  -9, -1, 11,  -6, -71,
            -19, -13,   1,  17, 16,  7, -37, -26
         ],

         // queen
         [
            -28,   0,  29,  12,  59,  44,  43,  45,
            -24, -39,  -5,   1, -16,  57,  28,  54,
            -13, -17,   7,   8,  29,  56,  47,  57,
            -27, -27, -16, -16,  -1,  17,  -2,   1,
             -9, -26,  -9, -10,  -2,  -4,   3,  -3,
            -14,   2, -11,  -2,  -5,   2,  14,   5,
            -35,  -8,  11,   2,   8,  15,  -3,   1,
             -1, -18,  -9,  10, -15, -25, -31, -50
         ],

         // king
         [
            -65,  23,  16, -15, -56, -34,   2,  13,
             29,  -1, -20,  -7,  -8,  -4, -38, -29,
             -9,  24,   2, -16, -20,   6,  22, -22,
            -17, -20, -12, -27, -30, -25, -14, -36,
            -49,  -1, -27, -39, -46, -44, -33, -51,
            -14, -14, -22, -46, -44, -30, -15, -27,
              1,   7,  -8, -64, -43, -16,   9,   8,
            -15,  36,  12, -54,   8, -28,  24,  14
         ]
      ],
      // end game values
      [
         // pawn
         [
              0,   0,   0,   0,   0,   0,   0,   0,
            178, 173, 158, 134, 147, 132, 165, 187,
             94, 100,  85,  67,  56,  53,  82,  84,
             32,  24,  13,   5,  -2,   4,  17,  17,
             13,   9,  -3,  -7,  -7,  -8,   3,  -1,
              4,   7,  -6,   1,   0,  -5,  -1,  -8,
             13,   8,   8,  10,  13,   0,   2,  -7,
              0,   0,   0,   0,   0,   0,   0,   0
         ],

         // knight
         [
            -58, -38, -13, -28, -31, -27, -63, -99,
            -25,  -8, -25,  -2,  -9, -25, -24, -52,
            -24, -20,  10,   9,  -1,  -9, -19, -41,
            -17,   3,  22,  22,  22,  11,   8, -18,
            -18,  -6,  16,  25,  16,  17,   4, -18,
            -23,  -3,  -1,  15,  10,  -3, -20, -22,
            -42, -20, -10,  -5,  -2, -20, -23, -44,
            -29, -51, -23, -15, -22, -18, -50, -64
         ],

         // bishop
         [
            -14, -21, -11,  -8, -7,  -9, -17, -24,
             -8,  -4,   7, -12, -3, -13,  -4, -14,
              2,  -8,   0,  -1, -2,   6,   0,   4,
             -3,   9,  12,   9, 14,  10,   3,   2,
             -6,   3,  13,  19,  7,  10,  -3,  -9,
            -12,  -3,   8,  10, 13,   3,  -7, -15,
            -14, -18,  -7,  -1,  4,  -9, -15, -27,
            -23,  -9, -23,  -5, -9, -16,  -5, -17
         ],

         // rook
         [
            13, 10, 18, 15, 12,  12,   8,   5,
            11, 13, 13, 11, -3,   3,   8,   3,
             7,  7,  7,  5,  4,  -3,  -5,  -3,
             4,  3, 13,  1,  2,   1,  -1,   2,
             3,  5,  8,  4, -5,  -6,  -8, -11,
            -4,  0, -5, -1, -7, -12,  -8, -16,
            -6, -6,  0,  2, -9,  -9, -11,  -3,
            -9,  2,  3, -1, -5, -13,   4, -20
         ],

         // queen
         [
             -9,  22,  22,  27,  27,  19,  10,  20,
            -17,  20,  32,  41,  58,  25,  30,   0,
            -20,   6,   9,  49,  47,  35,  19,   9,
              3,  22,  24,  45,  57,  40,  57,  36,
            -18,  28,  19,  47,  31,  34,  39,  23,
            -16, -27,  15,   6,   9,  17,  10,   5,
            -22, -23, -30, -16, -16, -23, -36, -32,
            -33, -28, -22, -43,  -5, -32, -20, -41
         ],

         // king
         [
            -74, -35, -18, -18, -11,  15,   4, -17,
            -12,  17,  14,  17,  17,  38,  23,  11,
             10,  17,  23,  15,  20,  45,  44,  13,
             -8,  22,  24,  27,  26,  33,  26,   3,
            -18,  -4,  21,  24,  27,  23,   9, -11,
            -19,  -3,  11,  21,  23,  16,   7,  -9,
            -27, -11,   4,  13,  14,   4,  -5, -17,
            -53, -34, -21, -11, -28, -14, -24, -43
         ]
      ]
   ];

   static readonly positions = {
      empty: "8/8/8/8/8/8/8/8 b - - ",
      start: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      kiwipete: "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -",
      pos3: "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -",
      pos4w: "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
      pos4b: "r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1",
      pos5: "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
      pos6: "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10"
   };

   constructor(fen?: string) {
      // initialize piece attacks
      this.InitJumperAttacks();
      this.InitSliderAttacks(Piece.bishop);
      this.InitSliderAttacks(Piece.rook);
      this.InitSliderRays();

      // initialize random hash keys
      this.InitHashKeys();

      // initalize hash tables
      this.InitHashTable();

      // init mask tables
      this.InitEvalMasks();

      // Set up the board position
      fen = fen ? fen : Engine.positions.start;
      this.ParseFEN(fen);
   }

   /*
   * <><><><><><><><><><><><><><><><><><>
   *
   *         Bit manipulations
   *
   * <><><><><><><><><><><><><><><><><><>
   */

   private SetBit(board: bigint, square: Square) {
      return board |= 1n << squareBigInt[square];
   }

   private RemoveBit(board: bigint, square: Square) {
      return board &= ~(1n << squareBigInt[square]);
   }

   private GetBit(board: bigint, square: Square) {
      return board & (1n << squareBigInt[square]);
   }

   private CountBits(bitboard: bigint) {
      // From https://graphics.stanford.edu/~seander/bithacks.html
      // This appeared to be the fastest
      const left32 = Number(bitboard & 0xffffffffn);
      const right32 = Number(bitboard >> 32n);

      function count32(n: number) {
         n = n - ((n >> 1) & 0x55555555);
         n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
         return ((n + (n >> 4) & 0xF0F0F0F) * 0x1010101) >> 24;
      }

      return count32(left32) + count32(right32);
   }

   private GetLS1B(bitboard: bigint) {
      if (bitboard) {
         return this.CountBits((bitboard & -bitboard) - 1n);
      }
      else {
         return -1;
      }
   }

   private SetOccupancy(index: number, bitsInMask: number, attackMask: bigint) {
      // occupancy map
      let occupancy = 0n;

      // range of bits within the attack mask
      for (let count = 0; count < bitsInMask; count++) {
         const square = this.GetLS1B(attackMask);
         attackMask = this.RemoveBit(attackMask, square);
         if (index & (1 << count)) {
            occupancy |= (1n << squareBigInt[square]);
         }
      }

      return BigInt.asUintN(64, occupancy);
   }

   /*
   * <><><><><><><><><><><><><><><><><><>
   *
   *           Print Helpers
   *
   * <><><><><><><><><><><><><><><><><><>
   */

   /**
    * Prints a bitboard representation of the given integer
    * @param board A 64-big integer representing a bitboard
    */
   private PrintBitboard(board: bigint) {
      for (let r = 0; r < 8; r++) {
         let rank = '';
         for (let f = 0; f < 8; f++) {
            const square = r * 8 + f;

            if (!f) {
               rank += `${8 - r}  `;
            }

            rank += ` ${this.GetBit(board, square) ? '1' : '0'}`;
         }
         console.log(`${rank} \r\n`);
      }

      console.log('\r\n    a b c d e f g h');
      console.log(`    Bitboard: ${board}`);
   }

   /**
    * Prints the current board with unicode/ascii piece characters
    * @param unicode should the output be unicode (instead of ascii)?
    */
   PrintBoard(unicode = false) {
      for (let rank = 0; rank < 8; rank++) {
         let r = '';
         for (let file = 0; file < 8; file++) {
            let square = rank * 8 + file;
            let piece = -1;

            if (!file) {
               r += `${8 - rank} `;
            }

            for (let bbPiece = Pieces.P; bbPiece <= Pieces.k; bbPiece++) {
               if (this.GetBit(this.bitboards[bbPiece], square)) {
                  piece = bbPiece;
               }
            }

            if (unicode) {
               r += `${(piece === -1) ? ' . ' : ` ${this.unicodePieces[piece]}`}`;
            }
            else {
               r += `${(piece === -1) ? ' . ' : ` ${this.asciiPieces[piece]} `}`;
            }
         }
         console.log(`${r} \r\n`);
      }
      console.log('\r\n   a  b  c  d  e  f  g  h');
      console.log(`Side to move: ${this.side === 0 ? 'white' : 'black'}`);
      console.log(`En passant: ${this.enpassant !== Square.no_sq
         ? SquareToCoords[this.enpassant]
         : 'no'}`);
      console.log(`Castling rights: ${this.castle & CastleRights.wk ? 'K' : '-'}${this.castle & CastleRights.wq ? 'Q' : '-'}${this.castle & CastleRights.bk ? 'k' : '-'}${this.castle & CastleRights.bq ? 'q' : '-'}`);
      console.log(`Hash key: ${this.hashKey.toString(16)}`);
      console.log('\r\n');
   }

   private PrintAttackedSquares(side: SideToMove) {
      for (let rank = 0; rank < 8; rank++) {
         let r = '';
         for (let file = 0; file < 8; file++) {
            const square = rank * 8 + file;

            if (!file) {
               r += `${8 - rank}  `;
            }

            r += ` ${this.IsSquareAttacked(square, side)} `;
         }
         console.log(`${r} \r\n`);
      }
      console.log('\r\n    a  b  c  d  e  f  g  h');
   }

   /**
    * For UCI purposes
    */
   private PrintMove(move: number) {
      console.log(`${SquareToCoords[this.GetMoveSource(move)]}${SquareToCoords[this.GetMoveTarget(move)]}${this.GetMovePromoted(move) ? this.promotedPieces[this.GetMovePromoted(move)] : ''}`);
   }

   /**
    * Print move list
    */
   private PrintMoveList(moves: number[]) {
      if (moves.length === 0) {
         console.log('No moves in move list.');
         return;
      }

      const moveList = [];

      for (let moveCount = 0; moveCount < moves.length; moveCount++) {
         const move = moves[moveCount];
         moveList.push({ 
            Move: `${SquareToCoords[this.GetMoveSource(move)]}${SquareToCoords[this.GetMoveTarget(move)]}${this.GetMovePromoted(move) ? this.promotedPieces[this.GetMovePromoted(move)] : ' '}`,
            Piece: `${this.unicodePieces[this.GetMovePiece(move)]}`,
            Capture: `${this.GetMoveCapture(move) ? 1 : 0}`,
            Double: `${this.GetMoveDouble(move) ? 1 : 0}`,
            EnPassant: `${this.GetMoveEnPassant(move) ? 1 : 0}`,
            Castle: `${this.GetMoveCastling(move) ? 1 : 0}`
         });
      }
      console.table(moveList);
      console.log(`Total number of moves: ${moves.length}`);
   }

   private PrintMoveScores(moves: number[]) {
      const scoreList = [];

      for (let i = 0; i < moves.length; i++) {
         scoreList.push({
            move: `${SquareToCoords[this.GetMoveSource(moves[i])]}${SquareToCoords[this.GetMoveTarget(moves[i])]}${this.GetMovePromoted(moves[i]) ? this.promotedPieces[this.GetMovePromoted(moves[i])] : ' '}`,
            score: this.ScoreMove(moves[i])
         });
      }

      console.table(scoreList);
   }

   /**
    * Parse FEN string
    */
   ParseFEN(fen: string) {
      // re-initialize boards and other stuff
      this.bitboards = [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      this.occupancies = [0n, 0n, 0n];
      this.side = 0;
      this.enpassant = Square.no_sq;
      this.castle = 0;

      // get piece positions from fen
      let pieces = fen.split(' ')[0].split('/');

      for (let rank = 0; rank < 8; rank++) {
         // get pieces for the current rank
         let piecesRank = pieces[rank];
         let file = 0;
         for (const piece of piecesRank) {
            let square = rank * 8 + file;
            // Match piece
            if ((piece.toLocaleLowerCase() >= 'a' && piece.toLocaleLowerCase() <= 'z')) {
               let ascii = this.asciiEncodePieces[piece];
               
               this.bitboards[ascii] = this.SetBit(this.bitboards[ascii], square);
   
               file++;
            }
            // Match empty square
            else if (piece >= '1' && piece <= '8') {
               file += parseInt(piece, 10);
            }
            else {
               console.error(`Invalid FEN character: ${piece}`);
            }
         }
      }

      // Side to move
      this.side = fen.split(' ')[1] === 'w' ? SideToMove.White : SideToMove.Black;

      // Castling rights
      const castling = fen.split(' ')[2].split('');
      for (const castle of castling) {
         switch (castle) {
            case 'K': this.castle |= CastleRights.wk; break;
            case 'Q': this.castle |= CastleRights.wq; break;
            case 'k': this.castle |= CastleRights.bk; break;
            case 'q': this.castle |= CastleRights.bq; break;
         }
      }

      // en passant square
      const enpassant = fen.split(' ')[3];
      if (enpassant !== '-') {
         const files = 'abcdefgh';
         const file = files.indexOf(enpassant.split('')[0]);
         const rank = 8 - parseInt(enpassant[1], 10);

         this.enpassant = rank * 8 + file;
      }
      else {
         this.enpassant = Square.no_sq;
      }

      // init occupancies
      for (let piece = Pieces.P; piece <= Pieces.K; piece++) {
         this.occupancies[SideToMove.White] |= this.bitboards[piece];
      }
      for (let piece = Pieces.p; piece <= Pieces.k; piece++) {
         this.occupancies[SideToMove.Black] |= this.bitboards[piece];
      }
      this.occupancies[SideToMove.Both] |= this.occupancies[SideToMove.White] | this.occupancies[SideToMove.Black];

      // init hash key
      this.hashKey = this.GenerateHashKeys();
   }

   /*
   * <><><><><><><><><><><><><><><><><><>
   *
   *           Zobrist Hashing
   *
   * <><><><><><><><><><><><><><><><><><>
   */

   private hashKey = 0n;
   private pieceKeys: bigint[][] = Array.from(Array(12), () => new Array(64));
   private enpassantKeys: bigint[] = [];
   private castleKeys: bigint[] = [];
   private sideKey: bigint = 0n;
   
   private InitHashKeys() {
      // init piece keys
      for (let piece = Pieces.P; piece <= Pieces.k; piece++) {
         for (let square = 0; square < 64; square++) {
            this.pieceKeys[piece][square] = getRandomU64Number();
         }
      }

      // init en passant keys
      for (let square = 0; square < 64; square++) {
         this.enpassantKeys[square] = getRandomU64Number();
      }

      // init castling keys
      for (let i = 0; i < 16; i++) {
         this.castleKeys[i] = getRandomU64Number();
      }

      this.sideKey = getRandomU64Number();
   }

   private GenerateHashKeys() {
      let hashKey = 0n;
      let bitboard;

      // hash pieces
      for (let piece = Pieces.P; piece <= Pieces.k; piece++) {
         bitboard = this.bitboards[piece];

         while (bitboard) {
            const square = this.GetLS1B(bitboard);

            hashKey ^= this.pieceKeys[piece][square];

            bitboard = this.RemoveBit(bitboard, square);
         }
      }

      if (this.enpassant !== Square.no_sq) {
         hashKey ^= this.enpassantKeys[this.enpassant];
      }

      hashKey ^= this.castleKeys[this.castle];

      if (this.side === SideToMove.Black) {
         hashKey ^= this.sideKey;
      }

      return hashKey;
   }

   /*
   * <><><><><><><><><><><><><><><><><><>
   *
   *               Attacks
   *
   * <><><><><><><><><><><><><><><><><><>
   */

   /**
    * Pawn Attacks
    */
   private MaskPawnAttacks(side: SideToMove, square: Square) {
      let attacks = 0n;
      let bitboard = 0n;

      bitboard = this.SetBit(bitboard, square);

      // white pawns
      if (!side) {
         if ((bitboard >> 7n) & this.notAFile) attacks |= bitboard >> 7n;
         if ((bitboard >> 9n) & this.notHFile) attacks |= bitboard >> 9n;
      }
      // black pawns
      else {
         if ((bitboard << 7n) & this.notHFile) attacks |= bitboard << 7n;
         if ((bitboard << 9n) & this.notAFile) attacks |= bitboard << 9n;
      }

      return BigInt.asUintN(64, attacks);;
   }

   /**
    * Knight Attacks
    */
   private MaskKnightAttacks(square: Square) {
      let attacks = 0n;
      let bitboard = 0n;

      bitboard = this.SetBit(bitboard, square);

      if ((bitboard >> 17n) & this.notHFile) attacks |= (bitboard >> 17n);
      if ((bitboard >> 15n) & this.notAFile) attacks |= (bitboard >> 15n);
      if ((bitboard >> 10n) & this.notHGFile) attacks |= (bitboard >> 10n);
      if ((bitboard >> 6n) & this.notABFile) attacks |= (bitboard >> 6n);
      if ((bitboard << 17n) & this.notAFile) attacks |= (bitboard << 17n);
      if ((bitboard << 15n) & this.notHFile) attacks |= (bitboard << 15n);
      if ((bitboard << 10n) & this.notABFile) attacks |= (bitboard << 10n);
      if ((bitboard << 6n) & this.notHGFile) attacks |= (bitboard << 6n);

      return BigInt.asUintN(64, attacks);
   }

   /**
    * King Attacks
    */
   private MaskKingAttacks(square: Square) {
      let attacks = 0n;
      let bitboard = 0n;

      bitboard = this.SetBit(bitboard, square);

      if (bitboard >> 8n) attacks |= (bitboard >> 8n);
      if ((bitboard >> 9n) & this.notHFile) attacks |= (bitboard >> 9n);
      if ((bitboard >> 7n) & this.notAFile) attacks |= (bitboard >> 7n);
      if ((bitboard >> 1n) & this.notHFile) attacks |= (bitboard >> 1n);
      if (bitboard << 8n) attacks |= (bitboard << 8n);
      if ((bitboard << 9n) & this.notAFile) attacks |= (bitboard << 9n);
      if ((bitboard << 7n) & this.notHFile) attacks |= (bitboard << 7n);
      if ((bitboard << 1n) & this.notAFile) attacks |= (bitboard << 1n);

      return BigInt.asUintN(64, attacks);
   }

   /**
    * Bishop Attacks
    */   
   private MaskBishopAttacks(square: Square) {
      let attacks = 0n;

      const targetRank = Math.floor(square / 8);
      const targetFile = square % 8;

      // <= 6 to make sure we don't go to the very edge of the board
      for (let r = targetRank + 1, f = targetFile + 1; r <= 6 && f <= 6; r++, f++) {
         attacks |= (1n << (BigInt(r) * 8n + BigInt(f)));
      }
      
      for (let r = targetRank - 1, f = targetFile + 1; r >= 1 && f <= 6; r--, f++) {
         attacks |= (1n << (BigInt(r) * 8n + BigInt(f)));
      }

      for (let r = targetRank + 1, f = targetFile - 1; r <= 6 && f >= 1; r++, f--) {
         attacks |= (1n << (BigInt(r) * 8n + BigInt(f)));
      }

      for (let r = targetRank - 1, f = targetFile - 1; r >= 1 && f >= 1; r--, f--) {
         attacks |= (1n << (BigInt(r) * 8n + BigInt(f)));
      }

      return BigInt.asUintN(64, attacks);
   }

   private GenerateBishopAttacksFly(square: Square, block: bigint) {
      let attacks = 0n;

      const targetRank = Math.floor(square / 8);
      const targetFile = square % 8;

      for (let r = targetRank + 1, f = targetFile + 1; r <= 7 && f <= 7; r++, f++) {
         attacks |= (1n << (BigInt(r) * 8n + BigInt(f)));
         if ((1n << (BigInt(r) * 8n + BigInt(f))) & block) break;
      }
      
      for (let r = targetRank - 1, f = targetFile + 1; r >= 0 && f <= 7; r--, f++) {
         attacks |= (1n << (BigInt(r) * 8n + BigInt(f)));
         if ((1n << (BigInt(r) * 8n + BigInt(f))) & block) break;
      }

      for (let r = targetRank + 1, f = targetFile - 1; r <= 7 && f >= 0; r++, f--) {
         attacks |= (1n << (BigInt(r) * 8n + BigInt(f)));
         if ((1n << (BigInt(r) * 8n + BigInt(f))) & block) break;
      }

      for (let r = targetRank - 1, f = targetFile - 1; r >= 0 && f >= 0; r--, f--) {
         attacks |= (1n << (BigInt(r) * 8n + BigInt(f)));
         if ((1n << (BigInt(r) * 8n + BigInt(f))) & block) break;
      }

      return BigInt.asUintN(64, attacks);
   }

   private GetBishopAttacks(square: Square, occupancy: bigint) {
      // explicitly clamp the values to 64 bits, otherwise it WILL go larger
      occupancy = BigInt.asUintN(64, (occupancy & this.bishopMasks[square]));
      occupancy = BigInt.asUintN(64, occupancy * this.bishopMagicNumbers[square]);
      occupancy >>= 64n - this.bishopRelevantBits[square];
      return this.bishopAttacks[square][Number(occupancy)];
   }

   /**
    * Rook Attacks
    */
   private MaskRookAttacks(square: Square) {
      let attacks = 0n;

      const targetRank = Math.floor(square / 8);
      const targetFile = square % 8;

      // <= 6 to make sure we don't go to the very edge of the board
      for (let r = targetRank + 1; r <= 6; r++) {
         attacks |= (1n << (BigInt(r) * 8n + BigInt(targetFile)));
      }

      for (let r = targetRank - 1; r >= 1; r--) {
         attacks |= (1n << (BigInt(r) * 8n + BigInt(targetFile)));
      }

      for (let f = targetFile + 1; f <= 6; f++) {
         attacks |= 1n << (BigInt(targetRank) * 8n + BigInt(f));
      }

      for (let f = targetFile - 1; f >= 1; f--) {
         attacks |= 1n << (BigInt(targetRank) * 8n + BigInt(f));
      }

      return BigInt.asUintN(64, attacks);
   }

   private GenerateRookAttacksFly(square: Square, block: bigint) {
      let attacks = 0n;

      const targetRank = Math.floor(square / 8);
      const targetFile = square % 8;

      // <= 6 to make sure we don't go to the very edge of the board
      for (let r = targetRank + 1; r <= 7; r++) {
         attacks |= (1n << (BigInt(r) * 8n + BigInt(targetFile)));
         if ((1n << (BigInt(r) * 8n + BigInt(targetFile))) & block) break;
      }

      for (let r = targetRank - 1; r >= 0; r--) {
         attacks |= (1n << (BigInt(r) * 8n + BigInt(targetFile)));
         if ((1n << (BigInt(r) * 8n + BigInt(targetFile))) & block) break;
      }

      for (let f = targetFile + 1; f <= 7; f++) {
         attacks |= (1n << (BigInt(targetRank) * 8n + BigInt(f)));
         if ((1n << (BigInt(targetRank) * 8n + BigInt(f))) & block) break;
      }

      for (let f = targetFile - 1; f >= 0; f--) {
         attacks |= (1n << (BigInt(targetRank) * 8n + BigInt(f)));
         if ((1n << (BigInt(targetRank) * 8n + BigInt(f))) & block) break;
      }

      return BigInt.asUintN(64, attacks);
   }

   private GetRookAttacks(square: Square, occupancy: bigint) {
      // explicitly clamp the values to 64 bits, otherwise it WILL go larger
      occupancy = BigInt.asUintN(64, occupancy & this.rookMasks[square]);
      occupancy = BigInt.asUintN(64, occupancy * this.rookMagicNumbers[square]);
      occupancy >>= 64n - this.rookRelevantBits[square];

      return this.rookAttacks[square][Number(occupancy)];
   }

   /**
    * Queen Attacks
    */
   private GetQueenAttacks(square: Square, occupancy: bigint) {
      return (this.GetBishopAttacks(square, occupancy) | this.GetRookAttacks(square, occupancy));
   }

   private InitSliderRays() {
      for (let square = 0; square < 64; square++) {
         let attacks = 0n;

         const targetRank = Math.floor(square / 8);
         const targetFile = square % 8;

         for (let r = targetRank + 1, f = targetFile + 1; r <= 7 && f <= 7; r++, f++) {
            attacks |= (1n << (BigInt(r) * 8n + BigInt(f)));
         }
         
         for (let r = targetRank - 1, f = targetFile + 1; r >= 0 && f <= 7; r--, f++) {
            attacks |= (1n << (BigInt(r) * 8n + BigInt(f)));
         }

         for (let r = targetRank + 1, f = targetFile - 1; r <= 7 && f >= 0; r++, f--) {
            attacks |= (1n << (BigInt(r) * 8n + BigInt(f)));
         }

         for (let r = targetRank - 1, f = targetFile - 1; r >= 0 && f >= 0; r--, f--) {
            attacks |= (1n << (BigInt(r) * 8n + BigInt(f)));
         }

         for (let r = targetRank + 1; r <= 7; r++) {
            attacks |= (1n << (BigInt(r) * 8n + BigInt(targetFile)));
         }
   
         for (let r = targetRank - 1; r >= 0; r--) {
            attacks |= (1n << (BigInt(r) * 8n + BigInt(targetFile)));
         }
   
         for (let f = targetFile + 1; f <= 7; f++) {
            attacks |= 1n << (BigInt(targetRank) * 8n + BigInt(f));
         }
   
         for (let f = targetFile - 1; f >= 0; f--) {
            attacks |= 1n << (BigInt(targetRank) * 8n + BigInt(f));
         }

         this.sliderRays[square] = BigInt.asUintN(64, attacks);
      }
   }

   private InitSliderAttacks(bishop: Piece) {
      for (let square = 0; square < 64; square++) {
         this.bishopMasks[square] = this.MaskBishopAttacks(square);
         this.rookMasks[square] = this.MaskRookAttacks(square);

         // init current mask
         const attackMask = bishop ? this.bishopMasks[square] : this.rookMasks[square];

         const relevantBitsCount = this.CountBits(attackMask);
         const occupancyIndicies = 1 << relevantBitsCount;

         for (let index = 0; index < occupancyIndicies; index++) {
            if (bishop) {
               const occupancy = this.SetOccupancy(index, relevantBitsCount, attackMask);

               const magicIndex = BigInt.asUintN(64, (occupancy * this.bishopMagicNumbers[square])) >> (64n - this.bishopRelevantBits[square]);

               this.bishopAttacks[square][Number(magicIndex)] = this.GenerateBishopAttacksFly(square, occupancy);
            }
            else {
               const occupancy = this.SetOccupancy(index, relevantBitsCount, attackMask);

               const magicIndex = BigInt.asUintN(64, (occupancy * this.rookMagicNumbers[square])) >> (64n - this.rookRelevantBits[square]);

               this.rookAttacks[square][Number(magicIndex)] = this.GenerateRookAttacksFly(square, occupancy);
            }
         }
      }
   }

   private InitJumperAttacks() {
      for (let square = 0; square < 64; square++) {
         this.pawnAttacks[SideToMove.White][square] = this.MaskPawnAttacks(SideToMove.White, square);
         this.pawnAttacks[SideToMove.Black][square] = this.MaskPawnAttacks(SideToMove.Black, square);

         this.knightAttacks[square] = this.MaskKnightAttacks(square);

         this.kingAttacks[square] = this.MaskKingAttacks(square);
      }
   }
   
   /**
    * Is given square attacked by given side?
    */
   private IsSquareAttacked(square: Square, side: SideToMove) {
      let bishopsQueens: bigint, rooksQueens: bigint, pawnBoard: bigint, knightBoard: bigint, kingBoard: bigint;
      if (side === SideToMove.White) {
         bishopsQueens = this.bitboards[Pieces.B] | this.bitboards[Pieces.Q];
         rooksQueens = this.bitboards[Pieces.R] | this.bitboards[Pieces.Q];
         pawnBoard = this.bitboards[Pieces.P];
         knightBoard = this.bitboards[Pieces.N];
         kingBoard = this.bitboards[Pieces.K];
      }
      else {
         bishopsQueens = this.bitboards[Pieces.b] | this.bitboards[Pieces.q];
         rooksQueens = this.bitboards[Pieces.r] | this.bitboards[Pieces.q];
         pawnBoard = this.bitboards[Pieces.p];
         knightBoard = this.bitboards[Pieces.n];
         kingBoard = this.bitboards[Pieces.k];
      }

      if (this.pawnAttacks[side ^ 1][square] & pawnBoard)
         return 1;
      
      if (this.knightAttacks[square] & knightBoard)
         return 1;

      if ((this.sliderRays[square] & bishopsQueens) && (this.GetBishopAttacks(square, this.occupancies[SideToMove.Both]) & bishopsQueens))
         return 1;

      if ((this.sliderRays[square] & rooksQueens) && (this.GetRookAttacks(square, this.occupancies[SideToMove.Both]) & rooksQueens))
         return 1;

      if (this.kingAttacks[square] & kingBoard)
         return 1;

      return 0;
   }

   /*
   * <><><><><><><><><><><><><><><><><><>
   *
   *            Magic Number
   *
   * <><><><><><><><><><><><><><><><><><>
   */

   private FindMagicNumber(square: Square, relevant_bits: bigint, bishop: Piece) {
      const occupancies = new BigUint64Array(4096);
      const attacks = new BigUint64Array(4096);
      const usedAttacks = new BigUint64Array(4096);
      const attackMask = bishop ? this.MaskBishopAttacks(square) : this.MaskRookAttacks(square);

      const n = 1n << relevant_bits;

      for (let index = 0; index < n; index++) {
         occupancies[index] = this.SetOccupancy(index, Number(n), attackMask);

         attacks[index] = bishop
            ? this.GenerateBishopAttacksFly(square, occupancies[index])
            : this.GenerateRookAttacksFly(square, occupancies[index]);
      }

      // test magic numbers
      for (let count = 0; count < 100000000; count++) {
         // magic number candidate
         const magicNumber = generateMagicNumber();

         // skip bad magic numbers
         if (this.CountBits((attackMask * magicNumber) & 0xFF00000000000000n) < 6) {
            continue;
         }

         let fail;
         // test magic index
         for (let index = 0, fail = 0; !fail && index < n; index++) {
            const magicIndex = Number(BigInt.asIntN(16, (occupancies[index] * magicNumber) >> (64n - relevant_bits)));

            if (usedAttacks[magicIndex] === 0n) {
               usedAttacks[magicIndex] = attacks[index];
            }
            // magic index doesn't work
            else if (usedAttacks[magicIndex] !== attacks[index]) {
               fail = 1;
            }
         }

         if (!fail) {
            return BigInt.asUintN(64, magicNumber);
         }
      }

      console.log("Magic number failed!");
      return 0n;
   }

   private InitMagicNumbers() {
      for (let square = 0; square < 64; square++) {
         const decimalMN = this.FindMagicNumber(square, this.bishopRelevantBits[square], Piece.bishop);
         let hex = decimalMN.toString(16);
         if (hex.length % 2) {
            hex = '0' + hex;
         }
         console.log(`0x${hex}n`);
      }
   }

   /*
   * <><><><><><><><><><><><><><><><><><>
   *
   *              Move Gen
   *
   * <><><><><><><><><><><><><><><><><><>
   */

   private GeneratePawnMoves(side: SideToMove, moves: number[], bitboard: bigint, capturesOnly: boolean) {
      const emptySquares = ~this.occupancies[SideToMove.Both];
      let attacks: bigint;
      let piece = side === SideToMove.White ? Pieces.P : Pieces.p;
      
      const ableToPush = (bitboard: bigint, empty: bigint) => ( (side === SideToMove.White ? (empty << 8n) : (empty >> 8n)) & bitboard );
      const ableToDoublePush = (bitboard: bigint, empty: bigint) => {
         const targetRank = side === SideToMove.White ? 0x000000FF00000000n : 0x00000000FF000000n;
         const emptyRank = (side === SideToMove.White ? ((empty & targetRank) << 8n) : ((empty & targetRank) >> 8n)) & empty;
         return ableToPush(bitboard, emptyRank);
      }

      const pSinglePush = ableToPush(bitboard, emptySquares);
      const pDoublePush = ableToDoublePush(bitboard, emptySquares);

      while (bitboard) {
         const fromSquare = this.GetLS1B(bitboard);
         const toSquare = side === SideToMove.White ? fromSquare - 8 : fromSquare + 8;

         if (!capturesOnly) {
            // single push
            if (this.GetBit(bitboard, fromSquare) & pSinglePush) {
               // promotion
               if (side === SideToMove.White ? toSquare <= Square.h8 : toSquare >= Square.a1) {
                  this.AddMove(moves, this.EncodeMove(fromSquare, toSquare, piece, side === SideToMove.White ? Pieces.Q : Pieces.q, 0, 0, 0, 0));
                  this.AddMove(moves, this.EncodeMove(fromSquare, toSquare, piece, side === SideToMove.White ? Pieces.R : Pieces.r, 0, 0, 0, 0));
                  this.AddMove(moves, this.EncodeMove(fromSquare, toSquare, piece, side === SideToMove.White ? Pieces.B : Pieces.b, 0, 0, 0, 0));
                  this.AddMove(moves, this.EncodeMove(fromSquare, toSquare, piece, side === SideToMove.White ? Pieces.N : Pieces.n, 0, 0, 0, 0));
               }
               else {
                  this.AddMove(moves, this.EncodeMove(fromSquare, toSquare, piece, 0, 0, 0, 0, 0));
               }
            }

            // double push
            if (this.GetBit(bitboard, fromSquare) & pDoublePush) {
               this.AddMove(moves, this.EncodeMove(fromSquare, side === SideToMove.White ? (fromSquare - 16) : (fromSquare + 16), piece, 0, 0, 1, 0, 0));
            }
         }         

         // attacks
         attacks = this.pawnAttacks[side][fromSquare] & this.occupancies[side === SideToMove.White ? SideToMove.Black : SideToMove.White];

         while (attacks) {
            const targetSquare = this.GetLS1B(attacks);

            // pawn attack to promotion
            if (side === SideToMove.White ? targetSquare <= Square.h8 : targetSquare >= Square.a1) {
               this.AddMove(moves, this.EncodeMove(fromSquare, targetSquare, piece, side === SideToMove.White ? Pieces.Q : Pieces.q, 1, 0, 0, 0));
               this.AddMove(moves, this.EncodeMove(fromSquare, targetSquare, piece, side === SideToMove.White ? Pieces.R : Pieces.r, 1, 0, 0, 0));
               this.AddMove(moves, this.EncodeMove(fromSquare, targetSquare, piece, side === SideToMove.White ? Pieces.B : Pieces.b, 1, 0, 0, 0));
               this.AddMove(moves, this.EncodeMove(fromSquare, targetSquare, piece, side === SideToMove.White ? Pieces.N : Pieces.n, 1, 0, 0, 0));
            }
            else {
               this.AddMove(moves, this.EncodeMove(fromSquare, targetSquare, piece, 0, 1, 0, 0, 0));
            }

            attacks = this.RemoveBit(attacks, targetSquare);
         }

         // en passant captures
         if (this.enpassant !== Square.no_sq) {
            const enpassantAttacks = this.pawnAttacks[this.side][fromSquare] & (1n << squareBigInt[this.enpassant]);

            if (enpassantAttacks) {
               const target = this.GetLS1B(enpassantAttacks);
               this.AddMove(moves, this.EncodeMove(fromSquare, target, piece, 0, 1, 0, 1, 0));
            }
         }

         bitboard = this.RemoveBit(bitboard, fromSquare);
      }
   }

   /**
    * Generate all moves
    */
   private GenerateMoves(moves: number[], capturesOnly = false) {
      let bitboard: bigint;

      const wpawnBB = this.bitboards[Pieces.P];
      const bpawnBB = this.bitboards[Pieces.p];

      this.GeneratePawnMoves(this.side, moves, this.side === SideToMove.White ? wpawnBB : bpawnBB, capturesOnly);

      for (let piece = Pieces.P; piece <= Pieces.k; piece++) {
         // copy piece bitboard
         bitboard = this.bitboards[piece];

         if (!capturesOnly) {
            // generate white castling moves
            if (this.side === SideToMove.White) {
               if (piece === Pieces.K) {
                  // King side castling
                  if (this.castle & CastleRights.wk) {
                     // Make sure squares between king and rook are empty
                     if (!this.GetBit(this.occupancies[SideToMove.Both], Square.f1) && !this.GetBit(this.occupancies[SideToMove.Both], Square.g1)) {
                        // Make sure king and adjacent squares are not attacked
                        if (!this.IsSquareAttacked(Square.e1, SideToMove.Black) && !this.IsSquareAttacked(Square.f1, SideToMove.Black)) {
                           this.AddMove(moves, this.EncodeMove(Square.e1, Square.g1, piece, 0, 0, 0, 0, 1));
                        }
                     }
                  }

                  // Queen side castling
                  if (this.castle & CastleRights.wq) {
                     if (!this.GetBit(this.occupancies[SideToMove.Both], Square.d1) && !this.GetBit(this.occupancies[SideToMove.Both], Square.c1) && !this.GetBit(this.occupancies[SideToMove.Both], Square.b1)) {
                        // Make sure king and adjacent squares are not attacked
                        if (!this.IsSquareAttacked(Square.e1, SideToMove.Black) && !this.IsSquareAttacked(Square.d1, SideToMove.Black)) {
                           this.AddMove(moves, this.EncodeMove(Square.e1, Square.c1, piece, 0, 0, 0, 0, 1));
                        }
                     }
                  }
               }
            }
            // black castling moves
            else {
               if (piece === Pieces.k) {
                  // King side castling
                  if (this.castle & CastleRights.bk) {
                     // Make sure squares between king and rook are empty
                     if (!this.GetBit(this.occupancies[SideToMove.Both], Square.f8) && !this.GetBit(this.occupancies[SideToMove.Both], Square.g8)) {
                        // Make sure king and adjacent squares are not attacked
                        if (!this.IsSquareAttacked(Square.e8, SideToMove.White) && !this.IsSquareAttacked(Square.f8, SideToMove.White)) {
                           this.AddMove(moves, this.EncodeMove(Square.e8, Square.g8, piece, 0, 0, 0, 0, 1));
                        }
                     }
                  }

                  // Queen side castling
                  if (this.castle & CastleRights.bq) {
                     if (!this.GetBit(this.occupancies[SideToMove.Both], Square.d8) && !this.GetBit(this.occupancies[SideToMove.Both], Square.c8) && !this.GetBit(this.occupancies[SideToMove.Both], Square.b8)) {
                        // Make sure king and adjacent squares are not attacked
                        if (!this.IsSquareAttacked(Square.e8, SideToMove.White) && !this.IsSquareAttacked(Square.d8, SideToMove.White)) {
                           this.AddMove(moves, this.EncodeMove(Square.e8, Square.c8, piece, 0, 0, 0, 0, 1));
                        }
                     }
                  }
               }
            }
         }

         // generate knight moves
         if ((this.side === SideToMove.White) ? piece === Pieces.N : piece === Pieces.n) {
            while (bitboard) {
               const fromSquare = this.GetLS1B(bitboard);

               let attacks = this.knightAttacks[fromSquare] & ~this.occupancies[this.side];

               while (attacks) {
                  const toSquare = this.GetLS1B(attacks);

                  const isCapture = this.GetBit(this.side === SideToMove.White ? this.occupancies[SideToMove.Black] : this.occupancies[SideToMove.White], toSquare);

                  if (!capturesOnly && !isCapture) {
                     this.AddMove(moves, this.EncodeMove(fromSquare, toSquare, piece, 0, 0, 0, 0, 0));
                  }
                  else if (isCapture) {
                     this.AddMove(moves, this.EncodeMove(fromSquare, toSquare, piece, 0, 1, 0, 0, 0));
                  }

                  attacks = this.RemoveBit(attacks, toSquare);
               }

               bitboard = this.RemoveBit(bitboard, fromSquare);
            }
         }

         // generate bishop moves
         if ((this.side === SideToMove.White) ? piece === Pieces.B : piece === Pieces.b) {
            while (bitboard) {
               const fromSquare = this.GetLS1B(bitboard);

               let attacks = this.GetBishopAttacks(fromSquare, this.occupancies[SideToMove.Both]) & ~this.occupancies[this.side];

               while (attacks) {
                  const toSquare = this.GetLS1B(attacks);

                  const isCapture = this.GetBit(this.side === SideToMove.White ? this.occupancies[SideToMove.Black] : this.occupancies[SideToMove.White], toSquare);
                  if (!capturesOnly && !isCapture) {
                     this.AddMove(moves, this.EncodeMove(fromSquare, toSquare, piece, 0, 0, 0, 0, 0));
                  }
                  else if (isCapture) {
                     this.AddMove(moves, this.EncodeMove(fromSquare, toSquare, piece, 0, 1, 0, 0, 0));
                  }

                  attacks = this.RemoveBit(attacks, toSquare);
               }

               bitboard = this.RemoveBit(bitboard, fromSquare);
            }
         }

         // generate rook moves
         if ((this.side === SideToMove.White) ? piece === Pieces.R : piece === Pieces.r) {
            while (bitboard) {
               const fromSquare = this.GetLS1B(bitboard);

               let attacks = this.GetRookAttacks(fromSquare, this.occupancies[SideToMove.Both]) & ~this.occupancies[this.side];

               while (attacks) {
                  const toSquare = this.GetLS1B(attacks);

                  const isCapture = this.GetBit(this.side === SideToMove.White ? this.occupancies[SideToMove.Black] : this.occupancies[SideToMove.White], toSquare);
                  if (!capturesOnly && !isCapture) {
                     this.AddMove(moves, this.EncodeMove(fromSquare, toSquare, piece, 0, 0, 0, 0, 0));
                  }
                  else if (isCapture) {
                     this.AddMove(moves, this.EncodeMove(fromSquare, toSquare, piece, 0, 1, 0, 0, 0));
                  }

                  attacks = this.RemoveBit(attacks, toSquare);
               }

               bitboard = this.RemoveBit(bitboard, fromSquare);
            }
         }

         // generate queen moves
         if ((this.side === SideToMove.White) ? piece === Pieces.Q : piece === Pieces.q) {
            while (bitboard) {
               const fromSquare = this.GetLS1B(bitboard);

               let attacks = this.GetQueenAttacks(fromSquare, this.occupancies[SideToMove.Both]) & ~this.occupancies[this.side];

               while (attacks) {
                  const toSquare = this.GetLS1B(attacks);

                  const isCapture = this.GetBit(this.side === SideToMove.White ? this.occupancies[SideToMove.Black] : this.occupancies[SideToMove.White], toSquare);
                  
                  if (!capturesOnly && !isCapture) {
                     this.AddMove(moves, this.EncodeMove(fromSquare, toSquare, piece, 0, 0, 0, 0, 0));
                  }
                  else if (isCapture) {
                     this.AddMove(moves, this.EncodeMove(fromSquare, toSquare, piece, 0, 1, 0, 0, 0));
                  }

                  attacks = this.RemoveBit(attacks, toSquare);
               }

               bitboard = this.RemoveBit(bitboard, fromSquare);
            }
         }

         // generate king moves
         if ((this.side === SideToMove.White) ? piece === Pieces.K : piece === Pieces.k) {
            while (bitboard) {
               const fromSquare = this.GetLS1B(bitboard);

               let attacks = this.kingAttacks[fromSquare] & ~this.occupancies[this.side];

               while (attacks) {
                  const toSquare = this.GetLS1B(attacks);

                  const isCapture = this.GetBit(this.side === SideToMove.White ? this.occupancies[SideToMove.Black] : this.occupancies[SideToMove.White], toSquare);
                  
                  if (!capturesOnly && !isCapture) {
                     this.AddMove(moves, this.EncodeMove(fromSquare, toSquare, piece, 0, 0, 0, 0, 0));
                  }
                  else if (isCapture) {
                     this.AddMove(moves, this.EncodeMove(fromSquare, toSquare, piece, 0, 1, 0, 0, 0));
                  }

                  attacks = this.RemoveBit(attacks, toSquare);
               }

               bitboard = this.RemoveBit(bitboard, fromSquare);
            }
         }
      }
   }

   /**
    * Move encoding
    */
   private EncodeMove(source: Square, target: Square, piece: Pieces, promoted: Pieces, captured: 1 | 0, double: 1 | 0, enpassant: 1 | 0, castling: 1 | 0) {
      return source | (target << 6) | (piece << 12) | (promoted << 16) | (captured << 20) | (double << 21) | (enpassant << 22) | (castling << 23);
   }

   private GetMoveSource(move: number) { return move & 0x3f; }
   private GetMoveTarget(move: number) { return (move & 0xfc0) >> 6 }
   private GetMovePiece(move: number) { return (move & 0xf000) >> 12 }
   private GetMovePromoted(move: number) { return (move & 0xf0000) >> 16 }
   private GetMoveCapture(move: number) { return move & 0x100000 }
   private GetMoveDouble(move: number) { return move & 0x200000 }
   private GetMoveEnPassant(move: number) { return move & 0x400000 }
   private GetMoveCastling(move: number) { return move & 0x800000 }

   private AddMove(moves: number[], move: number) {
      moves.push(move);
   }

   /*
   * <><><><><><><><><><><><><><><><><><>
   *
   *           Make/Undo Move
   *
   * <><><><><><><><><><><><><><><><><><>
   */

   private TakeBack() {
      // Copy bitboard and occupancy
      const copies = this.moveStack.pop() as BoardCopy;
      this.bitboards = copies.bitboards; 
      this.occupancies = copies.occupancies;

      this.side = copies.side;
      this.enpassant = copies.enpassant;
      this.castle = copies.castle;

      this.hashKey = copies.hashKey;

      //this.ply--;
   }

   private MakeMove(move: number) {
      this.moveStack.push({
         bitboards: this.bitboards.slice(0),
         occupancies: this.occupancies.slice(0),
         side: this.side,
         enpassant: this.enpassant,
         castle: this.castle,
         hashKey: this.hashKey
      });

      // parse the passed in move
      const fromSquare = move & 0x3f;
      const toSquare = (move & 0xfc0) >> 6;
      const piece = (move & 0xf000) >> 12;
      const promoted = (move & 0xf0000) >> 16;
      const capture = move & 0x100000;
      const doublePush = move & 0x200000;
      const enpassant = move & 0x400000;
      const castling = move & 0x800000;

      this.bitboards[piece] = this.RemoveBit(this.bitboards[piece], fromSquare);
      this.bitboards[piece] = this.SetBit(this.bitboards[piece], toSquare);

      // hash piece
      this.hashKey ^= this.pieceKeys[piece][fromSquare]; // remove piece from square
      this.hashKey ^= this.pieceKeys[piece][toSquare]; // add piece on square

      if (capture) {
         let startPiece, endPiece;

         // Set bitboard ranges based on side to move
         if (this.side === SideToMove.White) {
            startPiece = Pieces.p;
            endPiece = Pieces.k;
         }
         else {
            startPiece = Pieces.P;
            endPiece = Pieces.K;
         }

         // loop over opposite side's bitboards
         for (let i = startPiece; i <= endPiece; i++) {
            // if there's a piece on the target square, remove it.
            if (this.GetBit(this.bitboards[i], toSquare)) {
               this.bitboards[i] = this.RemoveBit(this.bitboards[i], toSquare);
               this.hashKey ^= this.pieceKeys[i][toSquare]; // remove captured piece from hash
               break;
            }
         }
      }

      // pawn promotion
      if (promoted) {
         if (this.side === SideToMove.White) {
            this.bitboards[piece] = this.RemoveBit(this.bitboards[Pieces.P], toSquare);
            this.hashKey ^= this.pieceKeys[Pieces.P][toSquare]; // remove promoted pawn from hash
         }
         else {
            this.bitboards[piece] = this.RemoveBit(this.bitboards[Pieces.p], toSquare);
            this.hashKey ^= this.pieceKeys[Pieces.p][toSquare];
         }

         this.bitboards[promoted] = this.SetBit(this.bitboards[promoted], toSquare);
         this.hashKey ^= this.pieceKeys[promoted][toSquare]; // add promoted piece to hash
      }

      // en passant
      if (enpassant) {
         // remove pawn captured by en passant from board and hash
         if (this.side === SideToMove.White) {
            this.bitboards[Pieces.p] = this.RemoveBit(this.bitboards[Pieces.p], toSquare + 8);
            this.hashKey ^= this.pieceKeys[Pieces.p][toSquare + 8];
         }
         else {
            this.bitboards[Pieces.P] = this.RemoveBit(this.bitboards[Pieces.P], toSquare - 8);
            this.hashKey ^= this.pieceKeys[Pieces.P][toSquare - 8];
         }
      }

      // update en passant
      if (this.enpassant !== Square.no_sq) {
         // remove en passant from the hash key
         this.hashKey ^= this.enpassantKeys[this.enpassant];
      }
      this.enpassant = Square.no_sq;

      if (doublePush) {
         // if side is white add 8, if black subtract 8
         // this is faster than doing an if/else condition
         const targetSquare = toSquare + (8 * ((-1) ** this.side))
         this.enpassant = targetSquare;
         this.hashKey ^= this.enpassantKeys[targetSquare];
      }

      if (castling) {
         switch (toSquare) {
            // white king side
            case (Square.g1): {
               this.bitboards[Pieces.R] = this.RemoveBit(this.bitboards[Pieces.R], Square.h1);
               this.bitboards[Pieces.R] = this.SetBit(this.bitboards[Pieces.R], Square.f1);

               this.hashKey ^= this.pieceKeys[Pieces.R][Square.h1]; // remove from h1 in hash
               this.hashKey ^= this.pieceKeys[Pieces.R][Square.f1]; // add to f1 in hash
               break;
            }
            // white queen side
            case (Square.c1): {
               this.bitboards[Pieces.R] = this.RemoveBit(this.bitboards[Pieces.R], Square.a1);
               this.bitboards[Pieces.R] = this.SetBit(this.bitboards[Pieces.R], Square.d1);

               this.hashKey ^= this.pieceKeys[Pieces.R][Square.a1]; // remove from a1 in hash
               this.hashKey ^= this.pieceKeys[Pieces.R][Square.d1]; // add to d1 in hash
               break;
            }
            // black king side
            case (Square.g8): {
               this.bitboards[Pieces.r] = this.RemoveBit(this.bitboards[Pieces.r], Square.h8);
               this.bitboards[Pieces.r] = this.SetBit(this.bitboards[Pieces.r], Square.f8);

               this.hashKey ^= this.pieceKeys[Pieces.r][Square.h8]; // remove from h8 in hash
               this.hashKey ^= this.pieceKeys[Pieces.r][Square.f8]; // add to f8 in hash
               break;
            }
            // black queen side
            case (Square.c8): {
               this.bitboards[Pieces.r] = this.RemoveBit(this.bitboards[Pieces.r], Square.a8);
               this.bitboards[Pieces.r] = this.SetBit(this.bitboards[Pieces.r], Square.d8);

               this.hashKey ^= this.pieceKeys[Pieces.r][Square.a8]; // remove from a8 in hash
               this.hashKey ^= this.pieceKeys[Pieces.r][Square.d8]; // add to d8 in hash
               break;
            }
         }
      }

      // update castling rights and castle hash
      this.hashKey ^= this.castleKeys[this.castle];
      this.castle &= castlingRights[fromSquare] & castlingRights[toSquare];
      this.hashKey ^= this.castleKeys[this.castle];

      // update occupancies
      this.occupancies = [0n, 0n, 0n];
      this.occupancies[SideToMove.White] = this.bitboards[Pieces.P] | this.bitboards[Pieces.N] | this.bitboards[Pieces.B] | this.bitboards[Pieces.R] | this.bitboards[Pieces.Q] | this.bitboards[Pieces.K];
      this.occupancies[SideToMove.Black] = this.bitboards[Pieces.p] | this.bitboards[Pieces.n] | this.bitboards[Pieces.b] | this.bitboards[Pieces.r] | this.bitboards[Pieces.q] | this.bitboards[Pieces.k];
      this.occupancies[SideToMove.Both] = this.occupancies[SideToMove.White] | this.occupancies[SideToMove.Black];

      // change side to move
      this.side ^= 1;

      this.hashKey ^= this.sideKey; // update side to move hash

      //this.ply++;

      // make sure the move has not exposed the king into a check
      if (this.IsSquareAttacked(this.side === SideToMove.White ? this.GetLS1B(this.bitboards[Pieces.k]) : this.GetLS1B(this.bitboards[Pieces.K]), this.side)) {
         // illegal move
         this.TakeBack();
         return 0;
      }
      else {
         return 1;
      }
   }

   /*
   * <><><><><><><><><><><><><><><><><><>
   *
   *        Transposition Tables
   *
   * <><><><><><><><><><><><><><><><><><>
   */

   private hashSize = 0; // should always be in bytes
   private readonly hashExact = 0;
   private readonly hashAlpha = 1;
   private readonly hashBeta = 2;
   private readonly hashNoMove = 0;
   private hashTable = {
      key: new BigUint64Array(this.hashSize),
      depth: new Uint8Array(this.hashSize),
      flag: new Uint8Array(this.hashSize),
      score: new Int32Array(this.hashSize),
      move: new Uint32Array(this.hashSize),
   }

   InitHashTable(hashSize = ((this.hashSize * 16) / 0x100000) || 32) {
      if (hashSize > 512 || hashSize < 1) {
         // default hash size 32MB
         this.hashSize = (32 * 0x100000) / 16;
         console.log(`Unable to set hash table size to ${hashSize}. Setting to default of 32MB`);
      }
      else {
         this.hashSize = (hashSize * 0x100000) / 16;
         console.log(`Hash table size set to: ${hashSize}MB`);
      }

      this.hashTable = {
         key: new BigUint64Array(this.hashSize),
         depth: new Uint8Array(this.hashSize),
         flag: new Uint8Array(this.hashSize),
         score: new Int32Array(this.hashSize),
         move: new Uint32Array(this.hashSize),
      }
   }
   
   private WriteHash(depth: number, flag: number, score: number, move: number) {
      const index = Number(this.hashKey % BigInt(this.hashSize));

      if (score > this.MATE_SCORE) {
         score += this.ply;
      }

      if (score < -this.MATE_SCORE) {
         score -= this.ply;
      }

      this.hashTable.key[index] = this.hashKey;

      if (this.hashTable.key[index] < 0n || this.hashTable.key[index] === 0n) {
         throw new Error(`Bad hash key: ${this.hashTable.key[index]} (${this.hashKey})`);
      }

      this.hashTable.score[index] = score;
      this.hashTable.flag[index] = flag;
      this.hashTable.depth[index] = depth;
      this.hashTable.move[index] = move;
   }

   private ProbeHash() {
      const index = Number(this.hashKey % BigInt(this.hashSize));

      const hashEntry = {
         key: this.hashTable.key[index],
         depth: this.hashTable.depth[index],
         flag: this.hashTable.flag[index],
         score: this.hashTable.score[index],
         move: this.hashTable.move[index],
      }

      if (hashEntry.key === this.hashKey) {
         return hashEntry;
      }

      return this.hashNoMove;
   }

   /*
   * <><><><><><><><><><><><><><><><><><>
   *
   *            Evaluation
   *
   * <><><><><><><><><><><><><><><><><><>
   */

   private readonly INFINITY = 50000;
   private readonly MATE_SCORE = 49000;
   private readonly maxPly = 64;
   private readonly IS_MATE = this.MATE_SCORE - (this.maxPly * 2);
   
   private ply = 0;
   private killerMoves: number[][] = Array(2).fill(0).map(() => Array(this.maxPly).fill(0));
   private historyMoves: number[][] = Array(64).fill(0).map(() => Array(64).fill(0));
   private pvLength: number[] = [];
   private pvTable: number[][] = Array(this.maxPly).fill(0).map(() => Array(this.maxPly).fill(0));
   private followPv = false;
   private scorePv = false;

   private fileMasks = Array(64).fill(0n);
   private rankMasks = Array(64).fill(0n);
   private isolatedMasks = Array(64).fill(0n);
   private wPassedMasks = Array(64).fill(0n);
   private bPassedMasks = Array(64).fill(0n);
   private readonly doubledPenalty = 15;
   private readonly isolatedPenalty = 7;
   private readonly passedBonus = [0, 2, 4, 10, 15, 25, 50, 200];

   private readonly fileSemiOpenScore = 7;
   private readonly fileOpenScore = 15;

   private readonly timing = {
      startTime: 0,
      moveTime: 0
   }

   private shouldStop = false;

   private SetFileRankMask(file: number, rank: number) {
      let mask = 0n;

      for (let r = 0; r < 8; r++) {
         for (let f = 0; f < 8; f++) {
            const square = r * 8 + f;

            if (file !== -1 && f === file) {
               mask |= this.SetBit(mask, square);
            }

            if (rank !== -1 && r === rank) {
               mask |= this.SetBit(mask, square);
            }
         }
      }

      return mask;
   }

   private InitEvalMasks() {
      for (let rank = 0; rank < 8; rank++) {
         for (let file = 0; file < 8; file++) {
            const square = rank * 8 + file;

            this.fileMasks[square] |= this.SetFileRankMask(file, -1);
            this.rankMasks[square] |= this.SetFileRankMask(-1, rank);
            this.isolatedMasks[square] |= this.SetFileRankMask(file - 1, -1) | this.SetFileRankMask(file + 1, -1);
            this.wPassedMasks[square] |= this.SetFileRankMask(file - 1, -1)
                                          | this.SetFileRankMask(file, -1)
                                          | this.SetFileRankMask(file + 1, -1);
            this.bPassedMasks[square] |= this.SetFileRankMask(file - 1, -1)
                                          | this.SetFileRankMask(file, -1)
                                          | this.SetFileRankMask(file + 1, -1);

            for (let i = 0; i < (8 - rank); i++) {
               this.wPassedMasks[square] &= ~this.rankMasks[(7 - i) * 8 + file];
            }

            for (let i = 0; i < (rank + 1); i++) {
               this.bPassedMasks[square] &= ~this.rankMasks[i * 8 + file];
            }
         }
      }
   }

   private CheckTime() {
      const elapsed = Date.now() - this.timing.startTime;
      
      if (this.timing.moveTime && elapsed >= this.timing.moveTime) {
         this.shouldStop = true;
      }
   }

   private Evaluate() {
      let mgScore = 0; // opening/middlegame score
      let egScore = 0; // endgame score
      let phase = 24; // (N*4) + (B*4) + (R*4) + (Q*2), where N = 1, B = 1, R = 2, Q = 4

      for (let piece = Pieces.P; piece <= Pieces.k; piece++) {
         let bitboard = this.bitboards[piece];
         if (bitboard) {
            // individual piece evaluation
            while (bitboard) {
               let square = this.GetLS1B(bitboard);

               if (piece <= 5) {
                  // piece square values
                  mgScore += this.pieceSquareValues[GamePhase.Opening][piece][square];
                  egScore += this.pieceSquareValues[GamePhase.Endgame][piece][square];

                  // piece values
                  mgScore += this.pieceValue[GamePhase.Opening][piece];
                  egScore += this.pieceValue[GamePhase.Endgame][piece];
               }
               else {
                  // flip the square if black piece
                  // piece square values
                  mgScore -= this.pieceSquareValues[GamePhase.Opening][piece - 6][square ^ 56];
                  egScore -= this.pieceSquareValues[GamePhase.Endgame][piece - 6][square ^ 56];

                  // piece values (addition because the piece value is negative)
                  mgScore += this.pieceValue[GamePhase.Opening][piece];
                  egScore += this.pieceValue[GamePhase.Endgame][piece];
               }

               // queens
               if (piece === Pieces.Q || piece === Pieces.q) {
                  phase -= 4;
               }

               // knights
               if (piece === Pieces.N || piece === Pieces.n) {
                  phase -= 1;
               }

               // bishops
               if (piece === Pieces.B || piece === Pieces.b) {
                  phase -= 1;
               }

               // white pawn evaluation
               if (piece === Pieces.P) {
                  // doubled pawns
                  // check the square behind the current pawn
                  if (this.GetBit(this.bitboards[Pieces.P], square + 8) !== 0n) {
                     mgScore -= this.doubledPenalty;
                     egScore -= this.doubledPenalty;
                  }

                  // isolated pawns
                  if ((this.bitboards[Pieces.P] & this.isolatedMasks[square]) === 0n) {
                     mgScore -= this.isolatedPenalty;
                     egScore -= this.isolatedPenalty;
                  }
                  
                  // passed pawns
                  if ((this.wPassedMasks[square] & this.bitboards[Pieces.p]) === 0n) {
                     // https://www.chessprogramming.org/Ranks
                     const rank = 7 - (square >> 3);
                     mgScore += this.passedBonus[rank];
                     egScore += this.passedBonus[rank];
                  }
               }

               // black pawn evaluation
               if (piece === Pieces.p) {
                  // doubled pawns
                  // check the square behind the current pawn
                  if (this.GetBit(this.bitboards[Pieces.p], square - 8) !== 0n) {
                     mgScore += this.doubledPenalty;
                     egScore += this.doubledPenalty;
                  }

                  // isolated pawns
                  if ((this.bitboards[Pieces.p] & this.isolatedMasks[square ^ 56]) === 0n) {
                     mgScore += this.isolatedPenalty;
                     egScore += this.isolatedPenalty;
                  }
                  
                  // passed pawns
                  if ((this.bPassedMasks[square] & this.bitboards[Pieces.P]) === 0n) {
                     // https://www.chessprogramming.org/Ranks
                     const rank = 7 - ((square ^ 56) >> 3);
                     mgScore -= this.passedBonus[rank];
                     egScore -= this.passedBonus[rank];
                  }
               }

               // white rook evaluation
               if (piece === Pieces.R) {
                  // semi-open file bonus
                  if ((this.bitboards[Pieces.P] & this.fileMasks[square]) === 0n) {
                     mgScore += this.fileSemiOpenScore;
                     egScore += this.fileSemiOpenScore;
                  }

                  // open file bonus
                  if (((this.bitboards[Pieces.P] | this.bitboards[Pieces.p]) & this.fileMasks[square]) === 0n) {
                     mgScore += this.fileOpenScore;
                     egScore += this.fileOpenScore;
                  }

                  phase -= 2;
               }

               // black rook evaluation
               if (piece === Pieces.r) {
                  // semi-open file bonus
                  if ((this.bitboards[Pieces.p] & this.fileMasks[square ^ 56]) === 0n) {
                     mgScore -= this.fileSemiOpenScore;
                     egScore -= this.fileSemiOpenScore;
                  }

                  // open file bonus
                  if (((this.bitboards[Pieces.P] | this.bitboards[Pieces.p]) & this.fileMasks[square ^ 56]) === 0n) {
                     mgScore -= this.fileOpenScore;
                     egScore -= this.fileOpenScore;
                  }

                  phase -= 2;
               }

               bitboard = this.RemoveBit(bitboard, square);
            }
         }
      }

      phase = ((phase * 256 + (24 / 2)) / 24) | 0;

      return (((mgScore * (256 - phase)) + (egScore * phase)) / 256 | 0) * ((-1) ** this.side);
   }

   /*
   * <><><><><><><><><><><><><><><><><><>
   *
   *               Search
   *
   * <><><><><><><><><><><><><><><><><><>
   */

   Search(depth: number) {
      // reset
      this.followPv = false;
      this.scorePv = false;
      this.nodesCount = 0;
      this.killerMoves = Array(2).fill(0).map(() => Array(this.maxPly).fill(0));
      this.historyMoves = Array(64).fill(0).map(() => Array(64).fill(0));
      this.pvLength = [];
      this.pvTable = Array(this.maxPly).fill(0).map(() => Array(this.maxPly).fill(0));
      this.timing.startTime = Date.now();

      // initialize
      let alpha = -this.INFINITY;
      let beta = this.INFINITY;
      let score = -this.INFINITY;
      let delta = -this.INFINITY;

      // iterative deepening loop
      for (let currentDepth = 1; !this.shouldStop && currentDepth <= depth; currentDepth++) {
         this.followPv = true;
         
         // reset aspiration window starting size
         if (currentDepth >= 4) {
            delta = 50;
            alpha = Math.max(score - delta, -this.INFINITY);
            beta = Math.min(score + delta, this.INFINITY);
         }

         // aspiration window loop
         while (true) {
            score = this.Negamax(alpha, beta, currentDepth, true);

            if (this.shouldStop) {
               break;
            }

            // search failed low
            if (score <= alpha) {
               beta = (alpha + beta) / 2;
               alpha = Math.max(score - delta, -this.INFINITY);
            }
            // search failed high
            else if (score >= beta) {
               beta = Math.min(score + delta, this.INFINITY);
            }
            else {
               break;
            }

            delta += Math.floor(delta / 4) + 5;
         }

         if (this.shouldStop) {
            break;
         }

         const infoScore = () => {
            if (score < -this.IS_MATE) {
               return `mate ${(-this.MATE_SCORE - score) / 2}`; // engine is being mated
            }
            else if (score > this.IS_MATE) {
               return `mate ${(this.MATE_SCORE - score + 1) / 2}`; // engine is mating
            }
            else {
               return `cp ${score}`;
            }
         }

         const pvnodes = () => {
            let string = "";
            for (let i = 0; i < this.pvLength[0]; i++) {
               string += `${SquareToCoords[this.GetMoveSource(this.pvTable[0][i])]}${SquareToCoords[this.GetMoveTarget(this.pvTable[0][i])]}${this.GetMovePromoted(this.pvTable[0][i]) ? this.promotedPieces[this.GetMovePromoted(this.pvTable[0][i])] : ''}`;
               string += " ";
            }
            return string;
         }

         // response format for UCI
         console.log(`info score ${infoScore()} depth ${currentDepth} nodes ${this.nodesCount} time ${Date.now() - this.timing.startTime} pv ${pvnodes()}`);

         // if a forced mate is found, we should stop searching
         if (score > this.IS_MATE || score < -this.IS_MATE) {
            break;
         }
      }

      console.log(`bestmove ${SquareToCoords[this.GetMoveSource(this.pvTable[0][0])]}${SquareToCoords[this.GetMoveTarget(this.pvTable[0][0])]}${this.GetMovePromoted(this.pvTable[0][0]) ? this.promotedPieces[this.GetMovePromoted(this.pvTable[0][0])] : ''}`);

      return `${SquareToCoords[this.GetMoveSource(this.pvTable[0][0])]}${SquareToCoords[this.GetMoveTarget(this.pvTable[0][0])]}${this.GetMovePromoted(this.pvTable[0][0]) ? this.promotedPieces[this.GetMovePromoted(this.pvTable[0][0])] : ''}`;
   }

   private Negamax(alpha: number, beta: number, depth: number, nullMoveAllowed: boolean) {
      let movesSearched = 0;
      let legalMovesCount = 0;
      let score = -this.INFINITY;
      let hashFlag = this.hashAlpha;
      let bestMove = 0;
      const isPVNode = beta > 1 + alpha;
      this.pvLength[this.ply] = this.ply;
      this.nodesCount++;

      this.CheckTime();

      if (this.shouldStop) {
         return 0;
      }

      // transposition table lookup
      const ttHash = this.ProbeHash();
      bestMove = typeof ttHash !== 'number' ? ttHash.move : this.hashNoMove;

      // normally you'd do "ttHash !== this.hashNoMove", but
      // for typing reasons just check if it's a number type
      // so the IDE/Typescript doesn't complain.
      // it will only be a number type if there's no move so
      // this should be okay
      if (this.ply && !isPVNode && typeof ttHash !== 'number') {
         let hashScore = ttHash.score;

         if (ttHash.depth >= depth) {
            if (hashScore > this.MATE_SCORE) {
               hashScore -= this.ply;
            }
   
            if (hashScore < -this.MATE_SCORE) {
               hashScore += this.ply;
            }
            
            if (ttHash.flag === this.hashExact ||
               (ttHash.flag === this.hashBeta ? ttHash.score >= beta : ttHash.score <= alpha)) {
               return hashScore;
            }
         }
      }

      if (this.ply && this.IsRepetition()) {
         return 0;
      }

      if (depth === 0) {
         return this.Quiescence(alpha, beta, 0);
      }

      if (this.ply >= this.maxPly) {
         return this.Evaluate();
      }

      // mate distance pruning
      const matingValue = this.MATE_SCORE - this.ply;
      if (matingValue < beta) {
         beta = matingValue;
         if (alpha >= matingValue) {
            return matingValue;
         }
      }

      if (-matingValue > alpha) {
         alpha = -matingValue;
         if (beta <= -matingValue) {
            return -matingValue;
         }
      }
      
      const inCheck = this.IsSquareAttacked(this.side === SideToMove.White ? this.GetLS1B(this.bitboards[Pieces.K]) : this.GetLS1B(this.bitboards[Pieces.k]), this.side ^ 1);

      if (inCheck) depth++;

      if (nullMoveAllowed && !inCheck && !isPVNode) {
         const staticEval = this.Evaluate();

         // null move
         if (this.ply && depth > 2 && (staticEval >= beta)) {
            // copy board
            this.moveStack.push({
               bitboards: this.bitboards.slice(0),
               occupancies: this.occupancies.slice(0),
               side: this.side,
               enpassant: this.enpassant,
               castle: this.castle,
               hashKey: this.hashKey
            });

            if (this.enpassant !== Square.no_sq) {
               this.hashKey ^= this.enpassantKeys[this.enpassant];
            }

            this.side ^= 1;
            this.enpassant = Square.no_sq;

            this.hashKey ^= this.sideKey;

            this.ply++;

            score = -this.Negamax(-beta, -beta + 1, depth - 3, false);

            this.ply--;

            this.TakeBack();

            if (score >= beta) {
               return beta;
            }
         }
         
         // razoring
         if (depth < 2) {
            let rvalue = staticEval + this.pieceValue[GamePhase.Opening][Pieces.P];
            if (rvalue < beta) {
               if (depth === 1) {
                  let newValue = this.Quiescence(alpha, beta, depth);
                  return Math.max(newValue, rvalue);
               }
               rvalue += (this.pieceValue[GamePhase.Opening][Pieces.P] * 2);
               if (rvalue < beta && depth <= 3) {
                  let newValue = this.Quiescence(alpha, beta, depth);
                  if (newValue < beta) {
                     return Math.max(newValue, rvalue);
                  }
               }
            }
         }
      }

      let moves: number[] = [];
      this.GenerateMoves(moves);

      if (this.followPv) {
         this.EnabledPVScoring(moves);
      }

      moves = this.SortMoves(moves, bestMove);

      for (let i = 0; i < moves.length; i++) {
         this.ply++;
         const move = moves[i];

         if (!this.MakeMove(move)) {
            this.ply--;
            continue;
         }

         legalMovesCount++;

         // Late move reduction (LMR)
         if (depth >= 3
            && movesSearched >= 4
            //&& !isPVNode
            && !inCheck
            && !this.GetMoveCapture(move)
            && !this.GetMovePromoted(move)
            ) {

            // reduction factor
            const R = movesSearched <= 6 ? 1 : Math.floor(depth / 3);

            // reduced search
            score = -this.Negamax(-alpha - 1, -alpha, depth - 1 - R, true);

            // full search if LMR found better move
            if (score > alpha) {
               score = -this.Negamax(-beta, -alpha, depth - 1, true);
            }
         }
         else {
            // full pvs search
            score = -this.Negamax(-beta, -alpha, depth - 1, true);
         }

         this.ply--;

         this.TakeBack();

         if (this.shouldStop) {
            return 0;
         }

         movesSearched++;

         if (score > alpha) {
            hashFlag = this.hashExact;
            bestMove = move;

            if (!this.GetMoveCapture(move)) {
               this.historyMoves[this.GetMoveSource(move)][this.GetMoveTarget(move)] += depth * depth;
            }

            alpha = score;

            // store the move in the pv table
            this.pvTable[this.ply][this.ply] = move;

            for (let nextPly = this.ply + 1; nextPly < this.pvLength[this.ply + 1]; nextPly++) {
               this.pvTable[this.ply][nextPly] = this.pvTable[this.ply + 1][nextPly];
            }

            this.pvLength[this.ply] = this.pvLength[this.ply + 1];
         }

         if (score >= beta) {
            // update transposition tables
            this.WriteHash(depth, this.hashBeta, score, move);

            if (!this.GetMoveCapture(move)) {
               this.killerMoves[1][this.ply] = this.killerMoves[0][this.ply];
               this.killerMoves[0][this.ply] = move;
            }
            
            return beta;
         }
      }

      if (!legalMovesCount) {
         // if king is attacked, return checkmate score
         if (inCheck) {
            return -this.MATE_SCORE + this.ply;
         }
         // no moves and not in checkmate is stalemate
         else {
            return 0;
         }
      }

      this.WriteHash(depth, hashFlag, score, bestMove);

      return alpha;
   }

   private Quiescence(alpha: number, beta: number, depth: number) {
      this.nodesCount++;

      // transposition table lookup
      const ttHash = this.ProbeHash();

      // normally you'd do "ttHash !== this.hashNoMove", but
      // for typing reasons just check if it's a number type
      // so the IDE/Typescript doesn't complain.
      // it will only be a number type if there's no move so
      // this should be okay
      if (this.ply && typeof ttHash !== 'number') {
         let hashScore = ttHash.score;

         if (ttHash.depth >= depth) {
            if (hashScore > this.MATE_SCORE) {
               hashScore -= this.ply;
            }
   
            if (hashScore < -this.MATE_SCORE) {
               hashScore += this.ply;
            }
            
            if (ttHash.flag === this.hashExact ||
               (ttHash.flag === this.hashBeta ? ttHash.score >= beta : ttHash.score <= alpha)) {
               return hashScore;
            }
         }
      }

      if (this.ply >= this.maxPly) {
         return this.Evaluate();
      }

      const standPat = this.Evaluate();

      if (standPat >= beta) {
         return beta;
      }

      // Delta pruning
      const BIGDELTA = 900; // queen value
      if (standPat < (alpha - BIGDELTA)) {
         return alpha;
      }

      if (alpha < standPat) {
         alpha = standPat;
      }

      let moves: number[] = [];
      this.GenerateMoves(moves, true);

      moves = this.SortMoves(moves);
      
      for (let i = 0; i < moves.length; i++) {
         this.ply++;

         if (!this.MakeMove(moves[i])) {
            this.ply--;
            continue;
         }

         let score = -this.Quiescence(-beta, -alpha, depth);

         this.ply--;

         this.TakeBack();

         if (this.shouldStop) {
            return 0;
         }

         if (score > alpha) {
            alpha = score;

            if (score >= beta) {
               return beta;
            }
         }
      }

      return alpha;
   }

   private IsRepetition() {
      // start at 4, because there can't be 3-fold repetition in the first 4 plies
      // increment by 2 because we check the hash of the current side-to-move
      let count = 0;
      for (let i = 4; i <= this.moveStack.length; i += 2) {
         if (this.moveStack[this.moveStack.length - i].hashKey === this.hashKey) {
            count++;
         }
      }

      if (count >= 2) {
         return true;
      }

      return false;
   }

   private EnabledPVScoring(moves: number[]) {
      this.followPv = false;

      for (let i = 0; i < moves.length; i++) {
         if (this.pvTable[0][this.ply] === moves[i]) {
            this.scorePv = true;
            this.followPv = true;
         }
      }
   }

   private ScoreMove(move: number) {
      if (this.scorePv) {
         if (this.pvTable[0][this.ply] === move) {
            this.scorePv = false;

            // make sure the PV-move is scored first
            return this.INFINITY;
         }
      }

      if (this.GetMoveCapture(move)) {
         let startPiece, endPiece, targetPiece = Pieces.P;

         // Set bitboard ranges based on side to move
         if (this.side === SideToMove.White) {
            startPiece = Pieces.p;
            endPiece = Pieces.k;
         }
         else {
            startPiece = Pieces.P;
            endPiece = Pieces.K;
         }

         for (let piece = startPiece; piece <= endPiece; piece++) {
            if (this.GetBit(this.bitboards[piece], this.GetMoveTarget(move))) {
               targetPiece = piece;
               break;
            }
         }

         // target piece value - moving piece value (MVV - LVV)
         // convert target piece to white piece value (so no negative piece values)
         return (Math.abs(this.pieceValue[this.gamePhase][Math.abs(targetPiece)]) - (this.GetMovePiece(move) + 1)) + 10000;
      }
      else {
         if (this.killerMoves[0][this.ply] === move) {
            return 9000;
         }

         else if (this.killerMoves[1][this.ply] === move) {
            return 8000;
         }

         else {
            return this.historyMoves[this.GetMoveSource(move)][this.GetMoveTarget(move)];
         }
      }
   }

   private SortMoves(moves: number[], bestMove = 0) {
      // From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort#sorting_with_map
      
      const mapped = moves.map((v, i) => {
         let value = 0;
         
         if (v === bestMove) {
            value = 30000;
         }
         else {
            value = this.ScoreMove(v);
         }

         return { i, value };
      });

      mapped.sort((a, b) => {
         if (a.value < b.value) {
            return 1;
         }
         if (a.value > b.value) {
            return -1;
         }
         return 0;
      });

      return mapped.map(v => moves[v.i]);
   }

   /*
   * <><><><><><><><><><><><><><><><><><>
   *
   *           Perft Testing
   *
   * <><><><><><><><><><><><><><><><><><>
   */

   Perft(depth: number) {
      const start = Date.now();
      const moves: number[] = [];

      this.GenerateMoves(moves);

      for (let count = 0; count < moves.length; count++) {    
         const move = moves[count];

         if (!this.MakeMove(move)) {
            continue;
         }

         let nodes = this.PerftDriver(depth - 1);
         console.log(`${SquareToCoords[this.GetMoveSource(move)]}${SquareToCoords[this.GetMoveTarget(move)]}: ${nodes}`);

         this.TakeBack();
      }

      console.log(`Time taken: ${Date.now() - start} ms`);
      console.log(`Nodes: ${(this.nodesCount).toLocaleString()}`);
   }

   private PerftDriver(depth: number) {
      let nodes = 0;
      if (depth === 0) {
         this.nodesCount++;
         return 1;
      }

      const moves: number[] = [];

      this.GenerateMoves(moves);

      for (let count = 0; count < moves.length; count++) {
         if (!this.MakeMove(moves[count])) {
            continue;
         }

         nodes += this.PerftDriver(depth - 1);

         this.TakeBack();
      }
      return nodes;
   }

   /*
   * <><><><><><><><><><><><><><><><><><>
   *
   *                UCI
   *
   * <><><><><><><><><><><><><><><><><><>
   */
   // spec: http://wbec-ridderkerk.nl/html/UCIProtocol.html

   private totalMoves = 0;

   /**
    * Is the given move valid on the current board?
    * @param move UCI-formatted move string
    */
   ParseUCIMove(move: string) {
      const moves: number[] = [];
      this.GenerateMoves(moves);
      
      for (let i = 0; i < moves.length; i++) {
         if ((SquareToCoords[this.GetMoveSource(moves[i])] + SquareToCoords[this.GetMoveTarget(moves[i])] + (this.GetMovePromoted(moves[i]) ? this.promotedPieces[this.GetMovePromoted(moves[i])] : '')) === move) {
            return moves[i];
         }
      }

      // move wasn't found (i.e. an illegal move)
      return 0;
   }

   ParseUCIPosition(command: string) {
      // given command with start with "position", which we can remove
      const position = command.split(' ').slice(1).join(' ');

      // apply the position
      if (position.startsWith("startpos")) {
         this.ParseFEN(Engine.positions.start);
      }
      else if (position.startsWith("fen")) {
         this.ParseFEN(position.split(' ').slice(1).join(' '));
      }
      else {
         this.ParseFEN(Engine.positions.start);
      }

      // get the moves from the string
      const moves = position.split('moves ').slice(1).join(' ').split(' ').filter(x => x != "");

      this.totalMoves = moves.length;

      for (let i = 0; i < moves.length; i++) {
         const move = this.ParseUCIMove(moves[i]);

         if (!move) {
            console.error('Unable to parse UCI command');
            console.log(`Command: ${command}`);
            console.log(`Invalid move: ${moves[i]}`);
            break;
         }

         this.MakeMove(move);
      }

      this.PrintBoard(true);
   }

   ParseUCIGo(command: string) {
      /**
       *    DEFAULTS
       * depth: 64
       * movetime: 0
       * movestogo: 30
       * 
       */

      // reset time controls
      this.timing.startTime = 0;
      this.timing.moveTime = 0;
      this.shouldStop = false;

      let movetime = parseInt((command.match(/movetime (\d+)/) || [])[1]) || 0;
      let depth = parseInt((command.match(/depth (\d+)/) || [])[1]) || 64;

      if (!movetime) {
         let movesToGo = parseInt((command.match(/movestogo (\d+)/) || [])[1]) || 35;
         let time, inc;

         if (this.side === SideToMove.White) {
            inc = parseInt((command.match(/winc (\d+)/) || [])[1]) || 0;
            time = parseInt((command.match(/wtime (\d+)/) || [])[1]) || 0;
         }
         else {
            inc = parseInt((command.match(/binc (\d+)/) || [])[1]) || 0;
            time = parseInt((command.match(/btime (\d+)/) || [])[1]) || 0;
         }

         // http://www.talkchess.com/forum3/viewtopic.php?t=51135
         if (this.totalMoves <= 20) {
            movesToGo = 45 - this.totalMoves;
         }
         else {
            movesToGo = 25;
         }

         movetime = time / movesToGo + inc;
      }

      // limit depth to [0, 64] range
      if (depth > 64 || depth <= 0) {
         depth = 64;
      }

      console.log(`Move time: ${movetime}`);

      this.timing.moveTime = movetime;

      return this.Search(depth);
   }
}

export default Engine;

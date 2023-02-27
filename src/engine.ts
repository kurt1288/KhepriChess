declare const __VERSION__: string;

export enum Square {
    a8, b8, c8, d8, e8, f8, g8, h8,
    a7, b7, c7, d7, e7, f7, g7, h7,
    a6, b6, c6, d6, e6, f6, g6, h6,
    a5, b5, c5, d5, e5, f5, g5, h5,
    a4, b4, c4, d4, e4, f4, g4, h4,
    a3, b3, c3, d3, e3, f3, g3, h3,
    a2, b2, c2, d2, e2, f2, g2, h2,
    a1, b1, c1, d1, e1, f1, g1, h1, no_sq,
}

export const enum Pieces {
    Pawn, Knight, Bishop, Rook, Queen, King,
}

export const enum Color {
    White,
    Black,
}

export const enum CastlingRights {
    WhiteKingside = 1,
    WhiteQueenside,
    BlackKingside = 4,
    BlackQueenside = 8,
}

// Moves types as defined at https://www.chessprogramming.org/Encoding_Moves
const enum MoveType {
    Normal,
    Promotion,
    EnPassant,
    Castle,
}

const enum PromotionType {
    Knight,
    Bishop,
    Rook,
    Queen,
}

const enum HashFlag {
    Exact,
    Alpha,
    Beta,
}

type Move = number;

export interface IPosition {
    PiecesBB: bigint[][]
    OccupanciesBB: [bigint, bigint]
    Squares: Piece[]
    CastlingRights: number
    SideToMove: Color
    EnPassSq: Square
    HalfMoves: number
    Ply: number
    Hash: bigint
    PawnHash: bigint
    Phase: number
    CastlingPaths: bigint[]
    CastlingRookSquares: Square[]
    CastlingSquaresMask: Square[]
}

interface Piece {
    Type: Pieces
    Color: Color
}

interface State {
    CastlingRights: CastlingRights
    EnPassSq: Square
    Captured?: Piece
    Hash: bigint
    PawnHash: bigint
    HalfMoves: number
    Phase: number
}

interface Zobrist {
    Pieces: bigint[][][]
    EnPassant: bigint[]
    Castle: bigint[]
    SideToMove: bigint
}

interface TTEntry {
    Hash: bigint
    BestMove: Move
    Depth: number
    Score: number
    Flag: HashFlag
}

interface TTable {
    Entries: TTEntry[]
    Size: bigint
}

interface PawnHashEntry {
    hash: bigint
    wScore: { mg: number, eg: number }
    bScore: { mg: number, eg: number }
}

interface PawnHashTable {
    Entries: PawnHashEntry[]
    Size: bigint
}

interface PVLine {
    moves: Move[]
}

interface Search {
    nodes: number
    killers: number[][]
    history: number[][][]
}

class Khepri {
    constructor() {
        this.Init();
        this.InitHashes();
        this.SetTransTableSize();
    }

    readonly name = "KhepriChess";
    readonly version = __VERSION__; // replaced by webpack
    readonly author = "Kurt Peters";

    // Flag to indicate if the game is Chess960/Fischer Random
    isChess960 = false;

    static readonly positions = {
        empty: "8/8/8/8/8/8/8/8 b - - ",
        start: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        kiwipete: "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -",
        pos3: "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -",
        pos4w: "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
        pos4b: "r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1",
        pos5: "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
        pos6: "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
    };

    /***************************
     * 
     * Bitboard
     * 
     **************************/

    SetBit(board: bigint, square: Square) {
        return board |= 1n << this.SquareBigInt[square];
    }

    RemoveBit(board: bigint, square: Square) {
        return board &= ~(1n << this.SquareBigInt[square]);
    }

    GetBit(board: bigint, square: Square) {
        return board & (1n << this.SquareBigInt[square]);
    }

    CountBits(bitboard: bigint) {
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

    GetLS1B(bitboard: bigint) {
        if (bitboard) {
            return this.CountBits((bitboard & -bitboard) - 1n);
        }
        
        return -1;
    }

    PrintBitboard(board: bigint) {
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

    /***************************
     * 
     * Position
     * 
     **************************/

    /* 
    * Array lookup for bigint of square is
    * faster than casting number to bigint
    */
    private readonly SquareBigInt = [
        0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n,
        8n, 9n, 10n, 11n, 12n, 13n, 14n, 15n,
        16n, 17n, 18n, 19n, 20n, 21n, 22n, 23n,
        24n, 25n, 26n, 27n, 28n, 29n, 30n, 31n,
        32n, 33n, 34n, 35n, 36n, 37n, 38n, 39n,
        40n, 41n, 42n, 43n, 44n, 45n, 46n, 47n,
        48n, 49n, 50n, 51n, 52n, 53n, 54n, 55n,
        56n, 57n, 58n, 59n, 60n, 61n, 62n, 63n, 64n,
    ]

    readonly Position: IPosition = {
        PiecesBB: [],
        OccupanciesBB: [0n, 0n],
        Squares: [],
        CastlingRights: 0,
        SideToMove: Color.White,
        EnPassSq: 0,
        HalfMoves: 0,
        Ply: 0,
        Hash: 0n,
        PawnHash: 0n,
        Phase: 0,
        CastlingPaths: [],
        CastlingRookSquares: [],
        CastlingSquaresMask: [],
    }

    private readonly PositionHistory: bigint[] = [];

    private readonly CharToPiece = new Map([
        ["P", { Type: Pieces.Pawn, Color: Color.White }],
        ["N", { Type: Pieces.Knight, Color: Color.White }],
        ["B", { Type: Pieces.Bishop, Color: Color.White }],
        ["R", { Type: Pieces.Rook, Color: Color.White }],
        ["Q", { Type: Pieces.Queen, Color: Color.White }],
        ["K", { Type: Pieces.King, Color: Color.White }],
        ["p", { Type: Pieces.Pawn, Color: Color.Black }],
        ["n", { Type: Pieces.Knight, Color: Color.Black }],
        ["b", { Type: Pieces.Bishop, Color: Color.Black }],
        ["r", { Type: Pieces.Rook, Color: Color.Black }],
        ["q", { Type: Pieces.Queen, Color: Color.Black }],
        ["k", { Type: Pieces.King, Color: Color.Black }],
    ]);

    /**
     * Loads an FEN string into the engine
     * @param fen The FEN string to load
     */
    LoadFEN(fen: string) {
        this.Position.PiecesBB = [
            [0n, 0n, 0n, 0n, 0n, 0n],
            [0n, 0n, 0n, 0n, 0n, 0n],
        ];
        this.Position.OccupanciesBB = [0n, 0n];
        this.Position.CastlingRights = 0;
        this.Position.Squares = [];
        this.Position.EnPassSq = Square.no_sq;
        this.Position.Phase = this.PhaseTotal;
        this.Position.CastlingSquaresMask = new Array(64).fill(15);

        const pieces = fen.split(" ")[0].split("");

        // Loop over each character in the FEN string
        // Set bitboards according to characters
        // for (let i = 0, square = 0; i < pieces.length; i++) {
        let square = 0;
        for (let i = 0; i < pieces.length; i++) {
            const char = pieces[i];

            switch (char) {
                case "p": case "n": case "b": case "r": case "q": case "k":
                case "P": case "N": case "B": case "R": case "Q": case "K": {
                    const piece = this.CharToPiece.get(char) as Piece;

                    this.PlacePiece(piece.Type, piece.Color, square);
                    this.Position.Phase -= this.PhaseValues[piece.Type];
                    square++;
                    break;
                }
                case "1": case "2": case "3": case "4":
                case "4": case "5": case "6": case "7": case "8": {
                    square += parseInt(char);
                    break;
                }
                case "/": {
                    break;
                }
                default: {
                    throw new Error(`Unable to parse FEN character: ${char}`);
                }
            }
        }

        // Set the side to move
        this.Position.SideToMove = fen.split(' ')[1] === 'w' ? Color.White : Color.Black;

        // Set castling rights
        const castling = fen.split(' ')[2].split('');
        for (const castle of castling) {
            const side = castle.toUpperCase() === castle ? Color.White : Color.Black;
            const kingSquare = this.GetLS1B(this.Position.PiecesBB[side][Pieces.King]);
            this.Position.CastlingSquaresMask[kingSquare] = side === Color.White ? 12 : 3;

            if (castle.toUpperCase() === "K") {
                const rookSquare = this.Position.Squares.findIndex((x, i) => x && x.Type === Pieces.Rook && x.Color === side && i > kingSquare);

                if (side === Color.White) {
                    this.Position.CastlingRights |= CastlingRights.WhiteKingside;
                    this.Position.CastlingPaths[CastlingRights.WhiteKingside] = (this.betweenMasks[kingSquare][Square.g1] | this.betweenMasks[rookSquare][Square.f1]) & ~(this.Position.PiecesBB[side][Pieces.King] | this.SetBit(0n, rookSquare));
                    this.Position.CastlingRookSquares[CastlingRights.WhiteKingside] = rookSquare;
                    this.Position.CastlingSquaresMask[rookSquare] = 14;
                }
                else {
                    this.Position.CastlingRights |= CastlingRights.BlackKingside;
                    this.Position.CastlingPaths[CastlingRights.BlackKingside] = (this.betweenMasks[kingSquare][Square.g8] | this.betweenMasks[rookSquare][Square.f8]) & ~(this.Position.PiecesBB[side][Pieces.King] | this.SetBit(0n, rookSquare));
                    this.Position.CastlingRookSquares[CastlingRights.BlackKingside] = rookSquare;
                    this.Position.CastlingSquaresMask[rookSquare] = 11;
                }
            }
            else if (castle.toUpperCase() === "Q") {
                const rookSquare = this.Position.Squares.findIndex((x, i) => x && x.Type === Pieces.Rook && x.Color === side && i < kingSquare);

                if (side === Color.White) {
                    this.Position.CastlingRights |= CastlingRights.WhiteQueenside;
                    this.Position.CastlingPaths[CastlingRights.WhiteQueenside] = (this.betweenMasks[kingSquare][Square.c1] | this.betweenMasks[rookSquare][Square.d1]) & ~(this.Position.PiecesBB[side][Pieces.King] | this.SetBit(0n, rookSquare));
                    this.Position.CastlingRookSquares[CastlingRights.WhiteQueenside] = rookSquare;
                    this.Position.CastlingSquaresMask[rookSquare] = 13;
                }
                else {
                    this.Position.CastlingRights |= CastlingRights.BlackQueenside;
                    this.Position.CastlingPaths[CastlingRights.BlackQueenside] = (this.betweenMasks[kingSquare][Square.c8] | this.betweenMasks[rookSquare][Square.d8]) & ~(this.Position.PiecesBB[side][Pieces.King] | this.SetBit(0n, rookSquare));
                    this.Position.CastlingRookSquares[CastlingRights.BlackQueenside] = rookSquare;
                    this.Position.CastlingSquaresMask[rookSquare] = 7;
                }
            }
            // Shredder-FEN castling notation for Chess960
            else if (castle.toUpperCase() >= "A" && castle.toUpperCase() <= "H") {
                // Kingside castle
                if (castle.toUpperCase().charCodeAt(0) - 65 > (kingSquare & 7)) {
                    const rookSquare = this.Position.Squares.findIndex((x, i) => x && x.Type === Pieces.Rook && x.Color === side && i > kingSquare);

                    if (side === Color.White) {
                        this.Position.CastlingRights |= CastlingRights.WhiteKingside;
                        this.Position.CastlingPaths[CastlingRights.WhiteKingside] = (this.betweenMasks[kingSquare][Square.g1] | this.betweenMasks[rookSquare][Square.f1] | this.squareBB[Square.g1] | this.squareBB[Square.f1]) & ~(this.Position.PiecesBB[side][Pieces.King] | this.SetBit(0n, rookSquare));
                        this.Position.CastlingRookSquares[CastlingRights.WhiteKingside] = rookSquare;
                        this.Position.CastlingSquaresMask[rookSquare] = 14;
                    }
                    else {
                        this.Position.CastlingRights |= CastlingRights.BlackKingside;
                        this.Position.CastlingPaths[CastlingRights.BlackKingside] = (this.betweenMasks[kingSquare][Square.g8] | this.betweenMasks[rookSquare][Square.f8] | this.squareBB[Square.g8] | this.squareBB[Square.f8]) & ~(this.Position.PiecesBB[side][Pieces.King] | this.SetBit(0n, rookSquare));
                        this.Position.CastlingRookSquares[CastlingRights.BlackKingside] = rookSquare;
                        this.Position.CastlingSquaresMask[rookSquare] = 11;
                    }
                }
                // Queenside castle
                else {
                    if (side === Color.White) {
                        const rookSquare = this.Position.Squares.findIndex((x, i) => x && x.Type === Pieces.Rook && x.Color === side && i >= 56 && i < kingSquare);
                        this.Position.CastlingRights |= CastlingRights.WhiteQueenside;
                        this.Position.CastlingPaths[CastlingRights.WhiteQueenside] = (this.betweenMasks[kingSquare][Square.c1] | this.betweenMasks[rookSquare][Square.d1] | this.squareBB[Square.c1] | this.squareBB[Square.d1]) & ~(this.Position.PiecesBB[side][Pieces.King] | this.SetBit(0n, rookSquare));
                        this.Position.CastlingRookSquares[CastlingRights.WhiteQueenside] = rookSquare;
                        this.Position.CastlingSquaresMask[rookSquare] = 13;
                    }
                    else {
                        const rookSquare = this.Position.Squares.findIndex((x, i) => x && x.Type === Pieces.Rook && x.Color === side && i < kingSquare);
                        this.Position.CastlingRights |= CastlingRights.BlackQueenside;
                        this.Position.CastlingPaths[CastlingRights.BlackQueenside] = (this.betweenMasks[kingSquare][Square.c8] | this.betweenMasks[rookSquare][Square.d8] | this.squareBB[Square.c8] | this.squareBB[Square.d8]) & ~(this.Position.PiecesBB[side][Pieces.King] | this.SetBit(0n, rookSquare));
                        this.Position.CastlingRookSquares[CastlingRights.BlackQueenside] = rookSquare;
                        this.Position.CastlingSquaresMask[rookSquare] = 7;
                    }
                }
            }
        }

        // Set the en passant square
        const enpassant = fen.split(' ')[3];
        if (enpassant !== '-') {
            const files = 'abcdefgh';
            const file = files.indexOf(enpassant.split('')[0]);
            const rank = 8 - parseInt(enpassant[1], 10);
            const enPSquare = rank * 8 + file;

            // Only set the en passant square if an opponent pawn can make that move
            if (this.PawnAttacks[this.Position.SideToMove ^ 1][enPSquare] & this.Position.PiecesBB[this.Position.SideToMove][Pieces.Pawn]) {
                this.Position.EnPassSq = enPSquare;
            }
        }

        // Set the game ply. If ply is not set in FEN, set it to 0
        this.Position.Ply = parseInt(fen.split(' ')[5]) * 2 || 0;
        // Ply is only incremented after black's move,
        // so if it's black's turn, we have to decrease by 1
        if (this.Position.SideToMove === Color.Black) {
            this.Position.Ply--;
        }

        // Set the halfmove clock
        this.Position.HalfMoves = parseInt(fen.split(' ')[4]) || 0;

        // Generate the hashes for the position
        const { hash, pawnHash } = this.GenerateHashes();
        this.Position.Hash = hash;
        this.Position.PawnHash = pawnHash;

        this.PositionHistory.length = 0;
        this.PositionHistory[0] = this.Position.Hash;

        this.KingSquares[0] = 0;
        this.KingSquares[1] = 0;
    }

    /**
     * Prints a graphical representation of the current board position to the console
     */
    PrintBoard() {
        const unicode = [ ["♙", "♘", "♗", "♖", "♕", "♔"], ["♟︎", "♞", "♝", "♜", "♛", "♚"] ];
        for (let rank = 0; rank < 8; rank++) {
            let r = "";
            for (let file = 0; file < 8; file++) {
                let square = rank * 8 + file;
                let piece = this.Position.Squares[square] ?? null;

                if (!file) {
                    r += `${8 - rank} `;
                }

                if (piece) {
                    r += ` ${unicode[piece.Color][piece.Type]}`;
                }
                else {
                    r += ' . ';
                }
            }
            console.log(`${r} \r\n`);
        }
        console.log('\r\n   a  b  c  d  e  f  g  h');
        console.log(`Side to move: ${this.Position.SideToMove === Color.White ? 'white' : 'black'}`);
        console.log(`En passant: ${this.Position.EnPassSq !== Square.no_sq ? Square[this.Position.EnPassSq] : "no"}`);
        console.log(`Castling rights: ${this.Position.CastlingRights & CastlingRights.WhiteKingside ? 'K' : '-'}${this.Position.CastlingRights & CastlingRights.WhiteQueenside ? 'Q' : '-'}${this.Position.CastlingRights & CastlingRights.BlackKingside ? 'k' : '-'}${this.Position.CastlingRights & CastlingRights.BlackQueenside ? 'q' : '-'}`);
        console.log(`Plies: ${this.Position.Ply}`);
    }

    /***************************
     * 
     * MoveGen
     * 
     **************************/

    /**
     * Generate possible moves with the currently loaded position
     */
    GenerateMoves(tacticalOnly = false) {
        // clear the existing move list
        const moveList: Move[] = [];
        let attacked = 0xffffffffffffffffn; // default to full board

        if (tacticalOnly) {
            attacked = this.Position.OccupanciesBB[this.Position.SideToMove ^ 1];
            this.GeneratePawnAttacks(moveList);
        }
        else {
            this.GeneratePawnMoves(moveList, attacked);
            this.GenerateCastlingMoves(moveList);
        }

        // Start at Knight because Pawns are generated separately
        for (let piece = Pieces.Knight; piece <= Pieces.King; piece++) {
            let bitboard = this.Position.PiecesBB[this.Position.SideToMove][piece];

            while (bitboard) {
                const square = this.GetLS1B(bitboard);

                switch (piece) {
                    case Pieces.Knight: {
                        this.GenerateKnightMoves(moveList, square, attacked);
                        break;
                    }
                    case Pieces.Bishop: {
                        this.GenerateBishopMoves(moveList, square, attacked);
                        break;
                    }
                    case Pieces.Rook: {
                        this.GenerateRookMoves(moveList, square, attacked);
                        break;
                    }
                    case Pieces.Queen: {
                        this.GenerateQueenMoves(moveList, square, attacked);
                        break;
                    }
                    case Pieces.King: {
                        this.GenerateKingMoves(moveList, square, attacked);
                        break;
                    }
                }

                bitboard = this.RemoveBit(bitboard, square);
            }
        }

        return moveList;
    }

    GenerateEvasions() {
        const moveList: Move[] = [];
        let attacked = 0xffffffffffffffffn; // default to full board
        const kingSquare = this.GetLS1B(this.Position.PiecesBB[this.Position.SideToMove][Pieces.King]);
        let attackers = this.AttacksToByColor(kingSquare, this.Position.SideToMove ^ 1);

        // All king moves even in check
        this.GenerateKingMoves(moveList, kingSquare, attacked);
        
        // If there are multiple pieces giving check, moving the king is the only option
        if (this.CountBits(attackers) > 1) {
            return moveList;
        }

        attacked = attackers;

        const attackerSquare = this.GetLS1B(attackers);
        const piece = this.Position.Squares[attackerSquare];

        // If the attacking piece is a slider, moves onto the attacker's ray are also valid
        if (piece.Type >= Pieces.Bishop) {
            attacked |= this.betweenMasks[kingSquare][attackerSquare];
        }

        this.GeneratePawnMoves(moveList, attacked);

        for (let piece = Pieces.Knight; piece < Pieces.King; piece++) {
            let bitboard = this.Position.PiecesBB[this.Position.SideToMove][piece];

            while (bitboard) {
                const square = this.GetLS1B(bitboard);

                switch (piece) {
                    case Pieces.Knight: {
                        this.GenerateKnightMoves(moveList, square, attacked);
                        break;
                    }
                    case Pieces.Bishop: {
                        this.GenerateBishopMoves(moveList, square, attacked);
                        break;
                    }
                    case Pieces.Rook: {
                        this.GenerateRookMoves(moveList, square, attacked);
                        break;
                    }
                    case Pieces.Queen: {
                        this.GenerateQueenMoves(moveList, square, attacked);
                        break;
                    }
                }

                bitboard = this.RemoveBit(bitboard, square);
            }
        }

        return moveList;
    }

    /**
     * Generate pawn moves for the loaded position
     */
    GeneratePawnMoves(moveList: Move[], attacked: bigint) {
        let pawnBB = this.Position.PiecesBB[this.Position.SideToMove][Pieces.Pawn];
        const emptyBB = ~(this.Position.OccupanciesBB[Color.White] | this.Position.OccupanciesBB[Color.Black]);

        let singlePushTargets = ((this.Position.SideToMove === Color.White) ? (pawnBB >> 8n) : (pawnBB << 8n)) & emptyBB;
        let doublePushTargets = (singlePushTargets >> 8n) & 0x000000FF00000000n & emptyBB;
        if (this.Position.SideToMove === Color.Black) {
            doublePushTargets = (singlePushTargets << 8n) & 0x00000000FF000000n & emptyBB;
        }

        // push targets to attacker squares (or all squares if generating all moves)
        singlePushTargets &= attacked;
        doublePushTargets &= attacked;

        // Add non attack moves
        while (singlePushTargets) {
            const toSquare = this.GetLS1B(singlePushTargets);
            const fromSquare = this.Position.SideToMove === Color.White ? toSquare + 8 : toSquare - 8;

            // Add pawn promotions
            if (this.Position.SideToMove === Color.White ? toSquare <= Square.h8 : toSquare >= Square.a1) {
                moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.Promotion, PromotionType.Knight));
                moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.Promotion, PromotionType.Bishop));
                moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.Promotion, PromotionType.Rook));
                moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.Promotion, PromotionType.Queen));
            }
            else {
                // Add quiet moves
                moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.Normal));
            }

            singlePushTargets = this.RemoveBit(singlePushTargets, toSquare);
        }

        while (doublePushTargets) {
            const toSquare = this.GetLS1B(doublePushTargets);
            const fromSquare = this.Position.SideToMove === Color.White ? toSquare + 16 : toSquare - 16;

            moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.Normal));

            doublePushTargets = this.RemoveBit(doublePushTargets, toSquare);
        }

        while (pawnBB) {
            const fromSquare = this.GetLS1B(pawnBB);
            
            let attacks = this.PawnAttacks[this.Position.SideToMove][fromSquare] & this.Position.OccupanciesBB[this.Position.SideToMove ^ 1] & attacked;

            while (attacks) {
                const toSquare = this.GetLS1B(attacks);

                // Pawn attacks to promotion
                if (this.Position.SideToMove === Color.White ? toSquare <= Square.h8 : toSquare >= Square.a1) {
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.Promotion, PromotionType.Knight));
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.Promotion, PromotionType.Bishop));
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.Promotion, PromotionType.Rook));
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.Promotion, PromotionType.Queen));
                }
                else {
                    // Regular captures
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.Normal));
                }

                attacks = this.RemoveBit(attacks, toSquare);
            }

            // en passant captures
            if (this.Position.EnPassSq !== Square.no_sq) {
                const enpassantAttacks = this.PawnAttacks[this.Position.SideToMove][fromSquare] & (1n << this.SquareBigInt[this.Position.EnPassSq]);

                if (enpassantAttacks) {
                    const toSquare = this.GetLS1B(enpassantAttacks);
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.EnPassant));
                }
            }

            pawnBB = this.RemoveBit(pawnBB, fromSquare);
        }
    }

    GeneratePawnAttacks(moveList: Move[]) {
        let pawnBB = this.Position.PiecesBB[this.Position.SideToMove][Pieces.Pawn];

        while (pawnBB) {
            const fromSquare = this.GetLS1B(pawnBB);
            
            let attacks = this.PawnAttacks[this.Position.SideToMove][fromSquare] & this.Position.OccupanciesBB[this.Position.SideToMove ^ 1];

            while (attacks) {
                const toSquare = this.GetLS1B(attacks);

                // Pawn attacks to promotion
                if (this.Position.SideToMove === Color.White ? toSquare <= Square.h8 : toSquare >= Square.a1) {
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.Promotion, PromotionType.Knight));
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.Promotion, PromotionType.Bishop));
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.Promotion, PromotionType.Rook));
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.Promotion, PromotionType.Queen));
                }
                else {
                    // Regular captures
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.Normal));
                }

                attacks = this.RemoveBit(attacks, toSquare);
            }

            // en passant captures
            if (this.Position.EnPassSq !== Square.no_sq) {
                const enpassantAttacks = this.PawnAttacks[this.Position.SideToMove][fromSquare] & (1n << this.SquareBigInt[this.Position.EnPassSq]);

                if (enpassantAttacks) {
                    const toSquare = this.GetLS1B(enpassantAttacks);
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.EnPassant));
                }
            }

            pawnBB = this.RemoveBit(pawnBB, fromSquare);
        }
    }

    GenerateCastlingMoves(moveList: Move[]) {
        const kingSquare = this.GetLS1B(this.Position.PiecesBB[this.Position.SideToMove][Pieces.King]);

        if (this.IsSquareAttacked(kingSquare, this.Position.SideToMove ^ 1)) {
            return;
        }

        const bothBB = this.Position.OccupanciesBB[Color.White] | this.Position.OccupanciesBB[Color.Black];

        if (this.Position.SideToMove === Color.White) {
            if (this.Position.CastlingRights & CastlingRights.WhiteKingside) {
                let path = this.betweenMasks[kingSquare][Square.h1];
                if ((this.Position.CastlingPaths[CastlingRights.WhiteKingside] & bothBB) === 0n) {
                    let canCastle = true;
                    while (canCastle && path) {
                        const square = this.GetLS1B(path);
                        path = this.RemoveBit(path, square);
                        if (this.IsSquareAttacked(square, this.Position.SideToMove ^ 1)) {
                            canCastle = false;
                        }
                    }
                    if (canCastle) {
                        moveList.push(this.EncodeMove(kingSquare, this.Position.CastlingRookSquares[CastlingRights.WhiteKingside], MoveType.Castle));
                    }
                }
            }
    
            if (this.Position.CastlingRights & CastlingRights.WhiteQueenside) {
                let path = this.betweenMasks[kingSquare][Square.c1];
                if ((this.Position.CastlingPaths[CastlingRights.WhiteQueenside] & bothBB) === 0n) {
                    let canCastle = true;
                    while (canCastle && path) {
                        const square = this.GetLS1B(path);
                        path = this.RemoveBit(path, square);
                        if (this.IsSquareAttacked(square, this.Position.SideToMove ^ 1)) {
                            canCastle = false;
                        }
                    }
                    if (canCastle) {
                        moveList.push(this.EncodeMove(kingSquare, this.Position.CastlingRookSquares[CastlingRights.WhiteQueenside], MoveType.Castle));
                    }
                }
            }
        }
        else {            
            if (this.Position.CastlingRights & CastlingRights.BlackKingside) {
                let path = this.betweenMasks[kingSquare][Square.h8];
                if ((this.Position.CastlingPaths[CastlingRights.BlackKingside] & bothBB) === 0n) {
                    let canCastle = true;
                    while (canCastle && path) {
                        const square = this.GetLS1B(path);
                        path = this.RemoveBit(path, square);
                        if (this.IsSquareAttacked(square, this.Position.SideToMove ^ 1)) {
                            canCastle = false;
                        }
                    }
                    if (canCastle) {
                        moveList.push(this.EncodeMove(kingSquare, this.Position.CastlingRookSquares[CastlingRights.BlackKingside], MoveType.Castle));
                    }
                }
            }
    
            if (this.Position.CastlingRights & CastlingRights.BlackQueenside) {
                let path = this.betweenMasks[kingSquare][Square.c8];
                if ((this.Position.CastlingPaths[CastlingRights.BlackQueenside] & bothBB) === 0n) {
                    let canCastle = true;
                    while (canCastle && path) {
                        const square = this.GetLS1B(path);
                        path = this.RemoveBit(path, square);
                        if (this.IsSquareAttacked(square, this.Position.SideToMove ^ 1)) {
                            canCastle = false;
                        }
                    }
                    if (canCastle) {
                        moveList.push(this.EncodeMove(kingSquare, this.Position.CastlingRookSquares[CastlingRights.BlackQueenside], MoveType.Castle));
                    }
                }
            }
        }
    }

    GenerateKnightMoves(moveList: Move[], square: Square, attacked: bigint) {
        let movesBB = (this.KnightAttacks[square] & ~this.Position.OccupanciesBB[this.Position.SideToMove]) & attacked;

        while (movesBB) {
            const toSquare = this.GetLS1B(movesBB);
            moveList.push(this.EncodeMove(square, toSquare, MoveType.Normal));
            movesBB = this.RemoveBit(movesBB, toSquare);
        }
    }

    GenerateBishopAttacks(occupancy: bigint, square: Square) {
        occupancy = BigInt.asUintN(64, (occupancy & this.BishopMasks[square]));
        occupancy = BigInt.asUintN(64, occupancy * this.BishopMagicNumbers[square]);
        occupancy >>= 64n - this.BishopRelevantBits[square];

        return this.BishopAttacks[square][Number(occupancy)];
    }

    GenerateBishopMoves(moveList: Move[], square: Square, attacked: bigint) {
        let attacks = (this.GenerateBishopAttacks(this.Position.OccupanciesBB[Color.White] | this.Position.OccupanciesBB[Color.Black], square) & ~this.Position.OccupanciesBB[this.Position.SideToMove]) & attacked;

        while (attacks) {
            const toSquare = this.GetLS1B(attacks);
            moveList.push(this.EncodeMove(square, toSquare, MoveType.Normal));
            attacks = this.RemoveBit(attacks, toSquare);
        }
    }

    GenerateRookAttacks(occupancy: bigint, square: Square) {
        occupancy = BigInt.asUintN(64, occupancy & this.RookMasks[square]);
        occupancy = BigInt.asUintN(64, occupancy * this.RookMagicNumbers[square]);
        occupancy >>= 64n - this.RookRelevantBits[square];

        return this.RookAttacks[square][Number(occupancy)];
    }

    GenerateRookMoves(moveList: Move[], square: Square, attacked: bigint) {
        let attacks = (this.GenerateRookAttacks(this.Position.OccupanciesBB[Color.White] | this.Position.OccupanciesBB[Color.Black], square) & ~this.Position.OccupanciesBB[this.Position.SideToMove]) & attacked;

        while (attacks) {
            const toSquare = this.GetLS1B(attacks);
            moveList.push(this.EncodeMove(square, toSquare, MoveType.Normal));
            attacks = this.RemoveBit(attacks, toSquare);
        }
    }

    GenerateQueenMoves(moveList: Move[], square: Square, attacked: bigint) {
        const occupancy = this.Position.OccupanciesBB[Color.White] | this.Position.OccupanciesBB[Color.Black];
        let attacks = ((this.GenerateBishopAttacks(occupancy, square) | this.GenerateRookAttacks(occupancy, square)) & ~this.Position.OccupanciesBB[this.Position.SideToMove]) & attacked;

        while (attacks) {
            const toSquare = this.GetLS1B(attacks);
            moveList.push(this.EncodeMove(square, toSquare, MoveType.Normal));
            attacks = this.RemoveBit(attacks, toSquare);
        }
    }

    GenerateKingMoves(moveList: Move[], square: Square, attacked: bigint) {
        let movesBB = (this.KingAttacks[square] & ~this.Position.OccupanciesBB[this.Position.SideToMove]) & attacked;

        while (movesBB) {
            const toSquare = this.GetLS1B(movesBB);
            moveList.push(this.EncodeMove(square, toSquare, MoveType.Normal));
            movesBB = this.RemoveBit(movesBB, toSquare);
        }
    }

    /**
     * Encode the given move
     */
    EncodeMove(from: Square, to: Square, type: MoveType, promotionType = PromotionType.Knight) {
        return from | (to << 6) | (type << 12) | (promotionType << 14);
    }

    MoveIsCapture(move: Move) {
        // Chess960 castles are encoded as king takes rook, so we have to exclude those here
        const moveType = (move & 0x3f80) >> 12;
        return (moveType !== MoveType.Castle && this.Position.Squares[(move & 0xfc0) >> 6] !== undefined) || (moveType === MoveType.EnPassant);
    }

    MoveIsPromotion(move: Move) {
        return (move & 0x3f80) >> 12 === MoveType.Promotion;
    }

    IsSquareAttacked(square: Square, side: Color) {
        const bishops = this.Position.PiecesBB[side][Pieces.Bishop];
        const rooks = this.Position.PiecesBB[side][Pieces.Rook];
        const queens = this.Position.PiecesBB[side][Pieces.Queen];

        if (this.PawnAttacks[side ^ 1][square] & this.Position.PiecesBB[side][Pieces.Pawn]) {
            return true;
        }
        if (this.KnightAttacks[square] & this.Position.PiecesBB[side][Pieces.Knight]) { 
            return true;
        }

        const occupancy = this.Position.OccupanciesBB[Color.White] | this.Position.OccupanciesBB[Color.Black];
        const bishopQueens = bishops | queens;
        // Bishop and Rook attacks are expensive to calcuate, so check the masks first to see if the call even needs to be made
        if ((this.attackRays[Pieces.Bishop - Pieces.Bishop][square] & bishopQueens) && this.GenerateBishopAttacks(occupancy, square) & bishopQueens) {
            return true;
        }
        
        const rookQueens = rooks | queens;
        if ((this.attackRays[Pieces.Rook - Pieces.Bishop][square] & rookQueens) && this.GenerateRookAttacks(occupancy, square) & rookQueens) {
            return true;
        }
        if (this.KingAttacks[square] & this.Position.PiecesBB[side][Pieces.King]) {
            return true;
        }

        return false;
    }

    /***************************
     * 
     * Move
     * 
     **************************/

    private readonly stateCopy: State[] = [];

    /**
     * Makes a move
     * @param move a move number
     * @returns False if the move would leave side's own king in check, otherwise true
     */
    MakeMove(move: Move) {
        const from = move & 0x3f;
        const to = (move & 0xfc0) >> 6;
        const moveType = (move & 0x3f80) >> 12;
        const piece = this.Position.Squares[from];
        let captured: Piece | undefined = moveType === MoveType.EnPassant ? { Type: Pieces.Pawn, Color: this.Position.SideToMove ^ 1 } : this.Position.Squares[to];

        this.stateCopy.push({
            CastlingRights: this.Position.CastlingRights,
            EnPassSq: this.Position.EnPassSq,
            Captured: captured,
            Hash: this.Position.Hash,
            PawnHash: this.Position.PawnHash,
            HalfMoves: this.Position.HalfMoves,
            Phase: this.Position.Phase,
        });

        this.Position.Ply++;
        this.Position.HalfMoves++;

        // Clear the en passant square
        if (this.Position.EnPassSq !== Square.no_sq) {
            this.Position.Hash ^= this.Zobrist.EnPassant[this.Position.EnPassSq];
            this.Position.EnPassSq = Square.no_sq;
        }

        if (moveType === MoveType.Castle) {
            this.DoCastle(piece, from, to);
        }
        else {
            if (captured !== undefined || moveType === MoveType.EnPassant) {
                let captureSquare = to;
    
                if (moveType === MoveType.EnPassant) {
                    captureSquare = piece.Color === Color.White ? to + 8 : to - 8;
                }
    
                this.RemovePiece(captured.Type, captured.Color, captureSquare);
                this.Position.HalfMoves = 0;

                this.Position.Hash ^= this.Zobrist.Pieces[captured.Color][captured.Type][to];

                this.Position.Phase += this.PhaseValues[captured.Type];

                if (captured.Type === Pieces.Pawn) {
                    this.Position.PawnHash ^= this.Zobrist.Pieces[captured.Color][captured.Type][to];
                }
            }
    
            this.MovePiece(piece, from, to);

            this.Position.Hash ^= this.Zobrist.Pieces[piece.Color][piece.Type][from] ^ this.Zobrist.Pieces[piece.Color][piece.Type][to];
    
            if (piece.Type === Pieces.Pawn) {
                this.Position.HalfMoves = 0;
                this.Position.PawnHash ^= this.Zobrist.Pieces[piece.Color][piece.Type][from] ^ this.Zobrist.Pieces[piece.Color][piece.Type][to];
    
                if (moveType === MoveType.Promotion) {
                    const promotionType: Piece = { Type: (move >> 14) + Pieces.Knight, Color: piece.Color };
                    this.RemovePiece(piece.Type, piece.Color, to);
                    this.PlacePiece(promotionType.Type, promotionType.Color, to);
                    this.Position.Phase += this.PhaseValues[Pieces.Pawn];
                    this.Position.Phase -= this.PhaseValues[promotionType.Type];
                    this.Position.Hash ^= this.Zobrist.Pieces[piece.Color][piece.Type][to] ^ this.Zobrist.Pieces[promotionType.Color][promotionType.Type][to];
                    this.Position.PawnHash ^= this.Zobrist.Pieces[piece.Color][piece.Type][to];
                }
                // If a pawn double push, set the en passant square
                else if ((to ^ from) === 16) {
                    this.Position.EnPassSq = piece.Color === Color.White ? to + 8 : to - 8;
                    this.Position.Hash ^= this.Zobrist.EnPassant[this.Position.EnPassSq];
                }
            }
        }

        // update castling rights
        this.Position.Hash ^= this.Zobrist.Castle[this.Position.CastlingRights];
        this.Position.CastlingRights &= this.Position.CastlingSquaresMask[from] & this.Position.CastlingSquaresMask[to];
        this.Position.Hash ^= this.Zobrist.Castle[this.Position.CastlingRights];

        // Update the side to move
        this.Position.SideToMove ^= 1;
        this.Position.Hash ^= this.Zobrist.SideToMove;

        this.PositionHistory[this.PositionHistory.length] = this.Position.Hash;

        // Because the move generator generates pseudo-legal moves,
        // The move that was just made might have left the side-to-move's king in check
        // Make sure that hasn't happened
        return !this.IsSquareAttacked(this.GetLS1B(this.Position.PiecesBB[this.Position.SideToMove ^ 1][Pieces.King]), this.Position.SideToMove);
    }

    UnmakeMove(move: Move) {
        const state = this.stateCopy.pop() as State;

        this.Position.Ply--;

        this.PositionHistory.pop();

        // Replace current position properties with those retreived from the state
        this.Position.CastlingRights = state.CastlingRights;
        this.Position.EnPassSq = state.EnPassSq;
        this.Position.HalfMoves = state.HalfMoves;
        this.Position.Phase = state.Phase;

        // Flip the side to move
        this.Position.SideToMove ^= 1;

        const from = move & 0x3f;
        const to = (move & 0xfc0) >> 6;
        const moveType = (move & 0x3f80) >> 12;
        const piece = this.Position.Squares[to];

        if (moveType === MoveType.Castle) {
            this.UndoCastle(from, to);
        }
        else if (moveType === MoveType.Promotion) {
            this.RemovePiece(piece.Type, piece.Color, to);
            this.PlacePiece(Pieces.Pawn, piece.Color, from);

            if (state.Captured) {
                this.PlacePiece(state.Captured.Type, state.Captured.Color, to);
            }
        }
        else {
            this.MovePiece(piece, to, from);

            if (state.Captured) {
                let captureSquare = to;
                let captured = state.Captured;

                if (moveType === MoveType.EnPassant) {
                    captureSquare = piece.Color === Color.White ? to + 8 : to - 8;
                }

                this.PlacePiece(captured.Type, captured.Color, captureSquare);
            }
        }

        // Set hash to previous value
        this.Position.Hash = state.Hash;
        this.Position.PawnHash = state.PawnHash;
    }

    DoCastle(piece: Piece, from: Square, to: Square) {
        const kingSide = to > from;
        let kingTo = Square.g1 ^ (piece.Color * 56);
        let rookTo = Square.f1 ^ (piece.Color * 56);

        if (!kingSide) {
            kingTo = Square.c1 ^ (piece.Color * 56);
            rookTo = Square.d1 ^ (piece.Color * 56);
        }
        const rookFrom = to;

        // Remove the king and rook
        this.RemovePiece(Pieces.Rook, piece.Color, rookFrom);
        this.RemovePiece(piece.Type, piece.Color, from);

        // Place the king and rook on their squares
        this.PlacePiece(Pieces.Rook, piece.Color, rookTo);
        this.PlacePiece(piece.Type, piece.Color, kingTo);

        this.Position.Hash ^= this.Zobrist.Pieces[piece.Color][Pieces.Rook][rookFrom] ^ this.Zobrist.Pieces[piece.Color][Pieces.Rook][rookTo];
    }

    UndoCastle(from: Square, to: Square) {
        const color = this.Position.SideToMove;
        const kingSide = to > from;
        let kingTo = Square.g1 ^ (color * 56);
        let rookTo = Square.f1 ^ (color * 56);

        if (!kingSide) {
            kingTo = Square.c1 ^ (color * 56);
            rookTo = Square.d1 ^ (color * 56);
        }
        const rookFrom = to;

        this.RemovePiece(Pieces.Rook, color, rookTo);
        this.RemovePiece(Pieces.King, color, kingTo);
        this.PlacePiece(Pieces.Rook, color, rookFrom);

        // Move the king back
        this.PlacePiece(Pieces.King, color, from);
    }

    MakeNullMove() {
        this.stateCopy.push({
            CastlingRights: this.Position.CastlingRights,
            EnPassSq: this.Position.EnPassSq,
            Hash: this.Position.Hash,
            HalfMoves: this.Position.HalfMoves,
            PawnHash: this.Position.PawnHash,
            Phase: this.Position.Phase,
        });

        if (this.Position.EnPassSq !== Square.no_sq) {
            this.Position.Hash ^= this.Zobrist.EnPassant[this.Position.EnPassSq];
            this.Position.EnPassSq = Square.no_sq;
        }
        this.Position.HalfMoves = 0;
        this.Position.SideToMove ^= 1;
        this.Position.Hash ^= this.Zobrist.SideToMove;
        this.Position.Ply++;
    }

    UnmakeNullMove() {
        const state = this.stateCopy.pop() as State;

        this.Position.CastlingRights = state.CastlingRights;
        this.Position.EnPassSq = state.EnPassSq;
        this.Position.HalfMoves = state.HalfMoves;
        this.Position.SideToMove ^= 1;
        this.Position.Hash = state.Hash;
        this.Position.PawnHash = state.PawnHash;
        this.Position.Ply--;
        this.Position.Phase = state.Phase;
    }

    MovePiece(piece: Piece, from: Square, to: Square) {
        const moveBB = this.squareBB[from] | this.squareBB[to];
        this.Position.PiecesBB[piece.Color][piece.Type] ^= moveBB;
        this.Position.OccupanciesBB[piece.Color] ^= moveBB;
        delete this.Position.Squares[from];
        this.Position.Squares[to] = piece;
    }

    RemovePiece(piece: Pieces, color: Color, square: Square) {
        this.Position.PiecesBB[color][piece] = this.RemoveBit(this.Position.PiecesBB[color][piece], square);
        this.Position.OccupanciesBB[color] = this.RemoveBit(this.Position.OccupanciesBB[color], square);
        delete this.Position.Squares[square];
    }

    PlacePiece(piece: Pieces, color: Color, square: Square) {
        this.Position.PiecesBB[color][piece] = this.SetBit(this.Position.PiecesBB[color][piece], square);
        this.Position.OccupanciesBB[color] = this.SetBit(this.Position.OccupanciesBB[color], square);
        this.Position.Squares[square] = { Type: piece, Color: color };
    }

    PrettyPrintMove(move: Move) {
        const from = move & 0x3f;
        let to = (move & 0xfc0) >> 6;
        const type = (move & 0x3f80) >> 12;

        if (type === MoveType.Castle && !this.isChess960) {
            to = to > from ? to - 1 : to + 2;
        }

        let prettymove = `${Square[from]}${Square[to]}`;
        if (type === MoveType.Promotion) {
            const promotionType = move >> 14;
            if (promotionType === PromotionType.Knight) {
                prettymove += "n";
            }
            if (promotionType === PromotionType.Bishop) {
                prettymove += "b";
            }
            if (promotionType === PromotionType.Rook) {
                prettymove += "r";
            }
            if (promotionType === PromotionType.Queen) {
                prettymove += "q";
            }
        }
        return prettymove;
    }

    /***************************
     * 
     * Setup
     * 
     **************************/

    readonly rankMasks: bigint[] = [];
    readonly fileMasks: bigint[] = [];
    readonly isolatedMasks: bigint[] = [];
    readonly passedMasks: bigint[][] = Array(2).fill(0).map(() => Array(64).fill(0));
    private readonly betweenMasks: bigint[][] = Array(64).fill(0n).map(() => Array(64).fill(0n));
    readonly attackRays: bigint[][] = Array.from(Array(3), () => new Array(64).fill(0n));
    readonly squareBB: bigint[] = [];
    readonly distanceBetween: Square[][] = Array(64).fill(0n).map(() => Array(64).fill(0n));

    private readonly notAFile = 18374403900871474942n;
    private readonly notHFile = 9187201950435737471n;
    private readonly notHGFile = 4557430888798830399n;
    private readonly notABFile = 18229723555195321596n;

    Init() {
        const m1 = -1n;
        const a2a7 = 0x0001010101010100n;
        const b2g7 = 0x0040201008040200n;
        const h1b7 = 0x0002040810204080n;
        let btwn, line, rank, file;
        
        for (let square = Square.a8; square <= Square.h1; square++) {
            // Bitboard masks for single set square
            this.squareBB[square] = this.SetBit(0n, square);

            this.rankMasks[square] = 0xffn << (BigInt(square) & 56n);
            this.fileMasks[square] = 0x0101010101010101n << (BigInt(square) & 7n);
            this.isolatedMasks[square] = this.fileMasks[square] << 1n | this.fileMasks[square] >> 1n;

            /* * * * * * * * * * * * * * * * * * * *
             *
             * Pawn, knight, king attack masks
             *
             * * * * * * * * * * * * * * * * * * * */
            this.PawnAttacks[Color.White][square] = this.MaskPawnAttacks(Color.White, square);
            this.PawnAttacks[Color.Black][square] = this.MaskPawnAttacks(Color.Black, square);
            this.KnightAttacks[square] = this.MaskKnightAttacks(square);
            this.KingAttacks[square] = this.MaskKingAttacks(square);

            /* * * * * * * * * * * * * * * * * * * *
             *
             * Bishop attack masks
             *
             * * * * * * * * * * * * * * * * * * * */
            this.BishopMasks[square] = this.GenerateBishopMasks(square);
    
            let relevantBitsCount = this.CountBits(this.BishopMasks[square]);
            let occupancyIndicies = 1 << relevantBitsCount;
    
            for (let i = 0; i < occupancyIndicies; i++) {
                const occupancy = this.SetOccupancy(i, relevantBitsCount, this.BishopMasks[square]);
                const magicIndex = BigInt.asUintN(64, (occupancy * this.BishopMagicNumbers[square])) >> (64n - this.BishopRelevantBits[square])
                this.BishopAttacks[square][Number(magicIndex)] = this.GenerateBishopAttacksFly(square, occupancy);
            }

            /* * * * * * * * * * * * * * * * * * * *
             *
             * Rook attack masks
             *
             * * * * * * * * * * * * * * * * * * * */
            this.RookMasks[square] = this.GenerateRookMasks(square);
        
            relevantBitsCount = this.CountBits(this.RookMasks[square]);
            occupancyIndicies = 1 << relevantBitsCount;
    
            for (let i = 0; i < occupancyIndicies; i++) {
                const occupancy = this.SetOccupancy(i, relevantBitsCount, this.RookMasks[square]);
                const magicIndex = BigInt.asUintN(64, (occupancy * this.RookMagicNumbers[square])) >> (64n - this.RookRelevantBits[square])
                this.RookAttacks[square][Number(magicIndex)] = this.GenerateRookAttacksFly(square, occupancy);
            }

            /* * * * * * * * * * * * * * * * * * * * * * * * *
             *
             * Mask sliding piece attacks on an empty board
             *
             * * * * * * * * * * * * * * * * * * * * * * * * */
            this.attackRays[Pieces.Bishop - Pieces.Bishop][square] = this.GenerateBishopAttacks(0n, square);
            this.attackRays[Pieces.Queen - Pieces.Bishop][square] |= this.attackRays[Pieces.Bishop - Pieces.Bishop][square];
            this.attackRays[Pieces.Rook - Pieces.Bishop][square] = this.GenerateRookAttacks(0n, square);
            this.attackRays[Pieces.Queen - Pieces.Bishop][square] |= this.attackRays[Pieces.Rook - Pieces.Bishop][square];

            /* * * * * * * * * * * * *
             *
             * Passed pawn masks
             *
             * * * * * * * * * * * * */
            let mask = this.fileMasks[square] | ((this.fileMasks[square] & this.notAFile) >> 1n) | ((this.fileMasks[square] & this.notHFile) << 1n);
            this.passedMasks[Color.White][square] = mask;
            this.passedMasks[Color.Black][square ^ 56] = mask;

            /* * * * * * * * * * * * *
             *
             * Between and distance masks
             *
             * * * * * * * * * * * * */

            for (let sq2 = 0; sq2 < 64; sq2++) {
                const sq1Rank = square >> 3;
                const sq2Rank = sq2 >> 3;
                const sq1File = square & 7;
                const sq2File = sq2 & 7;

                this.distanceBetween[square][sq2] = Math.max(Math.abs(sq2Rank - sq1Rank), Math.abs(sq2File - sq1File));

                // From https://www.chessprogramming.org/Square_Attacked_By#Pure_Calculation
                btwn = (m1 << BigInt(square)) ^ (m1 << BigInt(sq2));
                file = (BigInt(sq2) & 7n) - (BigInt(square) & 7n);
                rank = ((BigInt(sq2) | 7n) - BigInt(square)) >> 3n ;
                line = ((file & 7n) - 1n) & a2a7;
                line += 2n * (((rank & 7n) - 1n) >> 58n);
                line += (((rank - file) & 15n) - 1n) & b2g7;
                line += (((rank + file) & 15n) - 1n) & h1b7;
                line *= btwn & -btwn;

                this.betweenMasks[square][sq2] = BigInt.asUintN(64, line & btwn);
            }
        }

        // Clear ranks behind squares in passed pawn masks
        for (let square = Square.a8; square <= Square.h1; square++) {
            for (let s = square; s <= Square.h1; s += 8) {
                this.passedMasks[Color.White][square] &= ~this.rankMasks[s];
            }

            for (let s = square; s >= Square.a8; s -= 8) {
                this.passedMasks[Color.Black][square ^ 56] &= ~this.rankMasks[s];
            }
        }
    }
    
    /**
     * Generate pawn attack masks
     */
    MaskPawnAttacks(side: Color, square: Square) {
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
    
        // Clamp the value to 64-bits, otherwise it might go larger
        return BigInt.asUintN(64, attacks);;
    }
    
    /**
     * Generate knight attack masks
     * @param square Knight square to generate the attacks from
     */
    MaskKnightAttacks(square: Square) {
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
    
        // Clamp the value to 64-bits, otherwise it might go larger
        return BigInt.asUintN(64, attacks);
    }
    
    GenerateBishopMasks(square: Square) {
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
    
    GenerateBishopAttacksFly(square: Square, block: bigint) {
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
    
    GenerateRookMasks(square: Square) {
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
    
    GenerateRookAttacksFly(square: Square, block: bigint) {
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
    
    /**
     * Generate king attack masks
     * @param square King square to generate attacks from
     */
    MaskKingAttacks(square: Square) {
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
    
        // Clamp the value to 64-bits, otherwise it might go larger
        return BigInt.asUintN(64, attacks);
    }
    
    SetOccupancy(index: number, bitsInMask: number, attackMask: bigint) {    
        let occupancy = 0n;
    
        // range of bits within the attack mask
        for (let count = 0; count < bitsInMask; count++) {
            const square = this.GetLS1B(attackMask);
            attackMask = this.RemoveBit(attackMask, square);
            if (index & (1 << count)) {
                occupancy |= (1n << this.SquareBigInt[square]);
            }
        }
    
        return BigInt.asUintN(64, occupancy);
    }

    /***************************
     * 
     * Hashing
     * 
     **************************/

    private PRNG_SEED = 1n;

    private readonly Zobrist: Zobrist = {
        Pieces: Array.from(Array(2), () => Array.from(Array(6), () => new Array(64))),
        EnPassant: [],
        Castle: [],
        SideToMove: 0n,
    }

    /**
     * Generates a random 64-bit number
     * https://github.com/official-stockfish/Stockfish/blob/master/src/misc.h#L171
     */
    Random64() {
        let seed = this.PRNG_SEED;

        seed ^= seed >> 12n;
        seed ^= seed << 25n;
        seed ^= seed >> 27n;

        this.PRNG_SEED = seed;

        // Must clamp the value at 64-bits, otherwise it will go larger
        return BigInt.asUintN(64, seed * 2685821657736338717n);
    }

    InitHashes() {
        // Init piece keys
        for (let piece = Pieces.Pawn; piece <= Pieces.King; piece++) {
            for (let square = Square.a8; square <= Square.h1; square++) {
                this.Zobrist.Pieces[Color.White][piece][square] = this.Random64();
                this.Zobrist.Pieces[Color.Black][piece][square] = this.Random64();
            }
        }

        // Init en passant square keys
        for (let square = Square.a8; square <= Square.h1; square++) {
            this.Zobrist.EnPassant[square] = this.Random64();
        }

        // Init castling keys
        for (let i = 0; i < 16; i++) {
            this.Zobrist.Castle[i] = this.Random64();
        }

        // Init side to move key
        this.Zobrist.SideToMove = this.Random64();
    }

    /**
     * Generate hashes for the current position
     */
    GenerateHashes() {
        let hash = 0n;
        let pawnHash = 0n;

        // Add the hashes of individual pieces
        for (let square = Square.a8; square <= Square.h1; square++) {
            const piece = this.Position.Squares[square];

            if (piece) {
                hash ^= this.Zobrist.Pieces[piece.Color][piece.Type][square];

                if (piece.Type === Pieces.Pawn) {
                    pawnHash ^= this.Zobrist.Pieces[piece.Color][Pieces.Pawn][square];
                }
            }
        }

        // Add the en passant hash
        if (this.Position.EnPassSq !== Square.no_sq) {
            hash ^= this.Zobrist.EnPassant[this.Position.EnPassSq];
        }

        // Add the castling hash
        hash ^= this.Zobrist.Castle[this.Position.CastlingRights];

        // Add the side to move hash
        if (this.Position.SideToMove === Color.Black) {
            hash ^= this.Zobrist.SideToMove;
        }

        return { hash, pawnHash };
    }

    /***************************
     * 
     * Transposition Tables
     * 
     **************************/

    private readonly HashNoMove = 50000;
    private readonly TranspositionTables: TTable = {
        Entries: [],
        Size: 0n,
    }
    private readonly PawnHashTable: PawnHashTable = {
        Entries: [],
        Size: 0n,
    }

    /**
     * Initialize the hash table size
     * @param size Hash table size in MB
     */
    SetTransTableSize(size = 32) {
        this.TranspositionTables.Size = BigInt((size * 1024 * 1024) / 16); // sets the size in bytes

        this.TranspositionTables.Entries.length = 0;

        this.PawnHashTable.Size = BigInt((1 * 1024 * 1024) / 16); // 1 MB
        this.PawnHashTable.Entries.length = 0;
    }

    /**
     * Stores an entry in the transposition table
     * @param hash 
     * @param depth 
     * @param flag 
     * @param score 
     * @param move 
     * @param ply 
     */
    WriteTT(depth: number, flag: HashFlag, score: number, move: Move) {
        const index = Number(this.Position.Hash % this.TranspositionTables.Size);

        if (score > this.Checkmate) {
            score += this.Position.Ply;
        }

        if (score < -this.Checkmate) {
            score -= this.Position.Ply;
        }

        this.TranspositionTables.Entries[index] = {
            BestMove: move,
            Depth: depth,
            Flag: flag,
            Hash: this.Position.Hash,
            Score: score,
        };
    }

    /**
     * 
     * @param hash 
     * @param depth 
     * @param ply 
     * @param alpha 
     * @param beta 
     * @returns 
     */
    ProbeTT(depth: number, alpha: number, beta: number) {
        const entry = this.TranspositionTables.Entries[Number(this.Position.Hash % this.TranspositionTables.Size)];

        let newScore = this.HashNoMove;

        if (!entry || entry.Hash !== this.Position.Hash) {
            return { ttScore: newScore, ttMove: 0 };
        }

        if (entry.Depth >= depth) {
            let score = entry.Score;

            if (score > this.Checkmate) {
                score -= this.Position.Ply;
            }

            if (score < -this.Checkmate) {
                score += this.Position.Ply;
            }

            if (entry.Flag === HashFlag.Exact) {
                newScore = score;
            }

            if (entry.Flag === HashFlag.Alpha && score <= alpha) {
                newScore = score;
            }

            if (entry.Flag === HashFlag.Beta && score >= beta) {
                newScore = score;
            }
        }

        return { ttScore: newScore, ttMove: entry.BestMove };
    }

    /***************************
     * 
     * Tables
     * 
     **************************/

    readonly PawnAttacks: bigint[][] = Array.from(Array(2), () => new Array(64));
    readonly KnightAttacks: bigint[] = [];
    readonly KingAttacks: bigint[] = [];
    private readonly BishopMasks: bigint[] = Array(64);
    private readonly BishopAttacks: bigint[][] = Array.from(Array(64), () => new Array(512));
    private readonly RookMasks: bigint[] = Array(64);
    private readonly RookAttacks: bigint[][] = Array.from(Array(64), () => new Array(4096));
    
    private readonly BishopMagicNumbers = [ 0x40040844404084n, 0x2004208a004208n, 0x10190041080202n, 0x108060845042010n, 0x581104180800210n, 0x2112080446200010n, 0x1080820820060210n,
        0x3c0808410220200n, 0x4050404440404n, 0x21001420088n, 0x24d0080801082102n, 0x1020a0a020400n, 0x40308200402n, 0x4011002100800n, 0x401484104104005n, 0x801010402020200n,
        0x400210c3880100n, 0x404022024108200n, 0x810018200204102n, 0x4002801a02003n, 0x85040820080400n, 0x810102c808880400n, 0xe900410884800n, 0x8002020480840102n, 0x220200865090201n,
        0x2010100a02021202n, 0x152048408022401n, 0x20080002081110n, 0x4001001021004000n, 0x800040400a011002n, 0xe4004081011002n, 0x1c004001012080n, 0x8004200962a00220n,
        0x8422100208500202n, 0x2000402200300c08n, 0x8646020080080080n, 0x80020a0200100808n, 0x2010004880111000n, 0x623000a080011400n, 0x42008c0340209202n, 0x209188240001000n,
        0x400408a884001800n, 0x110400a6080400n, 0x1840060a44020800n, 0x90080104000041n, 0x201011000808101n, 0x1a2208080504f080n, 0x8012020600211212n, 0x500861011240000n,
        0x180806108200800n, 0x4000020e01040044n, 0x300000261044000an, 0x802241102020002n, 0x20906061210001n, 0x5a84841004010310n, 0x4010801011c04n, 0xa010109502200n, 0x4a02012000n,
        0x500201010098b028n, 0x8040002811040900n, 0x28000010020204n, 0x6000020202d0240n, 0x8918844842082200n, 0x4010011029020020n
    ];
    
    private readonly RookMagicNumbers = [ 0x8a80104000800020n, 0x140002000100040n, 0x2801880a0017001n, 0x100081001000420n, 0x200020010080420n, 0x3001c0002010008n, 0x8480008002000100n,
        0x2080088004402900n, 0x800098204000n, 0x2024401000200040n, 0x100802000801000n, 0x120800800801000n, 0x208808088000400n, 0x2802200800400n, 0x2200800100020080n, 0x801000060821100n,
        0x80044006422000n, 0x100808020004000n, 0x12108a0010204200n, 0x140848010000802n, 0x481828014002800n, 0x8094004002004100n, 0x4010040010010802n, 0x20008806104n, 0x100400080208000n,
        0x2040002120081000n, 0x21200680100081n, 0x20100080080080n, 0x2000a00200410n, 0x20080800400n, 0x80088400100102n, 0x80004600042881n, 0x4040008040800020n, 0x440003000200801n,
        0x4200011004500n, 0x188020010100100n, 0x14800401802800n, 0x2080040080800200n, 0x124080204001001n, 0x200046502000484n, 0x480400080088020n, 0x1000422010034000n, 0x30200100110040n,
        0x100021010009n, 0x2002080100110004n, 0x202008004008002n, 0x20020004010100n, 0x2048440040820001n, 0x101002200408200n, 0x40802000401080n, 0x4008142004410100n, 0x2060820c0120200n,
        0x1001004080100n, 0x20c020080040080n, 0x2935610830022400n, 0x44440041009200n, 0x280001040802101n, 0x2100190040002085n, 0x80c0084100102001n, 0x4024081001000421n,
        0x20030a0244872n, 0x12001008414402n, 0x2006104900a0804n, 0x1004081002402n
    ];
    
    private readonly BishopRelevantBits = [
        6n, 5n, 5n, 5n, 5n, 5n, 5n, 6n, 
        5n, 5n, 5n, 5n, 5n, 5n, 5n, 5n, 
        5n, 5n, 7n, 7n, 7n, 7n, 5n, 5n, 
        5n, 5n, 7n, 9n, 9n, 7n, 5n, 5n, 
        5n, 5n, 7n, 9n, 9n, 7n, 5n, 5n, 
        5n, 5n, 7n, 7n, 7n, 7n, 5n, 5n, 
        5n, 5n, 5n, 5n, 5n, 5n, 5n, 5n, 
        6n, 5n, 5n, 5n, 5n, 5n, 5n, 6n,
    ];
    
    private readonly RookRelevantBits = [
        12n, 11n, 11n, 11n, 11n, 11n, 11n, 12n, 
        11n, 10n, 10n, 10n, 10n, 10n, 10n, 11n, 
        11n, 10n, 10n, 10n, 10n, 10n, 10n, 11n, 
        11n, 10n, 10n, 10n, 10n, 10n, 10n, 11n, 
        11n, 10n, 10n, 10n, 10n, 10n, 10n, 11n, 
        11n, 10n, 10n, 10n, 10n, 10n, 10n, 11n, 
        11n, 10n, 10n, 10n, 10n, 10n, 10n, 11n, 
        12n, 11n, 11n, 11n, 11n, 11n, 11n, 12n,
    ];

    /***************************
     * 
     * Evaluation
     * 
     **************************/

    readonly MGPieceValue = [80, 321, 328, 447, 912, 15000];
    readonly EGPieceValue = [102, 256, 271, 472, 911, 15000];

    readonly PST = [
        // opening/middle game values
        [
            // pawn
            [
                  0,   0,   0,   0,   0,  0,  0,   0,
                 24,  24,  16,  16,   9, 10,  7,   6,
                  0,  11,  12,   8,  13, 21, 10,  -6,
                -23,   4,  -5,  12,  16,  3,  5, -26,
                -28, -13,  -6,   3,   6,  0,  0, -30,
                -24, -13,  -9, -10,   0, -2, 21, -15,
                -28,  -8, -25, -17, -12, 11, 28, -21,
                  0,   0,   0,   0,   0,  0,  0,   0,
            ],
            
            // knight
            [
                -11,  -2,  -1,  -1,  1, -4, -1, -5,
                 -9,  -4,   5,   4,  2,  4,  0, -2,
                 -6,   9,   3,  11, 14, 13, 12,  5,
                  2,   0,  -1,  18,  6, 20,  9, 18,
                  0,  -1,  -3, -10,  3, -3,  8,  8,
                -10, -14, -10,  -5,  6, -2,  4, -6,
                 -5,  -5, -19,  -1, -3,  0, -1,  4,
                 -5,  -2,  -6,  -5,  0,  3, -2, -3,
            ],

            // bishop
            [
                 -4,  0, -4, -2, -1, -1, -1,  -1,
                 -8, -3, -6, -4,  2,  1, -2, -13,
                -10,  0,  3,  5,  4, 11,  5,   4,
                 -8, -5,  2, 16,  7, 10, -1,  -3,
                  0,  3, -4,  7, 13, -9, -5,   8,
                 -1, 11,  4, -2, -1,  5,  7,   1,
                  6,  7,  8, -4,  0,  9, 22,  -1,
                -11,  1, -1, -4,  2, -5, -3,  -6,
            ],

            // rook
            [
                  4,   4,   3,  6,  6,  2,   3,   4,
                  3,   3,  10,  9,  9,  8,   4,   5,
                 -4,   6,   2,  8,  1,  7,   6,   2,
                 -8,  -6,   1, -1,  3,  8,  -1,   1,
                -17,  -9,  -9, -6, -5, -7,   1, -12,
                -22, -14, -12, -9, -6, -4,  -2, -12,
                -23, -11, -12, -5, -2,  1,  -1, -30,
                 -3,  -7,  -4,  4,  9, 12, -20,  -3,
            ],

            // queen
            [
                 -5,   2,  4,  2,  6,   3,  3,  5,
                -13, -23,  2,  6,  4,  10,  5, 12,
                 -7,  -6, -2,  3, 12,  16, 17, 22,
                -10, -11, -5, -5,  7,   6,  9, 14,
                 -5, -13, -9, -8, -1,   3,  8,  5,
                 -9,  -5, -2, -5, -5,   5,  2,  4,
                -14,  -8,  3,  7,  8,   6, -7,  2,
                 -6, -10, -4, 13, -3, -13, -5, -6,
            ],

            // king
            [
                 -1,  0,  0,   0,   0,   0,  1,   0,
                  0,  2,  1,   2,   2,   2,  1,   0,
                  1,  3,  3,   3,   2,   6,  5,   1,
                  0,  2,  4,   3,   3,   4,  3,  -3,
                 -3,  1,  3,   1,   1,   0, -3,  -9,
                 -2,  0,  1,  -3,  -2,  -6, -2, -11,
                 -2, -1, -3, -25, -25, -13, 13,  14,
                -14, 14, 10, -29,   7, -27, 30,   9,
            ]
        ],
        // end game values
        [
            // pawn
            [
                  0,  0,   0,   0,   0,   0,   0,   0,
                 50, 47,  35,  28,  25,  25,  31,  39,
                 35, 32,  22,   5,   2,   9,  22,  21,
                  8,  0, -11, -27, -27, -21,  -8, -10,
                 -4, -4, -19, -26, -26, -24, -17, -19,
                -14, -9, -19, -17, -18, -19, -24, -26,
                 -7, -9,  -5, -11,  -8, -18, -22, -26,
                  0,  0,   0,   0,   0,   0,   0,   0,
            ],

            // knight
            [
                -10,  -3,   0, -3,  1,  -6, -4, -7,
                 -5,   3,  -3,  6,  1,  -4, -2, -5,
                 -5,  -2,   2,  1,  1,   1,  1, -3,
                  1,   7,   7,  5,  7,   5,  8,  5,
                 -1,   0,   2,  9,  3,   3,  6, -1,
                 -3,  -3, -11,  2, -4, -17, -4, -2,
                 -3,  -2,  -7, -5,  1,  -7,  0, -2,
                 -5, -13,  -4,  0, -2,  -4, -9, -4,
            ],

            // bishop
            [
                -4,  -2, -4, -2, -1, -2, -2, -3,
                -3,  -1,  0, -7,  0, -3, -4, -7,
                 1,  -1,  0,  0,  0,  3,  1,  2,
                -2,   4,  4, 11,  5,  4, -1,  1,
                -1,  -2,  7,  9,  2,  3, -3, -1,
                 1,   0,  2,  5,  6, -3, -1,  1,
                -3, -11, -7, -1,  1, -5, -7, -4,
                -9,  -1, -6, -2, -2, -4, -4, -5,
            ],

            // rook
            [
                 11,  9, 11, 13,  11,   7,  9,   7,
                 12, 13, 14, 13,   9,   7,  8,   8,
                  5,  7,  5,  5,   0,   1,  2,  -2,
                 -2,  0,  5, -2,  -1,   2, -2,   0,
                 -1, -2,  1, -4,  -6,  -8, -6,  -8,
                 -8, -5, -9, -7, -11, -13, -6, -10,
                 -7, -7, -5, -6,  -9,  -9, -7,  -8,
                -10, -3,  0, -7, -12, -13, -3, -21,
            ],

            // queen
            [
                -5,  2,   4,   3,  6,  4,  2,  4,
                -8, -5,   4,   7,  7,  7,  3,  4,
                -5, -3,   0,   7, 11, 11,  7,  9,
                -6, -1,   1,   8, 12,  6,  9,  8,
                -7, -2,   3,  13,  8,  6,  6,  4,
                -5, -8,   1,  -3,  0,  1,  3,  2,
                -7, -7, -14, -11, -9, -5, -6, -1,
                -6, -8,  -7, -17, -5, -9, -4, -5,
            ],

            // king
            [
                 -3,  -2,  -2,  -1,   0,   1,   2,  -2,
                 -2,   6,   6,   6,   6,  12,   7,   0,
                  1,  12,  14,  12,  11,  23,  21,   3,
                 -4,   9,  18,  23,  17,  21,  14,  -5,
                -11,  -4,  14,  20,  19,  15,   2, -18,
                -13,  -5,   7,  14,  15,   9,   0, -16,
                -16,  -9,   2,   6,  10,   3, -11, -25,
                -22, -25, -16, -15, -25, -12, -35, -44,
            ]
        ]
    ];

    private readonly PhaseValues = [0, 1, 1, 2, 4, 0];
    readonly MGdoubledPenalty = 3;
    readonly EGdoubledPenalty = 10;
    readonly MGisolatedPenalty = 16;
    readonly EGisolatedPenalty = 4;
    readonly MGfileSemiOpenScore = 17;
    readonly MGfileOpenScore = 34;
    readonly MGpassedBonus = [0, 1, -4, -7, 11, 37, 55, 0];
    readonly EGpassedBonus = [0, -9, -3, 17, 35, 53, 67, 0];
    readonly MGrookQueenFileBonus = 11;
    readonly MGKnightOutpostBonus = 23;
    readonly EGKnightOutpostBonus = 14;
    readonly MGBishopOutpostBonus = 21;
    readonly EGBishopOutpostBonus = 0;
    readonly MGCorneredBishopPenalty = 25;
    readonly EGCorneredBishopPenalty = 40;
    readonly MGKingSemiOpenPenalty = 6;
    readonly MGBishopPairBonus = 25;
    readonly EGBishopPairBonus = 30;

    readonly MGKnightMobility = [0,0,-23,-11,-9,0,15,0,24];
    readonly MGBishopMobility = [0,-2,-28,-15,-8,0,5,13,17,18,21,23,11,8];
    readonly MGRookMobility = [0,0,-31,-25,-22,-17,-14,-12,-11,-8,-1,2,10,17,16];
    readonly MGQueenMobility = [0,0,0,0,-1,-5,-10,-11,-13,-9,-8,-8,-5,-3,-2,0,4,5,6,6,9,11,12,12,10,7,2,2];
    readonly EGKnightMobility = [0,0,-25,-32,-18,0,-6,0,11];
    readonly EGBishopMobility = [0,-1,-28,-29,-21,-16,-6,-1,6,8,11,10,11,10];
    readonly EGRookMobility = [0,0,-26,-29,-19,-13,-6,-2,4,6,7,10,9,11,8];
    readonly EGQueenMobility = [0,0,0,0,0,-1,-2,-3,-7,-8,-13,-13,-16,-15,-8,-4,-3,4,9,9,15,11,16,16,11,9,3,2];

    readonly PhaseTotal = (this.PhaseValues[Pieces.Knight] * 4) + (this.PhaseValues[Pieces.Bishop] * 4) + (this.PhaseValues[Pieces.Rook] * 4) + (this.PhaseValues[Pieces.Queen] * 2);

    readonly KingSquares = [0, 0];

    Evaluate() {
        let mgScores = [0, 0];
        let egScores = [0, 0];
        let phase = this.Position.Phase;
        const bishopCount = [0, 0];
        const allOccupancies = this.Position.OccupanciesBB[Color.White] | this.Position.OccupanciesBB[Color.Black];

        let board = allOccupancies & ~(this.Position.PiecesBB[Color.White][Pieces.Pawn] | this.Position.PiecesBB[Color.Black][Pieces.Pawn]);

        const pawnHash = this.PawnHashTable.Entries[Number(this.Position.PawnHash % this.PawnHashTable.Size)];

        if (pawnHash && pawnHash.hash === this.Position.PawnHash) {
            mgScores[Color.White] += pawnHash.wScore.mg;
            egScores[Color.White] += pawnHash.wScore.eg;
            mgScores[Color.Black] += pawnHash.bScore.mg;
            egScores[Color.Black] += pawnHash.bScore.eg;
        }
        else {
            const pawnEval = this.EvaluatePawns();

            mgScores[Color.White] += pawnEval.mgScores[Color.White];
            egScores[Color.White] += pawnEval.egScores[Color.White];
            mgScores[Color.Black] += pawnEval.mgScores[Color.Black];
            egScores[Color.Black] += pawnEval.egScores[Color.Black];

            this.PawnHashTable.Entries[Number(this.Position.PawnHash % this.PawnHashTable.Size)] = {
                hash: this.Position.PawnHash,
                wScore: {
                    mg: pawnEval.mgScores[Color.White],
                    eg: pawnEval.egScores[Color.White],
                },
                bScore: {
                    mg: pawnEval.mgScores[Color.Black],
                    eg: pawnEval.egScores[Color.Black],
                },
            }
        }

        const outpostRanks = [this.rankMasks[Square.a4] | this.rankMasks[Square.a5] | this.rankMasks[Square.a6], this.rankMasks[Square.a3] | this.rankMasks[Square.a4] | this.rankMasks[Square.a5]];

        while (board) {
            let square = this.GetLS1B(board);
            let actualSquare = square;
            board = this.RemoveBit(board, square);
            const piece = this.Position.Squares[square];

            // Because the PST are from white's perspective, we have to flip the square if the piece is black's
            if (piece.Color === Color.Black) {
                square ^= 56;
            }

            // PST scores
            mgScores[piece.Color] += this.PST[0][piece.Type][square] + this.MGPieceValue[piece.Type];
            egScores[piece.Color] += this.PST[1][piece.Type][square] + this.EGPieceValue[piece.Type];

            switch (piece.Type) {
                case Pieces.Knight:{
                    // Outposts
                    if ((outpostRanks[piece.Color] & this.squareBB[actualSquare])
                        && (this.passedMasks[piece.Color][actualSquare] & ~this.fileMasks[actualSquare] & this.Position.PiecesBB[piece.Color ^ 1][Pieces.Pawn]) === 0n
                        && this.PawnAttacks[piece.Color ^ 1][actualSquare] & this.Position.PiecesBB[piece.Color][Pieces.Pawn]) {
                        mgScores[piece.Color] += this.MGKnightOutpostBonus;
                        egScores[piece.Color] += this.EGKnightOutpostBonus;
                    }

                    const attacks = this.KnightAttacks[actualSquare];
                    const mobility = this.CountBits(attacks);

                    mgScores[piece.Color] += this.MGKnightMobility[mobility];
                    egScores[piece.Color] += this.EGKnightMobility[mobility];

                    break;
                }
                case Pieces.Bishop: {
                    bishopCount[piece.Color]++;

                    const attacks = this.GenerateBishopAttacks(allOccupancies, actualSquare);
                    const mobility = this.CountBits(attacks);

                    mgScores[piece.Color] += this.MGBishopMobility[mobility];
                    egScores[piece.Color] += this.EGBishopMobility[mobility];

                    // Outposts
                    if ((outpostRanks[piece.Color] & this.squareBB[actualSquare])
                        && (this.passedMasks[piece.Color][actualSquare] & ~this.fileMasks[actualSquare] & this.Position.PiecesBB[piece.Color ^ 1][Pieces.Pawn]) === 0n
                        && this.PawnAttacks[piece.Color ^ 1][actualSquare] & this.Position.PiecesBB[piece.Color][Pieces.Pawn]) {
                        mgScores[piece.Color] += this.MGBishopOutpostBonus;
                        egScores[piece.Color] += this.EGBishopOutpostBonus;
                    }

                    // An idea from Stockfish - If the bishop is on a corner square and blocked diagonally by a friendly pawn it deserves a penalty
                    if (this.isChess960 && (square === Square.a1 || square === Square.h1)) {
                        let blockingPawn = (square & 7) === 0 ? (1n << 49n) : (1n << 54n);

                        if (piece.Color === Color.Black) {
                            blockingPawn = blockingPawn >> 40n;
                        }

                        if ((blockingPawn & this.Position.PiecesBB[piece.Color][Pieces.Pawn]) !== 0n) {
                            mgScores[piece.Color] -= this.MGCorneredBishopPenalty;
                            egScores[piece.Color] -= this.EGCorneredBishopPenalty;
                        }
                    }

                    break;
                }
                case Pieces.Rook: {
                    const attacks = this.GenerateRookAttacks(allOccupancies, actualSquare);
                    const mobility = this.CountBits(attacks);

                    mgScores[piece.Color] += this.MGRookMobility[mobility];
                    egScores[piece.Color] += this.EGRookMobility[mobility];

                    // Semi-open file
                    if ((this.Position.PiecesBB[piece.Color][Pieces.Pawn] & this.fileMasks[square]) === 0n) {
                        // If the file also doesn't have enemy pawns, it's an open file
                        if ((this.Position.PiecesBB[piece.Color ^ 1][Pieces.Pawn] & this.fileMasks[square]) === 0n) {
                            mgScores[piece.Color] += this.MGfileOpenScore;
                        }
                        else {
                            mgScores[piece.Color] += this.MGfileSemiOpenScore;
                        }
                    }

                    // Bonus if rook is on the same file as opponent's queen
                    if (this.fileMasks[square] & this.Position.PiecesBB[piece.Color ^ 1][Pieces.Queen]) {
                        mgScores[piece.Color] += this.MGrookQueenFileBonus;
                    }
                    break;
                }
                case Pieces.Queen: {
                    const attacks = this.GenerateBishopAttacks(allOccupancies, actualSquare) | this.GenerateRookAttacks(allOccupancies, actualSquare);
                    const mobility = this.CountBits(attacks);

                    mgScores[piece.Color] += this.MGQueenMobility[mobility];
                    egScores[piece.Color] += this.EGQueenMobility[mobility];

                    break;
                }
                case Pieces.King: {
                    if (actualSquare !== this.KingSquares[piece.Color]) {
                        this.KingSquares[piece.Color] = actualSquare;
                        const file = Math.min(Math.max(square & 7, 1), 6);
                        let j = 1;
    
                        for (let i = file - 1; i <= file + 1; i++) {
                            if ((this.fileMasks[i] & this.Position.PiecesBB[piece.Color][Pieces.Pawn]) === 0n) {
                                mgScores[piece.Color] -= this.MGKingSemiOpenPenalty * j * j;
                                j++;
                            }
                        }
                    }

                    break;
                }
            }
        }

        if (bishopCount[Color.White] >= 2) {
            mgScores[Color.White] += this.MGBishopPairBonus;
            egScores[Color.White] += this.EGBishopPairBonus;
        }
        if (bishopCount[Color.Black] >= 2) {
            mgScores[Color.Black] += this.MGBishopPairBonus;
            egScores[Color.Black] += this.EGBishopPairBonus;
        }

        phase = ((phase * 256 + (this.PhaseTotal / 2)) / this.PhaseTotal) | 0;

        const mgScore = mgScores[this.Position.SideToMove] - mgScores[this.Position.SideToMove ^ 1];
        const egScore = egScores[this.Position.SideToMove] - egScores[this.Position.SideToMove ^ 1];

        return (((mgScore * (256 - phase)) + (egScore * phase)) / 256 | 0);
    }

    EvaluatePawns() {
        let mgScores = [0, 0];
        let egScores = [0, 0];
        let board = this.Position.PiecesBB[Color.White][Pieces.Pawn] | this.Position.PiecesBB[Color.Black][Pieces.Pawn];

        while (board) {
            let square = this.GetLS1B(board);
            board = this.RemoveBit(board, square);
            const piece = this.Position.Squares[square];

            if (piece.Color === Color.Black) {
                square ^= 56;
            }

            mgScores[piece.Color] += this.PST[0][Pieces.Pawn][square] + this.MGPieceValue[Pieces.Pawn];
            egScores[piece.Color] += this.PST[1][Pieces.Pawn][square] + this.EGPieceValue[Pieces.Pawn];

            // doubled pawns
            const pawnsOnFile = this.Position.PiecesBB[piece.Color][Pieces.Pawn] & this.fileMasks[square];
            if ((pawnsOnFile & (pawnsOnFile - 1n)) !== 0n) {
                mgScores[piece.Color] -= this.MGdoubledPenalty;
                egScores[piece.Color] -= this.EGdoubledPenalty;
            }

            // isolated pawns
            if ((this.Position.PiecesBB[piece.Color][Pieces.Pawn] & this.isolatedMasks[square]) === 0n) {
                mgScores[piece.Color] -= this.MGisolatedPenalty;
                egScores[piece.Color] -= this.EGisolatedPenalty;
            }

            // passed pawns
            if ((this.passedMasks[piece.Color][square] & this.Position.PiecesBB[piece.Color ^ 1][Pieces.Pawn]) === 0n) {
                // https://www.chessprogramming.org/Ranks
                const rank = 7 - (square >> 3);
                mgScores[piece.Color] += this.MGpassedBonus[rank];
                egScores[piece.Color] += this.EGpassedBonus[rank];
            }
        }

        return { mgScores, egScores };
    }

    /***************************
     * 
     * Search
     * 
     **************************/

    private readonly MaxPly = 100;
    private readonly Checkmate = 15000;
    private readonly Inf = 20000;

    private readonly search: Search = {
        nodes: 0,
        killers: Array(2).fill(0).map(() => Array(this.MaxPly).fill(0)),
        history: Array(2).fill(0).map(() => Array(64).fill(0).map(() => Array(64).fill(0))), // 2 64x64 arrays
    }

    /**
     * The main search function
     */
    Search(targetDepth: number) {
        this.search.nodes = 0;
        let pv = { moves: [] }; // object to make use of pass-by-reference (because no pointers in JS)
        let bestmove: string = "";

        this.StartTimer();

        // starting bounds
        let alpha = -this.Inf;
        let beta = this.Inf;
        let score = -this.Inf;

        this.AgeHistory();

        // start the timer
        const start = Date.now();

        // Returns a cp score or checkmate score if getting checkmated
        const getScore = () => {
            if (score < -this.Checkmate) {
                return `mate ${(-this.Inf - score) / 2}`;
            }

            if (score > this.Checkmate) {
                return `mate ${((this.Inf - score + 1) / 2)}`;
            }

            return `cp ${score}`;
        }

        // Need to set this to 0 for the search
        this.Position.Ply = 0;

        // The main iterative deepening search loop
        for (let depth = 1; depth <= targetDepth; depth++) {
            pv.moves.length = 0;

            let margin = depth >= 4 ? 25 : this.Inf;

            // Aspiration window
            while (!this.Timer.stop) {
                alpha = Math.max(score - margin, -this.Inf);
                beta = Math.min(score + margin, this.Inf);

                score = this.Negamax(depth, alpha, beta, pv);

                // if the score is within the window, we don't need to widen and research
                if (score > alpha && score < beta)
                    break;

                margin *= 3;
            }

            const end = Date.now();

            if (this.Timer.stop) {
                break;
            }

            bestmove = this.PrettyPrintMove(pv.moves[0]);

            console.log(`info depth ${depth} score ${getScore()} nodes ${this.search.nodes} time ${end - start} pv ${pv.moves.map(x => this.PrettyPrintMove(x)).join(" ")}`);
        }

        console.log(`bestmove ${bestmove}`);
        return bestmove;
    }

    Negamax(depth: number, alpha: number, beta: number, pvMoves: PVLine, nullMoveAllowed = true) {
        let bestScore = -this.Inf;
        let flag = HashFlag.Alpha;
        let legalMoves = 0;
        let canFutilityPrune = false;
        const isPVNode = beta - alpha > 1;
        const inCheck = this.IsSquareAttacked(this.GetLS1B(this.Position.PiecesBB[this.Position.SideToMove][Pieces.King]), this.Position.SideToMove ^ 1);
        const childPVMoves: PVLine = { moves: [] };

        this.search.nodes++;

        // Check whether search time is up every 1000 nodes
        if (this.search.nodes % 1000 === 0) {
            this.CheckTime();
        }

        if (this.Timer.stop) {
            return 0;
        }

        // Check extension - search one more ply if side to move is in check
        if (inCheck) {
            depth += 1;
        }

        if (depth <= 0) {
            return this.Quiescence(alpha, beta, depth);
        }

        // Check for 3-fold or 50 moves draw
        if (this.Position.Ply > 0 && (this.IsRepetition() || this.Position.HalfMoves >= 100)) {
            return 0;
        }

        // Check the transposition table for matching position and score
        const { ttScore, ttMove } = this.ProbeTT(depth, alpha, beta);
        if (ttScore !== this.HashNoMove && this.Position.Ply !== 0) {
            return ttScore;
        }

        let bestMove = ttMove;

        if (!inCheck && !isPVNode) {
            const staticEval = this.Evaluate();

            // Reverse futility pruning (static null move pruning)
            if (staticEval - (90 * depth) >= beta) {
                return staticEval - (90 * depth);
            }

            // Futility pruning
            if (depth <= 2 && staticEval + (90 * depth) <= alpha) {
                canFutilityPrune = true;
            }

            // Null move pruning
            if (nullMoveAllowed && depth >= 2 && staticEval >= beta) {
                this.MakeNullMove();

                const R = 3 + Math.floor(depth / 5);
                let score = -this.Negamax(depth - 1 - R, -beta, 1 - beta, childPVMoves, false);

                this.UnmakeNullMove();

                childPVMoves.moves.length = 0;

                if (score >= beta) {
                    return beta;
                }
            }
        }

        let moves = inCheck ? this.GenerateEvasions() : this.GenerateMoves();
        moves = this.SortMoves(moves, ttMove);

        for (let i = 0; i < moves.length; i++) {
            const move = moves[i];

            const capture = this.MoveIsCapture(move);
            const promotion = this.MoveIsPromotion(move);

            // Late move pruning
            if (!capture && !promotion && depth <= 2 && legalMoves > 5 * depth) {
                continue;
            }

            // Futility pruning
            if (canFutilityPrune && legalMoves > 1 && !capture && !promotion) {
                continue;
            }

            // Skip bad captures
            if (!inCheck && capture && this.See(move) < -300 * depth) {
                continue;
            }

            if (!this.MakeMove(move)) {
                this.UnmakeMove(move);
                continue;
            }

            legalMoves++;

            let score = 0;
            let R = Math.log(depth * legalMoves ** 2) * 0.45;

            if (legalMoves > 1) {
                // Start with a reduced search
                score = -this.Negamax(depth - R - 1, -alpha - 1, -alpha, childPVMoves);

                // If the search failed high, do another full-depth search
                if (score > alpha) {
                    score = -this.Negamax(depth - 1, -beta, -alpha, childPVMoves);
                }
            }
            // On the first move do a full-depth search
            else {
                score = -this.Negamax(depth - 1, -beta, -alpha, childPVMoves);
            }

            this.UnmakeMove(move);

            if (score > bestScore) {
                bestScore = score;

                if (score > alpha) {
                    bestMove = move;

                    if (isPVNode) {
                        // update the PV line
                        pvMoves.moves.length = 0;
                        pvMoves.moves.push(move);
                        pvMoves.moves.push(...childPVMoves.moves);
                    }

                    if (score < beta) {
                        alpha = score;
                        flag = HashFlag.Exact;
                    }
                    else {
                        flag = HashFlag.Beta;

                        if (!this.MoveIsCapture(move)) {
                            // Store the move if it's a killer
                            this.search.killers[1][this.Position.Ply] = this.search.killers[0][this.Position.Ply];
                            this.search.killers[0][this.Position.Ply] = move;

                            // increment history counter
                            this.search.history[this.Position.SideToMove][move & 0x3f][(move & 0xfc0) >> 6] += depth * depth;
                        }

                        break;
                    }
                }
            }
            else {
                if (!this.MoveIsCapture(move)) {
                    if (this.search.history[this.Position.SideToMove][move & 0x3f][(move & 0xfc0) >> 6] > 0) {
                        this.search.history[this.Position.SideToMove][move & 0x3f][(move & 0xfc0) >> 6] -= 1;
                    }
                }
            }

            childPVMoves.moves.length = 0;
        }

        // If there are no legal moves, check for checkmate or stalemate
        if (legalMoves === 0) {
            // If checkmate, returns an infinity score with the current play added to it (so faster checkmates will be scored higher)
            if (inCheck) {
                return -this.Inf + this.Position.Ply;
            }
            // If no available moves and not checkmate, then it's a stalemate
            else {
                return 0;
            }
        }

        this.WriteTT(depth, flag, bestScore, bestMove);

        return bestScore;
    }

    Quiescence(alpha: number, beta: number, depth: number) {
        this.search.nodes++;
        let flag = HashFlag.Alpha;

        // Check whether search time is up every 1000 nodes
        if (this.search.nodes % 1000 === 0) {
            this.CheckTime();
        }

        if (this.Timer.stop) {
            return 0;
        }

        // Check the transposition table for matching position and score
        const { ttScore, ttMove } = this.ProbeTT(0, alpha, beta);
        if (ttScore !== this.HashNoMove) {
            return ttScore;
        }

        let bestMove = ttMove;
        let bestScore = ttScore;
        let futilityValue = bestScore;

        const inCheck = this.IsSquareAttacked(this.GetLS1B(this.Position.PiecesBB[this.Position.SideToMove][Pieces.King]), this.Position.SideToMove ^ 1);

        if (inCheck) {
            bestScore = -this.Inf;
            futilityValue = bestScore;
        }
        else {
            if (bestScore === this.HashNoMove) {
                bestScore = this.Evaluate();
            }
    
            if (bestScore >= beta) {
                return bestScore;
            }
    
            if (bestScore > alpha) {
                alpha = bestScore;
            }

            futilityValue = bestScore + 150;
        }

        let moves = inCheck ? this.GenerateEvasions() : this.GenerateMoves(true);
        moves = this.SortMoves(moves, bestMove);

        for (let i = 0; i < moves.length; i++) {
            const move = moves[i];

            if (!inCheck && !this.MoveIsPromotion(move)) {
                const value = futilityValue + this.EGPieceValue[this.Position.Squares[(move & 0xfc0) >> 6]?.Type ?? Pieces.Pawn];

                if (value <= alpha) {
                    if (bestScore < value) {
                        bestScore = value;
                    }
                    continue;
                }
            }

            if (this.See(move) < 0) {
                continue;
            }

            if (!this.MakeMove(move)) {
                this.UnmakeMove(move);
                continue;
            }

            let score = -this.Quiescence(-beta, -alpha, depth - 1);

            this.UnmakeMove(move);

            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }

            if (score >= beta) {
                this.WriteTT(0, HashFlag.Beta, bestScore, bestMove);
                return bestScore;
            }

            if (score > alpha) {
                flag = HashFlag.Exact;
                alpha = score;
            }
        }

        if (inCheck && bestScore === -this.Inf) {
            return -this.Inf + this.Position.Ply;
        }

        this.WriteTT(0, flag, bestScore, bestMove);

        return bestScore;
    }

    IsRepetition() {
        for (let i = this.PositionHistory.length - this.Position.HalfMoves; i < this.PositionHistory.length - 1; i++) {
            if (this.PositionHistory[i] === this.Position.Hash) {
                return true;
            }
        }

        return false;
    }

    AgeHistory() {
        for (let from = Square.a8; from <= Square.h1; from++) {
            for (let to = Square.a8; to <= Square.h1; to++) {
                this.search.history[this.Position.SideToMove][from][to] /= 2;
            }
        }
    }

    /**
     * Scores and sorts moves
     * @param moves The moves to score and sort
     * @param ttMove The best move, to place at the top of the sorted list
     */
    SortMoves(moves: Move[], ttMove: Move) {
        const scores: { move: Move, score: number }[] = [];

        // Score moves
        for (let i = 0; i < moves.length; i++) {
            const move = moves[i];

            // If the move is the move from the transposition table (the PV move), we should make sure it's searched first
            if (move === ttMove) {
                scores.push({ move, score: this.Inf });
            }
            // MVV-LVA for captures
            else if (this.MoveIsCapture(move)) {
                const movingPiece = this.Position.Squares[move & 0x3f];
                let capturedPiece = this.Position.Squares[(move & 0xfc0) >> 6];

                if ((move & 0x3f80) >> 12 === MoveType.EnPassant) {
                    capturedPiece = this.Position.Squares[this.Position.SideToMove === Color.White ? ((move & 0xfc0) >> 6) + 8 : ((move & 0xfc0) >> 6) - 8];
                }

                if (movingPiece.Type > capturedPiece.Type) {
                    const score = this.MGPieceValue[capturedPiece.Type] - movingPiece.Type + 7000;
                    scores.push({ move, score });
                }
                else {
                    const score = this.MGPieceValue[capturedPiece.Type] - movingPiece.Type + 10000;
                    scores.push({ move, score });
                }
            }
            else {
                if (move === this.search.killers[0][this.Position.Ply]) {
                    scores.push({ move, score: 9000 });
                }
                else if (move === this.search.killers[1][this.Position.Ply]) {
                    scores.push({ move, score: 8000 });
                }
                else {
                    scores.push({ move, score: this.search.history[this.Position.SideToMove][move & 0x3f][(move & 0xfc0) >> 6] })
                }
            }
        }

        // Sort moves
        const len = scores.length;
        for (let i = 1; i < len; i++) {
            let current = scores[i];
            let j = i - 1;
            while ((j > -1) && (current.score > scores[j].score)) {
                scores[j + 1] = scores[j];
                j--;
            }
            scores[j + 1] = current;
        }

        return scores.map(({ move }) => move);
    }

    See(move: Move) {
        const toSquare = (move & 0xfc0) >> 6;
        const fromSquare = move & 0x3f;
        const movePiece = this.Position.Squares[fromSquare].Type;
        let attackedPiece = this.Position.Squares[toSquare]?.Type;
        let sideToMove = this.Position.SideToMove ^ 1;

        if (attackedPiece === undefined) {
            return 0;
        }

        const gain = [];
        let depth = 0;
        let attackerBB = this.SetBit(0n, fromSquare);
        let attdef = this.AttacksTo(toSquare);
        let movedBB = 0n;
        const maxXray = this.Position.PiecesBB[Color.White][Pieces.Pawn] | this.Position.PiecesBB[Color.White][Pieces.Bishop]
                    | this.Position.PiecesBB[Color.White][Pieces.Rook] | this.Position.PiecesBB[Color.White][Pieces.Queen]
                    | this.Position.PiecesBB[Color.Black][Pieces.Pawn] | this.Position.PiecesBB[Color.Black][Pieces.Bishop]
                    | this.Position.PiecesBB[Color.Black][Pieces.Rook] | this.Position.PiecesBB[Color.Black][Pieces.Queen];

        gain[depth] = this.MGPieceValue[attackedPiece];

        while (attackerBB) {
            depth++;

            gain[depth] = this.MGPieceValue[movePiece] - gain[depth - 1];

            if (Math.max(-gain[depth - 1], gain[depth]) < 0) {
                break;
            }

            attdef ^= attackerBB;
            movedBB |= attackerBB;

            if (attackerBB & maxXray) {
                attdef |= this.ConsiderXRays(toSquare) & ~movedBB;
            }

            const { bitboard, piece } = this.GetLeastValuablePiece(attdef, sideToMove, attackedPiece);
            attackerBB = bitboard;
            attackedPiece = piece;
            sideToMove ^= 1;
        }

        while (--depth) {
            gain[depth - 1] = -Math.max(-gain[depth - 1], gain[depth]);
        }

        return gain[0];
    }

    AttacksTo(square: Square) {
        const pawns = (this.Position.PiecesBB[Color.White][Pieces.Pawn] & this.PawnAttacks[Color.Black][square])
                        | ((this.Position.PiecesBB[Color.Black][Pieces.Pawn] & this.PawnAttacks[Color.White][square]));
        const knights = (this.Position.PiecesBB[Color.White][Pieces.Knight] | this.Position.PiecesBB[Color.Black][Pieces.Knight]) & this.KnightAttacks[square];
        const kings = (this.Position.PiecesBB[Color.White][Pieces.King] | this.Position.PiecesBB[Color.Black][Pieces.King]) & this.KingAttacks[square];
        const occupancy = this.Position.OccupanciesBB[Color.White] | this.Position.OccupanciesBB[Color.Black];

        let bishopQueens = this.Position.PiecesBB[Color.White][Pieces.Bishop] | this.Position.PiecesBB[Color.Black][Pieces.Bishop]
                        | this.Position.PiecesBB[Color.White][Pieces.Queen] | this.Position.PiecesBB[Color.Black][Pieces.Queen];
        bishopQueens &= this.GenerateBishopAttacks(occupancy, square);

        let rookQueens = this.Position.PiecesBB[Color.White][Pieces.Rook] | this.Position.PiecesBB[Color.Black][Pieces.Rook]
                        | this.Position.PiecesBB[Color.White][Pieces.Queen] | this.Position.PiecesBB[Color.Black][Pieces.Queen];
        rookQueens &= this.GenerateRookAttacks(occupancy, square);

        return pawns | knights | kings | bishopQueens | rookQueens;
    }

    AttacksToByColor(square: Square, color: Color) {
        const pawns = this.Position.PiecesBB[color][Pieces.Pawn] & this.PawnAttacks[color ^ 1][square];
        const knights = this.Position.PiecesBB[color][Pieces.Knight] & this.KnightAttacks[square];
        const kings = this.Position.PiecesBB[color][Pieces.King] & this.KingAttacks[square];
        const occupancy = this.Position.OccupanciesBB[Color.White] | this.Position.OccupanciesBB[Color.Black];

        let bishopQueens = this.Position.PiecesBB[color][Pieces.Bishop] | this.Position.PiecesBB[color][Pieces.Queen];
        bishopQueens &= this.GenerateBishopAttacks(occupancy, square);

        let rookQueens = this.Position.PiecesBB[color][Pieces.Rook] | this.Position.PiecesBB[color][Pieces.Queen];
        rookQueens &= this.GenerateRookAttacks(occupancy, square);

        return pawns | knights | kings | bishopQueens | rookQueens;
    }

    ConsiderXRays(square: Square) {
        const occupancy = this.Position.OccupanciesBB[Color.White] | this.Position.OccupanciesBB[Color.Black];
        let bishopQueens = this.Position.PiecesBB[Color.White][Pieces.Bishop] | this.Position.PiecesBB[Color.Black][Pieces.Bishop]
                        | this.Position.PiecesBB[Color.White][Pieces.Queen] | this.Position.PiecesBB[Color.Black][Pieces.Queen];
        bishopQueens &= this.GenerateBishopAttacks(occupancy, square);

        let rookQueens = this.Position.PiecesBB[Color.White][Pieces.Rook] | this.Position.PiecesBB[Color.Black][Pieces.Rook]
                        | this.Position.PiecesBB[Color.White][Pieces.Queen] | this.Position.PiecesBB[Color.Black][Pieces.Queen];
        rookQueens &= this.GenerateRookAttacks(occupancy, square);

        return bishopQueens | rookQueens;
    }

    GetLeastValuablePiece(board: bigint, side: Color, piece: Pieces) {
        for (piece = Pieces.Pawn; piece <= Pieces.King; piece++) {
            let subset = board & this.Position.PiecesBB[side][piece];
            if (subset) {
                return { bitboard: subset & -subset, piece };
            }
        }
        return { bitboard: 0n, piece: 0 };
    }

    /***************************
     * 
     * Time Management
     * 
     **************************/

    private readonly Timer = {
        timeleft: -1,
        increment: 0,
        depth: this.MaxPly,
        movestogo: 0,
        startTime: 0,
        stopTime: 0,
        movetime: -1,
        stop: false,
    }

    StartTimer() {
        let searchTime = 0;
        this.Timer.stop = false;

        // If infinite time, we don't need to set any time limit on searching
        if (this.Timer.timeleft === -1 && this.Timer.movetime === -1) {
            return;
        }

        // If there are moves left until the next time control, diving the remaining time equally
        if (this.Timer.movestogo !== 0) {
            searchTime = this.Timer.timeleft / this.Timer.movestogo;
        }
        else if (this.Timer.movetime !== -1) {
            searchTime = this.Timer.movetime;
        }
        else {
            // Games, on average, take approximately 40 moves to complete
            let movesleft = 0;
            if (this.Position.Ply <= 20) {
                movesleft = 45 - this.Position.Ply;
            }
            else {
                movesleft = 25;
            }

            searchTime = this.Timer.timeleft / movesleft;
        }

        searchTime += this.Timer.increment / 2;

        if (searchTime >= this.Timer.timeleft) {
            searchTime -= this.Timer.increment;
        }

        if (searchTime <= 0) {
            searchTime = this.Timer.increment - 1;
        }

        this.Timer.startTime = Date.now();
        this.Timer.stopTime = this.Timer.startTime + searchTime;
    }

    CheckTime() {
        // Never need to stop if there is no limit on search time
        if (!this.Timer.stop && this.Timer.timeleft === -1 && this.Timer.movetime === -1) {
            return;
        }

        if (Date.now() > this.Timer.stopTime) {
            this.Timer.stop = true;
        }
    }

    /***************************
     * 
     * UCI
     * 
     **************************/

    /**
     * Parses and loads a "position" command from the GUI
     * @param command The UCI position command
     */
    ParseUCIPosition(command: string) {
        // given command with start with "position", which we can remove
        const position = command.split(' ').slice(1).join(' ');

        // apply the position
        if (position.startsWith("fen")) {
            this.LoadFEN(position.split(' ').slice(1).join(' '));
        }
        else {
            this.LoadFEN(Khepri.positions.start);
        }

        // get the moves from the string
        const moves = position.split('moves ').slice(1).join(' ').split(' ').filter(x => x != "");

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
    }

    /**
     * Converts an move from the GUI to a move the engine can understand and make
     * @param move The move in algebraic notation
     * @returns The move in an engine-recognizable numeric format
     */
    ParseUCIMove(move: string) {
        const fromFile = parseInt(move.charAt(0), 36) - 10;
        const fromRank = 7 - (parseInt(move.charAt(1)) - 1);
        const from = (fromRank * 8) + fromFile;
        const toFile = parseInt(move.charAt(2), 36) - 10;
        const toRank = 7 - (parseInt(move.charAt(3)) - 1);
        let to = (toRank * 8) + toFile;

        const piece = this.Position.Squares[from];
        let moveType = MoveType.Normal;
        let promotionType: PromotionType = 0;

        // If the move has 5 characters, the 5th is a promotion
        if (move.length === 5) {
            const promotion = move.charAt(4);
            moveType = MoveType.Promotion;

            // UCI notation does not differentiate between promotions and promotion captures
            if (promotion === "n") {
                promotionType = PromotionType.Knight;
            }
            else if (promotion === "b") {
                promotionType = PromotionType.Bishop;
            }
            else if (promotion === "r") {
                promotionType = PromotionType.Rook;
            }
            else if (promotion === "q") {
                promotionType = PromotionType.Queen;
            }
        }
        // Check if the move was a castling move
        if (piece.Type === Pieces.King) {
            // Castling in standard chess always has the same strings...
            if (!this.isChess960 && (move === "e1g1" || move === "e1c1" || move === "e8g8" || move === "e8c8")) {
                moveType = MoveType.Castle;
                const kingSide = to > from;
                to = (kingSide ? Square.h1 : Square.a1) ^ (piece.Color * 56);
            }
            // Chess960 is a little more hard to parse. We have to check if the move is to the rook square and the side still has castling rights.
            else if (
                (to === this.Position.CastlingRookSquares[CastlingRights.WhiteKingside] && this.Position.CastlingRights & CastlingRights.WhiteKingside)
                || (to === this.Position.CastlingRookSquares[CastlingRights.BlackKingside] && this.Position.CastlingRights & CastlingRights.BlackKingside)
                || (to === this.Position.CastlingRookSquares[CastlingRights.WhiteQueenside] && this.Position.CastlingRights & CastlingRights.WhiteQueenside)
                || (to === this.Position.CastlingRookSquares[CastlingRights.BlackQueenside] && this.Position.CastlingRights & CastlingRights.BlackQueenside)
            ) {
                moveType = MoveType.Castle;
            }
        }
        // If en passant capture
        else if (to === this.Position.EnPassSq && piece.Type === Pieces.Pawn) {
            moveType = MoveType.EnPassant;
        }
        
        return this.EncodeMove(from, to, moveType, promotionType);
    }

    /**
     * Parse the "go" command from the GUI to begin searching the position
     * @param command The UCI command
     * @returns The principal variation and best move
     */
    ParseUCIGo(command: string) {
        const commands = command.split(" ");
        const sidePrefix = this.Position.SideToMove === Color.White ? "w" : "b";

        let timeleft = -1; // negative value indicates infinite time
        let increment = 0;
        let movestogo = 0;
        let movetime = -1; // -1 is infinite
        let depth = this.MaxPly;

        for (let i = 0; i < commands.length; i++) {
            const command = commands[i];

            if (command === sidePrefix + "time") {
                timeleft = parseInt(commands[i + 1]);
            }
            else if (command === sidePrefix + "inc") {
                increment = parseInt(commands[i + 1]);
            }
            else if (command === "movestogo") {
                movestogo = parseInt(commands[i + 1]);
            }
            else if (command === "depth") {
                // set depth to UCI value, unless it is greater than the max ply
                depth = Math.min(parseInt(commands[i + 1]), this.MaxPly);
            }
            else if (command === "movetime") {
                movetime = parseInt(commands[i + 1]);
            }
        }

        // Set the engine's timer values to values from the UCI command
        this.Timer.timeleft = timeleft;
        this.Timer.increment = increment;
        this.Timer.depth = depth;
        this.Timer.movestogo = movestogo;
        this.Timer.movetime = movetime;

        return this.Search(depth);
    }

    /***************************
     * 
     * Tests
     * 
     **************************/

    private totalNodes = 0;

    Perft(depth: number, printNodes = false) {
        this.totalNodes = 0;
        const start = performance.now();
    
        const moves = this.GenerateMoves();
    
        for (let i = 0; i < moves.length; i++) {
            const move = moves[i];
    
            // Skip the move if it puts the king into check
            if (this.MakeMove(move)) {
                let nodes = this.PerftDriver(depth - 1);
    
                if (printNodes) {
                    console.log(`${this.PrettyPrintMove(move)}: ${nodes}`);
                }
            }
    
            this.UnmakeMove(move);
        }
    
        const end = performance.now();
        if (printNodes) {
            console.log(`Nodes: ${this.totalNodes.toLocaleString()}. Time taken: ${end - start}`);
        }
    
        return this.totalNodes;
    }
    
    PerftDriver(depth: number) {
        let nodes = 0;
    
        if (depth === 0) {
            this.totalNodes++;
            return 1;
        }
    
        const moves = this.GenerateMoves();
    
        for (let i = 0; i < moves.length; i++) {
            const move = moves[i];
    
            // Skip the move if it puts the king into check
            if (this.MakeMove(move)) {
                nodes += this.PerftDriver(depth - 1);
            }
            this.UnmakeMove(move);
        }
    
        return nodes;
    }
}

export default Khepri;
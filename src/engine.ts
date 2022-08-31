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

export enum Pieces {
    Pawn, Knight, Bishop, Rook, Queen, King,
}

export enum Color {
    White,
    Black,
    Both,
}

export enum CastlingRights {
    WhiteKingside = 1,
    WhiteQueenside,
    BlackKingside = 4,
    BlackQueenside = 8,
}

// Moves types as defined at https://www.chessprogramming.org/Encoding_Moves
enum MoveType {
    Quiet = 0,
    DoublePawnPush,
    KingCastle,
    QueenCastle,
    Capture,
    EPCapture,
    KnightPromotion = 8,
    BishopPromotion,
    RookPromotion,
    QueenPromotion,
    KnightPromoCapture,
    BishopPromoCapture,
    RookPromoCapture,
    QueenPromoCapture,
}

enum HashFlag {
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
    SideToMove: Color.Black | Color. White
    EnPassSq: Square
    HalfMoves: number
    Ply: number
    Hash: bigint
    PawnHash: bigint
    Phase: number
}

interface Piece {
    Type: Pieces
    Color: Color.Black | Color.White
}

interface State {
    CastlingRights: CastlingRights
    EnPassSq: Square
    Captured?: Piece
    Hash: bigint
    PawnHash: bigint
    HalfMoves: number
}

interface StringToPiece {
    [key: string]: { Type: Pieces, Color: Color.White | Color.Black }
}

interface Zobrist {
    Pieces: bigint[][][]
    EnPassant: bigint[]
    Castle: bigint[]
    SideToMove: bigint
}

interface TTEntry {
    Hash: bigint
    BestMove: number
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
        this.InitRankMasks();
        this.InitFileMasks();
        this.InitDiagMasks();
        this.InitAntiDiagMasks();
        this.InitIsolatedMasks();
        this.InitPassedMasks();
        this.InitJumperAttacks();
        this.InitBishopAttacks();
        this.InitRookAttacks();
        this.InitHashes();
        this.SetTransTableSize();
    }

    readonly name = "KhepriChess";
    readonly version = "2.1.0";
    readonly author = "Kurt Peters";

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
    }

    private readonly PositionHistory: bigint[] = [];

    private readonly CharToPiece: StringToPiece = {
        "P": { Type: Pieces.Pawn, Color: Color.White },
        "N": { Type: Pieces.Knight, Color: Color.White },
        "B": { Type: Pieces.Bishop, Color: Color.White },
        "R": { Type: Pieces.Rook, Color: Color.White },
        "Q": { Type: Pieces.Queen, Color: Color.White },
        "K": { Type: Pieces.King, Color: Color.White },
        "p": { Type: Pieces.Pawn, Color: Color.Black },
        "n": { Type: Pieces.Knight, Color: Color.Black },
        "b": { Type: Pieces.Bishop, Color: Color.Black },
        "r": { Type: Pieces.Rook, Color: Color.Black },
        "q": { Type: Pieces.Queen, Color: Color.Black },
        "k": { Type: Pieces.King, Color: Color.Black },
    }

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
                    const piece: Piece = this.CharToPiece[char];

                    this.PlacePieceNoHash(piece.Type, piece.Color, square);
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
            switch (castle) {
                case 'K': this.Position.CastlingRights |= CastlingRights.WhiteKingside; break;
                case 'Q': this.Position.CastlingRights |= CastlingRights.WhiteQueenside; break;
                case 'k': this.Position.CastlingRights |= CastlingRights.BlackKingside; break;
                case 'q': this.Position.CastlingRights |= CastlingRights.BlackQueenside; break;
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
        let attacked = -1n; // default to full board

        if (tacticalOnly) {
            attacked = this.Position.OccupanciesBB[this.Position.SideToMove ^ 1];
            this.GeneratePawnAttacks(moveList);
        }
        else {
            this.GeneratePawnMoves(moveList);
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

    /**
     * Generate pawn moves for the loaded position
     */
    GeneratePawnMoves(moveList: Move[]) {
        let pawnBB = this.Position.PiecesBB[this.Position.SideToMove][Pieces.Pawn];
        const emptyBB = ~(this.Position.OccupanciesBB[Color.White] | this.Position.OccupanciesBB[Color.Black]);

        let singlePushTargets = ((this.Position.SideToMove === Color.White) ? (pawnBB >> 8n) : (pawnBB << 8n)) & emptyBB;
        let doublePushTargets = (singlePushTargets >> 8n) & 0x000000FF00000000n & emptyBB;
        if (this.Position.SideToMove === Color.Black) {
            doublePushTargets = (singlePushTargets << 8n) & 0x00000000FF000000n & emptyBB;
        }
            
        // Add non attack moves
        while (singlePushTargets) {
            const toSquare = this.GetLS1B(singlePushTargets);
            const fromSquare = this.Position.SideToMove === Color.White ? toSquare + 8 : toSquare - 8;

            // Add pawn promotions
            if (this.Position.SideToMove === Color.White ? toSquare <= Square.h8 : toSquare >= Square.a1) {
                moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.KnightPromotion));
                moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.BishopPromotion));
                moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.RookPromotion));
                moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.QueenPromotion));
            }
            else {
                // Add quiet moves
                moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.Quiet));
            }

            singlePushTargets = this.RemoveBit(singlePushTargets, toSquare);
        }

        while (doublePushTargets) {
            const toSquare = this.GetLS1B(doublePushTargets);
            const fromSquare = this.Position.SideToMove === Color.White ? toSquare + 16 : toSquare - 16;

            moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.DoublePawnPush));

            doublePushTargets = this.RemoveBit(doublePushTargets, toSquare);
        }

        while (pawnBB) {
            const fromSquare = this.GetLS1B(pawnBB);
            
            let attacks = this.PawnAttacks[this.Position.SideToMove][fromSquare] & this.Position.OccupanciesBB[this.Position.SideToMove ^ 1];

            while (attacks) {
                const toSquare = this.GetLS1B(attacks);

                // Pawn attacks to promotion
                if (this.Position.SideToMove === Color.White ? toSquare <= Square.h8 : toSquare >= Square.a1) {
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.KnightPromoCapture));
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.BishopPromoCapture));
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.RookPromoCapture));
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.QueenPromoCapture));
                }
                else {
                    // Regular captures
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.Capture));
                }

                attacks = this.RemoveBit(attacks, toSquare);
            }

            // en passant captures
            if (this.Position.EnPassSq !== Square.no_sq) {
                const enpassantAttacks = this.PawnAttacks[this.Position.SideToMove][fromSquare] & (1n << this.SquareBigInt[this.Position.EnPassSq]);

                if (enpassantAttacks) {
                    const toSquare = this.GetLS1B(enpassantAttacks);
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.EPCapture));
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
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.KnightPromoCapture));
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.BishopPromoCapture));
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.RookPromoCapture));
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.QueenPromoCapture));
                }
                else {
                    // Regular captures
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.Capture));
                }

                attacks = this.RemoveBit(attacks, toSquare);
            }

            // en passant captures
            if (this.Position.EnPassSq !== Square.no_sq) {
                const enpassantAttacks = this.PawnAttacks[this.Position.SideToMove][fromSquare] & (1n << this.SquareBigInt[this.Position.EnPassSq]);

                if (enpassantAttacks) {
                    const toSquare = this.GetLS1B(enpassantAttacks);
                    moveList.push(this.EncodeMove(fromSquare, toSquare, MoveType.EPCapture));
                }
            }

            pawnBB = this.RemoveBit(pawnBB, fromSquare);
        }
    }

    GenerateCastlingMoves(moveList: Move[]) {
        const bothBB = this.Position.OccupanciesBB[Color.White] | this.Position.OccupanciesBB[Color.Black];
        if (this.Position.SideToMove === Color.White) {
            // Can white castle kingside?
            if (this.Position.CastlingRights & CastlingRights.WhiteKingside
                && (bothBB & 6917529027641081856n) === 0n
                && !this.IsSquareAttacked(Square.e1, Color.Black) && !this.IsSquareAttacked(Square.f1, Color.Black) && !this.IsSquareAttacked(Square.g1, Color.Black)) {
                    moveList.push(this.EncodeMove(Square.e1, Square.g1, MoveType.KingCastle));
                }
            // Can white castle queenside?
            if (this.Position.CastlingRights & CastlingRights.WhiteQueenside
                && (bothBB & 1008806316530991104n) === 0n
                && !this.IsSquareAttacked(Square.e1, Color.Black) && !this.IsSquareAttacked(Square.d1, Color.Black) && !this.IsSquareAttacked(Square.c1, Color.Black)) {
                    moveList.push(this.EncodeMove(Square.e1, Square.c1, MoveType.QueenCastle));
                }
        }
        else {
            // Can black castle kingside?
            if (this.Position.CastlingRights & CastlingRights.BlackKingside
                && (bothBB & 96n) === 0n
                && !this.IsSquareAttacked(Square.e8, Color.White) && !this.IsSquareAttacked(Square.f8, Color.White) && !this.IsSquareAttacked(Square.g8, Color.White)) {
                    moveList.push(this.EncodeMove(Square.e8, Square.g8, MoveType.KingCastle));
                }
            if (this.Position.CastlingRights & CastlingRights.BlackQueenside
                && (bothBB & 14n) === 0n
                && !this.IsSquareAttacked(Square.e8, Color.White) && !this.IsSquareAttacked(Square.d8, Color.White) && !this.IsSquareAttacked(Square.c8, Color.White)) {
                    moveList.push(this.EncodeMove(Square.e8, Square.c8, MoveType.QueenCastle));
                }
        }
    }

    GenerateKnightMoves(moveList: Move[], square: Square, attacked: bigint) {
        let movesBB = (this.KnightAttacks[square] & ~this.Position.OccupanciesBB[this.Position.SideToMove]) & attacked;

        while (movesBB) {
            const toSquare = this.GetLS1B(movesBB);

            // Check if the target square is occupied by the opposite color
            const isCapture = this.Position.Squares[toSquare] && this.Position.Squares[toSquare].Color !== this.Position.SideToMove;

            if (isCapture) {
                moveList.push(this.EncodeMove(square, toSquare, MoveType.Capture));
            }
            else {
                moveList.push(this.EncodeMove(square, toSquare, MoveType.Quiet));
            }

            movesBB = this.RemoveBit(movesBB, toSquare);
        }
    }

    GenerateBishopAttacks(square: Square) {
        let occupancy = this.Position.OccupanciesBB[Color.White] | this.Position.OccupanciesBB[Color.Black];

        occupancy = BigInt.asUintN(64, (occupancy & this.BishopMasks[square]));
        occupancy = BigInt.asUintN(64, occupancy * this.BishopMagicNumbers[square]);
        occupancy >>= 64n - this.BishopRelevantBits[square];

        return this.BishopAttacks[square][Number(occupancy)];
    }

    GenerateBishopMoves(moveList: Move[], square: Square, attacked: bigint) {
        let attacks = (this.GenerateBishopAttacks(square) & ~this.Position.OccupanciesBB[this.Position.SideToMove]) & attacked;

        while (attacks) {
            const toSquare = this.GetLS1B(attacks);

            const isCapture = this.Position.Squares[toSquare] && this.Position.Squares[toSquare].Color !== this.Position.SideToMove;

            if (isCapture) {
                moveList.push(this.EncodeMove(square, toSquare, MoveType.Capture));
            }
            else {
                moveList.push(this.EncodeMove(square, toSquare, MoveType.Quiet));
            }

            attacks = this.RemoveBit(attacks, toSquare);
        }
    }

    GenerateRookAttacks(square: Square) {
        let occupancy = this.Position.OccupanciesBB[Color.White] | this.Position.OccupanciesBB[Color.Black];

        occupancy = BigInt.asUintN(64, occupancy & this.RookMasks[square]);
        occupancy = BigInt.asUintN(64, occupancy * this.RookMagicNumbers[square]);
        occupancy >>= 64n - this.RookRelevantBits[square];

        return this.RookAttacks[square][Number(occupancy)];
    }

    GenerateRookMoves(moveList: Move[], square: Square, attacked: bigint) {
        let attacks = (this.GenerateRookAttacks(square) & ~this.Position.OccupanciesBB[this.Position.SideToMove]) & attacked;

        while (attacks) {
            const toSquare = this.GetLS1B(attacks);

            const isCapture = this.Position.Squares[toSquare] && this.Position.Squares[toSquare].Color !== this.Position.SideToMove;

            if (isCapture) {
                moveList.push(this.EncodeMove(square, toSquare, MoveType.Capture));
            }
            else {
                moveList.push(this.EncodeMove(square, toSquare, MoveType.Quiet));
            }

            attacks = this.RemoveBit(attacks, toSquare);
        }
    }

    GenerateQueenMoves(moveList: Move[], square: Square, attacked: bigint) {
        let attacks = ((this.GenerateBishopAttacks(square) | this.GenerateRookAttacks(square)) & ~this.Position.OccupanciesBB[this.Position.SideToMove]) & attacked;

        while (attacks) {
            const toSquare = this.GetLS1B(attacks);

            const isCapture = this.Position.Squares[toSquare] && this.Position.Squares[toSquare].Color !== this.Position.SideToMove;

            if (isCapture) {
                moveList.push(this.EncodeMove(square, toSquare, MoveType.Capture));
            }
            else {
                moveList.push(this.EncodeMove(square, toSquare, MoveType.Quiet));
            }

            attacks = this.RemoveBit(attacks, toSquare);
        }
    }

    GenerateKingMoves(moveList: Move[], square: Square, attacked: bigint) {
        let movesBB = (this.KingAttacks[square] & ~this.Position.OccupanciesBB[this.Position.SideToMove]) & attacked;

        while (movesBB) {
            const toSquare = this.GetLS1B(movesBB);

            const isCapture = this.Position.Squares[toSquare] && this.Position.Squares[toSquare].Color !== this.Position.SideToMove;

            if (isCapture) {
                moveList.push(this.EncodeMove(square, toSquare, MoveType.Capture));
            }
            else {
                moveList.push(this.EncodeMove(square, toSquare, MoveType.Quiet));
            }

            movesBB = this.RemoveBit(movesBB, toSquare);
        }
    }

    /**
     * Encode the given move
     */
    EncodeMove(source: Square, target: Square, moveType: MoveType) {
        return source | (target << 6) | (moveType << 12);
    }

    MoveIsCapture(move: Move) {
        return this.Position.Squares[(move & 0xfc0) >> 6] !== undefined;
    }

    MoveIsPromotion(move: Move) {
        const movetype = move >> 12;

        return movetype === MoveType.KnightPromotion
            || movetype === MoveType.BishopPromotion
            || movetype === MoveType.RookPromotion
            || movetype === MoveType.QueenPromotion
            || movetype === MoveType.KnightPromoCapture
            || movetype === MoveType.BishopPromoCapture
            || movetype === MoveType.RookPromoCapture
            || movetype === MoveType.QueenPromoCapture;
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

        const bishopQueens = bishops | queens;
        // Bishop and Rook attacks are expensive to calcuate, so check the masks first to see if the call even needs to be made
        if (((this.diagMasks[square] | this.antiDiagMasks[square]) & bishopQueens) && this.GenerateBishopAttacks(square) & bishopQueens) {
            return true;
        }
        
        const rookQueens = rooks | queens;
        if (((this.rankMasks[square] | this.fileMasks[square]) & rookQueens) && this.GenerateRookAttacks(square) & rookQueens) {
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

    private readonly CastlingSquares = [
        7, 15, 15, 15,  3, 15, 15, 11,
        15, 15, 15, 15, 15, 15, 15, 15,
        15, 15, 15, 15, 15, 15, 15, 15,
        15, 15, 15, 15, 15, 15, 15, 15,
        15, 15, 15, 15, 15, 15, 15, 15,
        15, 15, 15, 15, 15, 15, 15, 15,
        15, 15, 15, 15, 15, 15, 15, 15,
        13, 15, 15, 15, 12, 15, 15, 14
    ];


    private readonly stateCopy: State[] = [];

    /**
     * Makes a move
     * @param move a move number
     * @returns False if the move would leave side's own king in check, otherwise true
     */
    MakeMove(move: number) {
        const from = move & 0x3f;
        const to = (move & 0xfc0) >> 6;
        const moveType = move >> 12;
        const piece = this.Position.Squares[from];

        this.stateCopy.push({
            CastlingRights: this.Position.CastlingRights,
            EnPassSq: this.Position.EnPassSq,
            Captured: this.Position.Squares[to],
            Hash: this.Position.Hash,
            PawnHash: this.Position.PawnHash,
            HalfMoves: this.Position.HalfMoves,
        });

        this.Position.Ply++;
        this.Position.HalfMoves++;

        // Clear the en passant square
        if (this.Position.EnPassSq !== Square.no_sq) {
            this.Position.Hash ^= this.Zobrist.EnPassant[this.Position.EnPassSq];
            this.Position.EnPassSq = Square.no_sq;
        }

        // Remove the moving piece from its current square
        this.RemovePiece(piece.Type, piece.Color, from);

        switch (moveType) {
            case MoveType.Quiet: {
                this.PlacePiece(piece.Type, piece.Color, to);
                if (piece.Type === Pieces.Pawn) {
                    this.Position.HalfMoves = 0;
                }
                break;
            }
            case MoveType.DoublePawnPush: {
                this.PlacePiece(piece.Type, piece.Color, to);

                // Set the en passant square when a pawn double pushes
                if (this.Position.SideToMove === Color.White) {
                    this.Position.EnPassSq = to + 8;
                }
                else {
                    this.Position.EnPassSq = to - 8;
                }

                this.Position.Hash ^= this.Zobrist.EnPassant[this.Position.EnPassSq];
                this.Position.HalfMoves = 0;

                break;
            }
            case MoveType.Capture: {
                let captured = this.Position.Squares[to];
                this.RemovePiece(captured.Type, captured.Color, to);
                this.PlacePiece(piece.Type, piece.Color, to);

                this.Position.HalfMoves = 0;
                break;
            }
            case MoveType.EPCapture: {
                // remove the captured piece
                const epSquare = this.Position.SideToMove === Color.White ? to + 8 : to - 8;
                let captured = this.Position.Squares[epSquare];

                this.stateCopy[this.stateCopy.length - 1].Captured = captured;

                this.RemovePiece(captured.Type, captured.Color, epSquare);
                this.PlacePiece(piece.Type, piece.Color, to);

                this.Position.HalfMoves = 0;
                break;
            }
            case MoveType.KnightPromotion:
            case MoveType.BishopPromotion:
            case MoveType.RookPromotion:
            case MoveType.QueenPromotion:
            case MoveType.KnightPromoCapture:
            case MoveType.BishopPromoCapture:
            case MoveType.RookPromoCapture:
            case MoveType.QueenPromoCapture: {
                // remove the captured piece
                const captured = this.Position.Squares[to];
                if (captured) {
                    this.RemovePiece(captured.Type, captured.Color, to);
                }

                // Place the promoted piece
                if (moveType === MoveType.KnightPromotion || moveType === MoveType.KnightPromoCapture) {
                    this.PlacePiece(Pieces.Knight, piece.Color, to);
                }
                else if (moveType === MoveType.BishopPromotion || moveType === MoveType.BishopPromoCapture) {
                    this.PlacePiece(Pieces.Bishop, piece.Color, to);
                }
                else if (moveType === MoveType.RookPromotion || moveType === MoveType.RookPromoCapture) {
                    this.PlacePiece(Pieces.Rook, piece.Color, to);
                }
                else if (moveType === MoveType.QueenPromotion || moveType === MoveType.QueenPromoCapture) {
                    this.PlacePiece(Pieces.Queen, piece.Color, to);
                }

                this.Position.HalfMoves = 0;

                break;
            }
            case MoveType.KingCastle:
            case MoveType.QueenCastle: {
                this.PlacePiece(piece.Type, piece.Color, to);

                // Move the appropriate rook to the castle square
                if (piece.Color === Color.White && moveType === MoveType.KingCastle) {
                    this.RemovePiece(Pieces.Rook, piece.Color, Square.h1);
                    this.PlacePiece(Pieces.Rook, piece.Color, Square.f1);
                }
                else if (piece.Color === Color.White && moveType === MoveType.QueenCastle) {
                    this.RemovePiece(Pieces.Rook, piece.Color, Square.a1);
                    this.PlacePiece(Pieces.Rook, piece.Color, Square.d1);
                }
                else if (piece.Color === Color.Black && moveType === MoveType.KingCastle) {
                    this.RemovePiece(Pieces.Rook, piece.Color, Square.h8);
                    this.PlacePiece(Pieces.Rook, piece.Color, Square.f8);
                }
                else if (piece.Color === Color.Black && moveType === MoveType.QueenCastle) {
                    this.RemovePiece(Pieces.Rook, piece.Color, Square.a8);
                    this.PlacePiece(Pieces.Rook, piece.Color, Square.d8);
                }
                break;
            }
        }

        // update castling rights
        this.Position.Hash ^= this.Zobrist.Castle[this.Position.CastlingRights];
        this.Position.CastlingRights &= this.CastlingSquares[from] & this.CastlingSquares[to];
        this.Position.Hash ^= this.Zobrist.Castle[this.Position.CastlingRights];

        // Update the side to move
        this.Position.SideToMove ^= 1;
        this.Position.Hash ^= this.Zobrist.SideToMove;

        // Update hash en passant square if en passant square is set
        if (this.Position.EnPassSq !== Square.no_sq) {
            this.Position.Hash ^= this.Zobrist.EnPassant[this.Position.EnPassSq];
        }

        this.PositionHistory[this.PositionHistory.length] = this.Position.Hash;

        // Because the move generator generates pseudo-legal moves,
        // The move that was just made might have left the side-to-move's king in check
        // Make sure that hasn't happened
        return !this.IsSquareAttacked(this.GetLS1B(this.Position.PiecesBB[this.Position.SideToMove ^ 1][Pieces.King]), this.Position.SideToMove);
    }

    UnmakeMove(move: number) {
        const state = this.stateCopy.pop();

        if (!state) {
            throw new Error("Unable to get state for unmake move");
        }

        this.Position.Ply--;

        this.PositionHistory.pop();

        // Replace current position properties with those retreived from the state
        this.Position.CastlingRights = state.CastlingRights;
        this.Position.EnPassSq = state.EnPassSq;
        this.Position.HalfMoves = state.HalfMoves;

        // Flip the side to move
        this.Position.SideToMove ^= 1;

        const from = move & 0x3f;
        const to = (move & 0xfc0) >> 6;
        const moveType = move >> 12;
        const piece = this.Position.Squares[to];

        // Put the piece back on its original square
        this.PlacePieceNoHash(piece.Type, piece.Color, from);

        switch (moveType) {
            case MoveType.Quiet: {
                this.RemovePieceNoHash(piece.Type, piece.Color, to);
                break;
            }
            case MoveType.DoublePawnPush: {
                this.RemovePieceNoHash(piece.Type, piece.Color, to);
                break;
            }
            case MoveType.Capture: {
                let captured = state.Captured as Piece;

                this.RemovePieceNoHash(piece.Type, piece.Color, to);
                this.PlacePieceNoHash(captured.Type, captured.Color, to);
                break;
            }
            case MoveType.EPCapture: {
                let captured = state.Captured as Piece;

                this.RemovePieceNoHash(piece.Type, piece.Color, to);
                const epSquare = this.Position.SideToMove === Color.White ? to + 8 : to - 8;
                this.PlacePieceNoHash(captured.Type, captured.Color, epSquare);
                break;
            }
            case MoveType.KnightPromotion:
            case MoveType.BishopPromotion:
            case MoveType.RookPromotion:
            case MoveType.QueenPromotion:
            case MoveType.KnightPromoCapture:
            case MoveType.BishopPromoCapture:
            case MoveType.RookPromoCapture:
            case MoveType.QueenPromoCapture: {
                this.RemovePieceNoHash(piece.Type, piece.Color, to);
                // Have to remove the promoted piece and replace it with a pawn
                this.RemovePieceNoHash(piece.Type, piece.Color, from);
                this.PlacePieceNoHash(Pieces.Pawn, piece.Color, from);

                // Replace captured piece, if there was one
                const captured = state.Captured;
                if (captured) {
                    this.PlacePieceNoHash(captured.Type, captured.Color, to);
                }

                break;
            }
            case MoveType.KingCastle:
            case MoveType.QueenCastle: {
                this.RemovePieceNoHash(piece.Type, piece.Color, to);

                // Move the rook back
                if (piece.Color === Color.White && moveType === MoveType.KingCastle) {
                    this.RemovePieceNoHash(Pieces.Rook, piece.Color, Square.f1);
                    this.PlacePieceNoHash(Pieces.Rook, piece.Color, Square.h1);
                }
                else if (piece.Color === Color.White && moveType === MoveType.QueenCastle) {
                    this.RemovePieceNoHash(Pieces.Rook, piece.Color, Square.d1);
                    this.PlacePieceNoHash(Pieces.Rook, piece.Color, Square.a1);
                }
                else if (piece.Color === Color.Black && moveType === MoveType.KingCastle) {
                    this.RemovePieceNoHash(Pieces.Rook, piece.Color, Square.f8);
                    this.PlacePieceNoHash(Pieces.Rook, piece.Color, Square.h8);
                }
                else if (piece.Color === Color.Black && moveType === MoveType.QueenCastle) {
                    this.RemovePieceNoHash(Pieces.Rook, piece.Color, Square.d8);
                    this.PlacePieceNoHash(Pieces.Rook, piece.Color, Square.a8);
                }
                break;
            }
        }

        // Set hash to previous value
        this.Position.Hash = state.Hash;
        this.Position.PawnHash = state.PawnHash;
    }

    MakeNullMove() {
        this.stateCopy.push({
            CastlingRights: this.Position.CastlingRights,
            EnPassSq: this.Position.EnPassSq,
            Hash: this.Position.Hash,
            HalfMoves: this.Position.HalfMoves,
            PawnHash: this.Position.PawnHash,
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
        const state = this.stateCopy.pop();

        if (!state) {
            throw new Error("Unable to get state for unmake move");
        }

        this.Position.CastlingRights = state.CastlingRights;
        this.Position.EnPassSq = state.EnPassSq;
        this.Position.HalfMoves = state.HalfMoves;
        this.Position.SideToMove ^= 1;
        this.Position.Hash = state.Hash;
        this.Position.PawnHash = state.PawnHash;
        this.Position.Ply--;
    }

    RemovePiece(piece: Pieces, color: Color.Black | Color.White, square: Square) {
        this.Position.PiecesBB[color][piece] = this.RemoveBit(this.Position.PiecesBB[color][piece], square);
        this.Position.OccupanciesBB[color] = this.RemoveBit(this.Position.OccupanciesBB[color], square);
        this.Position.Hash ^= this.Zobrist.Pieces[color][piece][square];
        delete this.Position.Squares[square];

        if (piece === Pieces.Pawn || piece === Pieces.King) {
            this.Position.PawnHash ^= this.Zobrist.Pieces[color][piece][square];
        }

        this.Position.Phase += this.PhaseValues[piece];
    }

    PlacePiece(piece: Pieces, color: Color.Black | Color.White, square: Square) {
        this.Position.PiecesBB[color][piece] = this.SetBit(this.Position.PiecesBB[color][piece], square);
        this.Position.OccupanciesBB[color] = this.SetBit(this.Position.OccupanciesBB[color], square);
        this.Position.Hash ^= this.Zobrist.Pieces[color][piece][square];
        this.Position.Squares[square] = { Type: piece, Color: color };

        if (piece === Pieces.Pawn || piece === Pieces.King) {
            this.Position.PawnHash ^= this.Zobrist.Pieces[color][piece][square];
        }

        this.Position.Phase -= this.PhaseValues[piece];
    }

    PlacePieceNoHash(piece: Pieces, color: Color.Black | Color.White, square: Square) {
        this.Position.PiecesBB[color][piece] = this.SetBit(this.Position.PiecesBB[color][piece], square);
        this.Position.OccupanciesBB[color] = this.SetBit(this.Position.OccupanciesBB[color], square);
        this.Position.Squares[square] = { Type: piece, Color: color };

        this.Position.Phase -= this.PhaseValues[piece];
    }

    RemovePieceNoHash(piece: Pieces, color: Color.Black | Color.White, square: Square) {
        this.Position.PiecesBB[color][piece] = this.RemoveBit(this.Position.PiecesBB[color][piece], square);
        this.Position.OccupanciesBB[color] = this.RemoveBit(this.Position.OccupanciesBB[color], square);
        delete this.Position.Squares[square];

        this.Position.Phase += this.PhaseValues[piece];
    }

    PrettyPrintMove(move: number) {
        let prettymove = `${Square[move & 0x3f]}${Square[(move & 0xfc0) >> 6]}`;
        if (move >> 12 !== 0) {
            const moveType = move >> 12;
            if (moveType === MoveType.KnightPromotion || moveType === MoveType.KnightPromoCapture) {
                prettymove += "n";
            }
            if (moveType === MoveType.BishopPromotion || moveType === MoveType.BishopPromoCapture) {
                prettymove += "b";
            }
            if (moveType === MoveType.RookPromotion || moveType === MoveType.RookPromoCapture) {
                prettymove += "r";
            }
            if (moveType === MoveType.QueenPromotion || moveType === MoveType.QueenPromoCapture) {
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

    private rankMasks: bigint[] = [];
    fileMasks: bigint[] = [];
    private diagMasks: bigint[] = [];
    private antiDiagMasks: bigint[] = [];
    isolatedMasks: bigint[] = [];
    passedMasks = Array(2).fill(0).map(() => Array(64).fill(0))

    private readonly notAFile = 18374403900871474942n;
    private readonly notHFile = 9187201950435737471n;
    private readonly notHGFile = 4557430888798830399n;
    private readonly notABFile = 18229723555195321596n;

    InitRankMasks() {
        for (let square = 0; square < 64; square++) {
            this.rankMasks[square] = 0xffn << (BigInt(square) & 56n);
        }
    }

    InitFileMasks() {
        for (let square = 0; square < 64; square++) {
            this.fileMasks[square] = 0x0101010101010101n << (BigInt(square) & 7n);
        }
    }

    InitDiagMasks() {
        for (let square = 0; square < 64; square++) {
            const maindia = 0x8040201008040201n;
            const diag = BigInt((square & 7) - (square >> 3));
            this.diagMasks[square] = diag >= 0 ? maindia >> diag*8n : maindia << -diag*8n;
        }
    }

    InitAntiDiagMasks() {
        for (let square = 0; square < 64; square++) {
            const maindia = 0x0102040810204080n;
            const diag = BigInt(7 - (square&7) - (square>>3));
            this.antiDiagMasks[square] = diag >= 0 ? maindia >> diag*8n : maindia << -diag*8n;
        }
    }

    InitIsolatedMasks() {
        for (let square = 0; square < 64; square++) {
            this.isolatedMasks[square] = this.fileMasks[square] << 1n | this.fileMasks[square] >> 1n;
        }
    }

    InitPassedMasks() {
        for (let square = 0; square < 64; square++) {
            let mask = this.fileMasks[square] | ((this.fileMasks[square] & this.notAFile) >> 1n) | ((this.fileMasks[square] & this.notHFile) << 1n);
            this.passedMasks[Color.White][square] = mask;
            this.passedMasks[Color.Black][square ^ 56] = mask;

            // clear ranks behind squares
            for (let s = square; s <= Square.h1; s += 8) {
                this.passedMasks[Color.White][square] &= ~this.rankMasks[s];
            }

            for (let s = square; s >= Square.a8; s -= 8) {
                this.passedMasks[Color.Black][square ^ 56] &= ~this.rankMasks[s];
            }
        }
    }
    
    /**
     * Initializes jumping pieces attack arrays
     */
    InitJumperAttacks() {
        for (let square = 0; square < 64; square++) {
            this.PawnAttacks[Color.White][square] = this.MaskPawnAttacks(Color.White, square);
            this.PawnAttacks[Color.Black][square] = this.MaskPawnAttacks(Color.Black, square);
    
            this.KnightAttacks[square] = this.MaskKnightAttacks(square);
    
            this.KingAttacks[square] = this.MaskKingAttacks(square);
        }
    }
    
    InitBishopAttacks() {
        for (let square = 0; square < 64; square++) {
            this.BishopMasks[square] = this.GenerateBishopMasks(square);
    
            const relevantBitsCount = this.CountBits(this.BishopMasks[square]);
            const occupancyIndicies = 1 << relevantBitsCount;
    
            for (let i = 0; i < occupancyIndicies; i++) {
                const occupancy = this.SetOccupancy(i, relevantBitsCount, this.BishopMasks[square]);
                const magicIndex = BigInt.asUintN(64, (occupancy * this.BishopMagicNumbers[square])) >> (64n - this.BishopRelevantBits[square])
                this.BishopAttacks[square][Number(magicIndex)] = this.GenerateBishopAttacksFly(square, occupancy);
            }
        }
    }
    
    InitRookAttacks() {
        for (let square = 0; square < 64; square++) {
            this.RookMasks[square] = this.GenerateRookMasks(square);
    
            const relevantBitsCount = this.CountBits(this.RookMasks[square]);
            const occupancyIndicies = 1 << relevantBitsCount;
    
            for (let i = 0; i < occupancyIndicies; i++) {
                const occupancy = this.SetOccupancy(i, relevantBitsCount, this.RookMasks[square]);
                const magicIndex = BigInt.asUintN(64, (occupancy * this.RookMagicNumbers[square])) >> (64n - this.RookRelevantBits[square])
                this.RookAttacks[square][Number(magicIndex)] = this.GenerateRookAttacksFly(square, occupancy);
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
    WriteTT(hash: bigint, depth: number, flag: HashFlag, score: number, move: number, ply: number) {
        // const entry = this.TranspositionTables.Entries[Number(hash % this.TranspositionTables.Size)];
        const index = Number(hash % this.TranspositionTables.Size);

        if (score > this.Checkmate) {
            score += ply;
        }

        if (score < -this.Checkmate) {
            score -= ply;
        }

        const entry: TTEntry = {
            BestMove: move,
            Depth: depth,
            Flag: flag,
            Hash: hash,
            Score: score,
        }

        this.TranspositionTables.Entries[index] = entry;
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
    ProbeTT(hash: bigint, depth: number, ply: number, alpha: number, beta: number) {
        const entry = this.TranspositionTables.Entries[Number(hash % this.TranspositionTables.Size)];

        let newScore = this.HashNoMove;

        if (!entry || entry.Hash !== hash) {
            return { ttScore: newScore, ttMove: 0 };
        }

        if (entry.Depth >= depth) {
            let score = entry.Score;

            if (score > this.Checkmate) {
                score -= ply;
            }

            if (score < -this.Checkmate) {
                score += ply;
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
    private readonly KnightAttacks: bigint[] = [];
    private readonly KingAttacks: bigint[] = [];
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

    readonly MGPieceValue = [90, 320, 350, 475, 950, 15000];
    readonly EGPieceValue = [100, 250, 280, 510, 975, 15000];

    PST = [
        // opening/middle game values
        [
            // pawn
            [
                0,   0,    0,   0,   0,   0,   0,    0, 
                -46, -48, -117, -21, -21, -48, -53, -117, 
                5, -11,   27, -10,  20,  88,  -6,  -11, 
                0,  -3,    3,  19,  17,  25,  -5,  -18, 
                -18,  -5,    8,  20,  20,  -7, -25,  -40, 
                -10, -10,   10,   2,  12,  -9,  12,   -2, 
                -20,  -5,  -11, -13,  -5,  27,  19,   -2, 
                0,   0,    0,   0,   0,   0,   0,    0,
            ],
            
            // knight
            [
                -227, -79, -67, -75,  13, -113, -113, -131, 
                -81, -56,  41,  25,  73,   41,    6,  -19, 
                -26,   4,  25,  73,  73,  113,   68,   13, 
                    5,   8,   5,  38,  20,   46,    8,   13, 
                -20, -10,  17,   5,  19,   22,    8,  -35, 
                -30, -10,   8,  20,  20,   10,   20,  -35, 
                -27, -35,  -9,  -5,  -5,   15,  -18,  -19, 
                -37, -19, -51, -19, -35,  -19,  -19,  -69,
            ],

            // bishop
            [
                -25, -41, -23, -41, -73, -41,  5, -51, 
                -41,   3, -15,   9,  22,  63,  7,  21, 
                -13,  -5,  58,  12,  68,  58, 31,  21, 
                -25,  -2,   7,  18,  22,   7,  8,  -9, 
                -17,   7,  15,  34,  30,  15, 23, -25, 
                21,  31,  10,  17,  17,  26, 23,  21, 
                -13,  28,  15,   8,   8,  31, 35,   5, 
                11, -17,   0,  -6, -17, -16,  4, -14,
            ],

            // rook
            [
                7,   2,  10,   1,  26,  26,   9,  -9, 
                -16, -21,  -5,  43,  11,  33,  63,  32, 
                -9,  -7,  -8,   5,   5,  21,  21,  21, 
                -30, -17,   5,   5,  -3,  21,  21,  16, 
                -30, -25, -25, -25, -17, -13,   4, -30, 
                -30, -25, -17,   0,  -3,  -5,   3,   0, 
                -30, -20, -20, -12, -12,   2,   2, -46, 
                -10, -12,   3,  15,  15,   3, -46, -18,
            ],

            // queen
            [
                -53, -10,  20,  31,  31,  78,   0, -16, 
                -48, -53, -21, -39, -11,  78,  30, 142, 
                -30, -25,   5,  21,  53,  73,  73,  73, 
                -30, -13, -12,  -3,   5,  21,   5,  21, 
                -11,  -3,  -3,  -3,   5,   5,  21,   2, 
                -17,  10,  -2,  10,   2,  10,  10,  -3, 
                -17,   5,  12,  12,  14,  20,  21,  11, 
                11,  -8,   0,  10,   5, -16, -35,  -6,
            ],

            // king
            [
                76,  13,  13,  13,  77,  13, -19,  13, 
                13,  13,  13,  11,  13,  13, -49, -19, 
                -19,  77,  13,  13, -22,  13,  13, -19, 
                -19, -19,  13,  -9, -65, -35, -19, -51, 
                -9,  -9, -19, -39, -42, -55, -33, -41, 
                -1,   1, -45, -61, -45, -37, -15, -15, 
                36,  -5, -15, -73, -41,  -9,  17,  20, 
                -31,  31,   5, -61,  10, -27,  33,  31,
            ]
        ],
        // end game values
        [
            // pawn
            [
                0,  0,   0,   0,   0,  0,  0,   0, 
                66, 61,  63,  15,  -1, 15, 45,  42, 
                51, 51,  35,  17,   5, 13, 35,  51, 
                22,  8,   5, -11, -11, -8,  7,  14, 
                9,  3, -16, -22, -22, -8,  6,   3, 
                -10, -3, -11,  -3,  -7, -3, -3, -10, 
                2, -2,  14,  -6,  -6, -2,  2, -14, 
                0,  0,   0,   0,   0,  0,  0,   0,
            ],

            // knight
            [
                21, -25,  1,  1,  1, -15, -25, -75, 
                -9,  15,  5,  5,  5,  -3, -15, -25, 
                -6,   7, 41, 36, 20,  25,   8,   2, 
                4,  41, 46, 48, 38,  30,  16,  12, 
                6,  25, 46, 45, 47,  22,  11,  20, 
                10,  16, 20, 53, 53,  20,  13,  -1, 
                0,   4,  5, 27, 22,  21,   5,  11, 
                -37, -39,  1,  1,  1,  33, -39, -37,
            ],

            // bishop
            [
                -5, -15, -7,  5,  9,  1,  -7,   3, 
                1,   6, 10,  2, 12,  4,   2, -31, 
                6,  20, 22, 25, 17, 30,  12,  15, 
                15,  20, 25, 28, 31, 13,  20,  -1, 
                11,  12, 25, 28, 20, 25,   2,   1, 
                5,  12, 38, 25, 41, 22, -11,  -3, 
                0, -11, 10, 15, 30, 12,  10, -11, 
                -17,   9, -9,  0,  9,  9, -15,   3,
            ],

            // rook
            [
                23, 21, 18,  15,  10,   6,   8,  12, 
                14, 20, 20,   3,   7,  10,  -6,  -1, 
                11,  8,  6,   2,   1,   4,   4,  -5, 
                7,  2,  3,   0,  -2,   0,  -7,  -5, 
                3, -2,  2,   2,   2,  -2, -10,  -5, 
                -12, -6, -6, -12, -16, -12, -20, -20, 
                -12, -8, -6, -12, -12, -10, -12,  -4, 
                -13, -3, -7, -14, -22,  -9,  12, -33,
            ],

            // queen
            [
                32,  15,  17,  25,  25,  14,   0,   38, 
                36,  21,  21,  73,  41,  46,  46, -112, 
                -10,   3,  25,  19,  51,   9,   9,  -28, 
                -14,  16,  13,  33,  61,  51,  36,    4, 
                -11,   8,  13,  45,  37,  27,  20,    0, 
                -30, -26,  24,  -5,  23,   9,  20,  -10, 
                -8,  -3, -11,  -9, -11, -24, -37,  -37, 
                -19, -33, -25, -29, -29, -33, -31,  -53,
            ],

            // king
            [
                -57, -20, -23, -15, -15,   1,  -4,  -45, 
                -20,  10,   0,   0,   0,  23,  23,   -4, 
                -15,  13,   8,   7,  12,  28,  33,    1, 
                -29,   1,  13,  15,  23,  23,  15,    1, 
                -37,  -7,  13,  19,  20,  22,   7,  -15, 
                -33,  -7,   8,  17,  17,  16,   7,  -15, 
                -38, -13,   3,   7,   7,   9,  -4,  -28, 
                -47, -38, -22, -15, -39, -17, -38, -201,
            ]
        ]
    ];

    private readonly PhaseValues = [0, 1, 1, 2, 4, 0];
    readonly MGdoubledPenalty = 2;
    readonly EGdoubledPenalty = 15;
    readonly MGisolatedPenalty = 20;
    readonly EGisolatedPenalty = 2;
    readonly MGfileSemiOpenScore = 10;
    readonly MGfileOpenScore = 25;
    readonly MGpassedBonus = [0, 5, 1,  3, 15, 30, 100, 0];
    readonly EGpassedBonus = [0, 0, 4, 10, 25, 60, 120, 0];
    readonly MGrookQueenFileBonus = 7;
    readonly MGKnightOutpostBonus = 15;
    readonly EGKnightOutpostBonus = 5;

    readonly PhaseTotal = (this.PhaseValues[Pieces.Knight] * 4) + (this.PhaseValues[Pieces.Bishop] * 4) + (this.PhaseValues[Pieces.Rook] * 4) + (this.PhaseValues[Pieces.Queen] * 2);

    Evaluate() {
        let mgScores = [0, 0];
        let egScores = [0, 0];
        let phase = this.Position.Phase;

        let board = (this.Position.OccupanciesBB[Color.White] | this.Position.OccupanciesBB[Color.Black])
                    & ~(this.Position.PiecesBB[Color.White][Pieces.Pawn] | this.Position.PiecesBB[Color.Black][Pieces.Pawn]);

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

        while (board) {
            let square = this.GetLS1B(board);
            let actualSquare = square;
            board = this.RemoveBit(board, square);
            const piece = this.Position.Squares[square];

            // Because the PST are from white's perspective, we have to flip the square if the piece is black's
            if (piece.Color === Color.Black) {
                square ^= 56;
            }

            switch (piece.Type) {
                case Pieces.Knight: {
                    mgScores[piece.Color] += this.PST[0][Pieces.Knight][square] + this.MGPieceValue[Pieces.Knight];
                    egScores[piece.Color] += this.PST[1][Pieces.Knight][square] + this.EGPieceValue[Pieces.Knight];

                    // Knight outposts
                    if (this.PawnAttacks[piece.Color ^ 1][actualSquare] & this.Position.PiecesBB[piece.Color][Pieces.Pawn]
                        && (this.PawnAttacks[piece.Color][actualSquare] & this.Position.PiecesBB[piece.Color ^ 1][Pieces.Pawn]) === 0n) {
                        mgScores[piece.Color] += this.MGKnightOutpostBonus;
                        egScores[piece.Color] += this.EGKnightOutpostBonus;
                    }

                    break;
                }
                case Pieces.Bishop: {
                    mgScores[piece.Color] += this.PST[0][Pieces.Bishop][square] + this.MGPieceValue[Pieces.Bishop];
                    egScores[piece.Color] += this.PST[1][Pieces.Bishop][square] + this.EGPieceValue[Pieces.Bishop];
                    break;
                }
                case Pieces.Rook: {
                    mgScores[piece.Color] += this.PST[0][Pieces.Rook][square] + this.MGPieceValue[Pieces.Rook];
                    egScores[piece.Color] += this.PST[1][Pieces.Rook][square] + this.EGPieceValue[Pieces.Rook];

                    // open file bonus
                    if (((this.Position.PiecesBB[piece.Color][Pieces.Pawn] | this.Position.PiecesBB[piece.Color ^ 1][Pieces.Pawn]) & this.fileMasks[square]) === 0n) {
                        mgScores[piece.Color] += this.MGfileOpenScore;
                    }

                    // semi-open file bonus
                    if ((this.Position.PiecesBB[piece.Color ^ 1][Pieces.Pawn] & this.fileMasks[square]) && (this.Position.PiecesBB[piece.Color][Pieces.Pawn] & this.fileMasks[square]) === 0n) {
                        mgScores[piece.Color] += this.MGfileSemiOpenScore;
                    }

                    // Bonus if rook is on the same file as opponent's queen
                    if (this.fileMasks[square] & this.Position.PiecesBB[piece.Color ^ 1][Pieces.Queen]) {
                        mgScores[piece.Color] += this.MGrookQueenFileBonus;
                    }
                    break;
                }
                case Pieces.Queen: {
                    mgScores[piece.Color] += this.PST[0][Pieces.Queen][square] + this.MGPieceValue[Pieces.Queen];
                    egScores[piece.Color] += this.PST[1][Pieces.Queen][square] + this.EGPieceValue[Pieces.Queen];
                    break;
                }
                case Pieces.King: {
                    mgScores[piece.Color] += this.PST[0][Pieces.King][square] + this.MGPieceValue[Pieces.King];
                    egScores[piece.Color] += this.PST[1][Pieces.King][square] + this.EGPieceValue[Pieces.King];
                    break;
                }
            }
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

        // The main iterative deepening search loop
        for (let depth = 1; depth <= targetDepth; depth++) {            
            pv.moves.length = 0;

            let margin = depth >= 4 ? 25 : this.Inf;

            // Aspiration window
            while (!this.Timer.stop) {
                alpha = Math.max(score - margin, -this.Inf);
                beta = Math.min(score + margin, this.Inf);

                score = this.Negamax(depth, 0, alpha, beta, pv);

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

            if (score > this.Checkmate || score < -this.Checkmate) {
                break;
            }
        }

        console.log(`bestmove ${bestmove}`);
        return bestmove;
    }

    Negamax(depth: number, ply: number, alpha: number, beta: number, pvMoves: PVLine, nullMoveAllowed = true) {
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
            return this.Quiescence(alpha, beta, ply);
        }

        // Check for draw positions (3-fold)
        if (ply > 0 && this.IsRepetition()) {
            return 0;
        }

        // Check the transposition table for matching position and score
        const { ttScore, ttMove } = this.ProbeTT(this.Position.Hash, depth, ply, alpha, beta);
        if (ttScore !== this.HashNoMove && ply !== 0) {
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
                let score = -this.Negamax(depth - 1 - R, ply + 1, -beta, 1 - beta, childPVMoves, false);

                this.UnmakeNullMove();

                childPVMoves.moves.length = 0;

                if (score >= beta) {
                    return beta;
                }
            }
        }

        let moves = this.GenerateMoves();
        moves = this.SortMoves(moves, ttMove, ply);

        for (let i = 0; i < moves.length; i++) {
            const move = moves[i];

            // Futility pruning
            if (canFutilityPrune && legalMoves > 1 && !this.MoveIsCapture(move) && !this.MoveIsPromotion(move)) {
                continue;
            }

            if (!this.MakeMove(move)) {
                this.UnmakeMove(move);
                continue;
            }

            legalMoves++;

            let score = 0;

            // Principal Variation Search
            // Move ordering should put the PV move first
            // First do a full search on the PV nodes and then compare other nodes to that score
            if (legalMoves === 1) {
                score = -this.Negamax(depth - 1, ply + 1, -beta, -alpha, childPVMoves);
            }
            else {
                let R = 0;

                if (depth >= 3 && legalMoves >= 4 && !isPVNode && !inCheck) {
                    R = Math.log(depth * legalMoves ** 2) * 0.45;
                }

                score = -this.Negamax(depth - 1 - R, ply + 1, -alpha - 1, -alpha, childPVMoves);

                if (score > alpha) {
                    score = -this.Negamax(depth - 1, ply + 1, -beta, -alpha, childPVMoves);
                }
            }

            this.UnmakeMove(move);

            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }

            if (score > alpha) {
                alpha = score;
                flag = HashFlag.Exact;

                // update the PV line
                pvMoves.moves.length = 0;
                pvMoves.moves.push(move);
                pvMoves.moves.push(...childPVMoves.moves);

                // increment history counter if the move is not a capture
                if (!this.MoveIsCapture(move)) {
                    this.search.history[this.Position.SideToMove][move & 0x3f][(move & 0xfc0) >> 6] += depth * depth;
                }
            }

            if (score >= beta) {
                flag = HashFlag.Beta;

                // if the move is not a capture, we should check for a killer move and/or increment the history counter
                if (!this.MoveIsCapture(move)) {
                    // Store the move if it's a killer
                    this.search.killers[1][ply] = this.search.killers[0][ply];
                    this.search.killers[0][ply] = move;

                    // increment history counter
                    this.search.history[this.Position.SideToMove][move & 0x3f][(move & 0xfc0) >> 6] += depth * depth;
                }

                break;
            }

            childPVMoves.moves.length = 0;
        }

        // If there are no legal moves, check for checkmate or stalemate
        if (legalMoves === 0) {
            // If checkmate, returns an infinity score with the current play added to it (so faster checkmates will be scored higher)
            if (inCheck) {
                return -this.Inf + ply;
            }
            // If no available moves and not checkmate, then it's a stalemate
            else {
                return 0;
            }
        }

        this.WriteTT(this.Position.Hash, depth, flag, bestScore, bestMove, ply);

        return bestScore;
    }

    Quiescence(alpha: number, beta: number, ply: number) {
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
        const { ttScore, ttMove } = this.ProbeTT(this.Position.Hash, 0, ply, alpha, beta);
        if (ttScore !== this.HashNoMove && ply !== 0) {
            return ttScore;
        }

        let bestMove = ttMove;
        let bestScore = ttScore;

        if (bestScore === this.HashNoMove) {
            bestScore = this.Evaluate();
        }

        if (bestScore >= beta) {
            return bestScore;
        }

        if (bestScore > alpha) {
            alpha = bestScore;
        }

        let moves = this.GenerateMoves(true);
        moves = this.SortMoves(moves, bestMove, ply);

        for (let i = 0; i < moves.length; i++) {
            const move = moves[i];

            if (!this.MakeMove(move)) {
                this.UnmakeMove(move);
                continue;
            }

            let score = -this.Quiescence(-beta, -alpha, ply);

            this.UnmakeMove(move);

            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }

            if (score >= beta) {
                this.WriteTT(this.Position.Hash, 0, HashFlag.Beta, bestScore, bestMove, ply);
                return bestScore;
            }

            if (score > alpha) {
                flag = HashFlag.Exact;
                alpha = score;
            }
        }

        this.WriteTT(this.Position.Hash, 0, flag, bestScore, bestMove, ply);

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
    SortMoves(moves: Move[], ttMove: Move, ply: number) {
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

                if (move >> 12 === MoveType.EPCapture) {
                    capturedPiece = this.Position.Squares[this.Position.SideToMove === Color.White ? ((move & 0xfc0) >> 6) + 8 : ((move & 0xfc0) >> 6) - 8];
                }

                const score = this.MGPieceValue[capturedPiece.Type] - movingPiece.Type + 10000;
                scores.push({ move, score });
            }
            else {
                if (move === this.search.killers[0][ply]) {
                    scores.push({ move, score: 9000 });
                }
                else if (move === this.search.killers[1][ply]) {
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

        if (!attackedPiece) {
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

        let bishopQueens = this.Position.PiecesBB[Color.White][Pieces.Bishop] | this.Position.PiecesBB[Color.Black][Pieces.Bishop]
                        | this.Position.PiecesBB[Color.White][Pieces.Queen] | this.Position.PiecesBB[Color.Black][Pieces.Queen];
        bishopQueens &= this.GenerateBishopAttacks(square);

        let rookQueens = this.Position.PiecesBB[Color.White][Pieces.Rook] | this.Position.PiecesBB[Color.Black][Pieces.Rook]
                        | this.Position.PiecesBB[Color.White][Pieces.Queen] | this.Position.PiecesBB[Color.Black][Pieces.Queen];
        rookQueens &= this.GenerateRookAttacks(square);

        return pawns | knights | kings | bishopQueens | rookQueens;
    }

    ConsiderXRays(square: Square) {
        let bishopQueens = this.Position.PiecesBB[Color.White][Pieces.Bishop] | this.Position.PiecesBB[Color.Black][Pieces.Bishop]
                        | this.Position.PiecesBB[Color.White][Pieces.Queen] | this.Position.PiecesBB[Color.Black][Pieces.Queen];
        bishopQueens &= this.GenerateBishopAttacks(square);

        let rookQueens = this.Position.PiecesBB[Color.White][Pieces.Rook] | this.Position.PiecesBB[Color.Black][Pieces.Rook]
                        | this.Position.PiecesBB[Color.White][Pieces.Queen] | this.Position.PiecesBB[Color.Black][Pieces.Queen];
        rookQueens &= this.GenerateRookAttacks(square);

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
            // if (this.Position.Ply < 15 || this.Position.Ply > 25) {
            //     movesleft = 40 - this.Position.Ply;
            // }
            // else {
            //     movesleft = 20;
            // }
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
        const to = (toRank * 8) + toFile;

        const piece = this.Position.Squares[from].Type;
        let moveType: MoveType = 0;

        // If the move has 5 characters, the 5th is a promotion
        if (move.length === 5) {
            const promotion = move.charAt(4);

            // UCI notation does not differentiate between promotions and promotion captures
            if (promotion === "n") {
                moveType = MoveType.KnightPromotion;
            }
            else if (promotion === "b") {
                moveType = MoveType.BishopPromotion;
            }
            else if (promotion === "r") {
                moveType = MoveType.RookPromotion;
            }
            else if (promotion === "q") {
                moveType = MoveType.QueenPromotion;
            }
        }
        else if (piece === Pieces.Pawn && Math.abs(from - to) === 16) {
            moveType = MoveType.DoublePawnPush;
        }
        // Check if the move was a castling move
        else if ((move === "e1g1" || move === "e8g8") && piece === Pieces.King) {
            moveType = MoveType.KingCastle;
        }
        else if ((move === "e1c1" || move === "e8c8") && piece === Pieces.King) {
            moveType = MoveType.QueenCastle;
        }
        // If en passant capture
        else if (to === this.Position.EnPassSq && piece === Pieces.Pawn) {
            moveType = MoveType.EPCapture;
        }
        // If there's a piece on the to square, it's a capture
        else if (this.Position.Squares[to]) {
            moveType = MoveType.Capture;
        }
        // If none of the above, it's a quiet move
        else {
            moveType = MoveType.Quiet;
        }
        
        return this.EncodeMove(from, to, moveType);
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

    Perft(depth: number) {
        this.totalNodes = 0;
        const start = performance.now();
    
        const moves = this.GenerateMoves();
    
        for (let i = 0; i < moves.length; i++) {
            const move = moves[i];
    
            // Skip the move if it puts the king into check
            if (this.MakeMove(move)) {
                let nodes = this.PerftDriver(depth - 1);
    
                console.log(`${this.PrettyPrintMove(move)}: ${nodes}`);
            }
    
            this.UnmakeMove(move);
        }
    
        const end = performance.now();
        console.log(`Nodes: ${this.totalNodes.toLocaleString()}. Time taken: ${end - start}`);
    
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
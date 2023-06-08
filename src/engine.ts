declare const __VERSION__: string;

/**
 * ENUMS
 */

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

export const enum PieceType {
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

export const enum Direction {
    NORTH = 8,
    SOUTH = -8,
    EAST = 1,
    WEST = -1,
    NORTHWEST = 9,
    NORTHEAST = 7,
    SOUTHEAST = -9,
    SOUTHWEST = -7,
}

export const enum MoveFlag {
    Promotion = 8,
    Capture = 4,
    Special_1 = 2,
    Special_0 = 1,
}

export const enum MoveType {
    Quiet,
    DoublePawnPush,
    KingCastle,
    QueenCastle,
    Capture,
    EPCapture,
    KnightPromotion = 8,
    BishopPromotion,
    RookPromotion,
    QueenPromotion,
    KnightPromotionCapture,
    BishopPromotionCapture,
    RookPromotionCapture,
    QueenPromotionCapture,
}

const enum HashFlag {
    Exact,
    Alpha,
    Beta,
}

/**
 * INTERFACES
 */

export interface Piece {
    Type: PieceType
    Color: Color
}

export interface BoardState {
    PiecesBB: BigUint64Array
    OccupanciesBB: BigUint64Array
    Squares: (Piece | undefined)[]
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

interface StateCopy {
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
    EnPassant: BigUint64Array
    Castle: BigUint64Array
    SideToMove: bigint
}

interface TTEntry {
    Hash: bigint // 8 bytes
    Move: number // 2 bytes
    Depth: number // 1 bytes
    Score: number // 2 bytes
    Flag: HashFlag // 1 byte
}

interface PawnEntry {
    Hash: bigint
    Mg: number
    Eg: number
    SideToMove: Color
}

class Khepri {
    constructor() {
        this.Init();
        this.InitHashes();
    }

    readonly name = "KhepriChess";
    readonly version = __VERSION__; // replaced by webpack
    readonly author = "Kurt Peters";

    // Test positions
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

    // Flag to indicate if the game is Chess960/Fischer Random
    isChess960 = false;

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
    ];

    /* Used when loading a position from FEN */
    private readonly CharToPiece = new Map([
        ["P", { Type: PieceType.Pawn, Color: Color.White }],
        ["N", { Type: PieceType.Knight, Color: Color.White }],
        ["B", { Type: PieceType.Bishop, Color: Color.White }],
        ["R", { Type: PieceType.Rook, Color: Color.White }],
        ["Q", { Type: PieceType.Queen, Color: Color.White }],
        ["K", { Type: PieceType.King, Color: Color.White }],
        ["p", { Type: PieceType.Pawn, Color: Color.Black }],
        ["n", { Type: PieceType.Knight, Color: Color.Black }],
        ["b", { Type: PieceType.Bishop, Color: Color.Black }],
        ["r", { Type: PieceType.Rook, Color: Color.Black }],
        ["q", { Type: PieceType.Queen, Color: Color.Black }],
        ["k", { Type: PieceType.King, Color: Color.Black }],
    ]);

    /**
     * Return a color-agnostic (capitalized) string character representing the piece
     */
    private readonly PieceToChar = new Map([
        [PieceType.Pawn, "P"],
        [PieceType.Knight, "N"],
        [PieceType.Bishop, "B"],
        [PieceType.Rook, "R"],
        [PieceType.Queen, "Q"],
        [PieceType.King, "K"],
    ]);

    private readonly Zobrist: Zobrist = {
        Pieces: Array.from(Array(2), () => Array.from(Array(6), () => new Array(64))),
        EnPassant: new BigUint64Array(64),
        Castle: new BigUint64Array(16),
        SideToMove: 0n,
    }

    private readonly PhaseValues = [0, 1, 1, 2, 4, 0];
    readonly PhaseTotal = (this.PhaseValues[PieceType.Knight] * 4) + (this.PhaseValues[PieceType.Bishop] * 4) + (this.PhaseValues[PieceType.Rook] * 4) + (this.PhaseValues[PieceType.Queen] * 2);

    private readonly BoardHistory: bigint[] = [];

    readonly BoardState: BoardState = {
        PiecesBB: new BigUint64Array(12), // 12 boards, one for each pieces and color
        OccupanciesBB: new BigUint64Array(2), // 2 boards, 1 for each color
        Squares: new Array(64).fill(undefined), // 64 squares, initialized to 0
        SideToMove: Color.White,
        EnPassSq: Square.no_sq,
        HalfMoves: 0,
        Ply: 0,
        Hash: 0n,
        PawnHash: 0n,
        Phase: this.PhaseTotal,
        CastlingRights: 0,
        CastlingPaths: [],
        CastlingRookSquares: [],
        CastlingSquaresMask: new Array(64).fill(15),
    };

    readonly rankMasks: BigUint64Array = new BigUint64Array(64); // mask is done per square
    readonly fileMasks: BigUint64Array = new BigUint64Array(64); // mask is done per square
    readonly isolatedMasks: BigUint64Array = new BigUint64Array(64); // mask is done per square
    readonly passedMasks: bigint[][] = Array(2).fill(0).map(() => Array(64).fill(0)); // passed pawn masked (all squares ahead in the same file and both adjacent files)
    private readonly betweenMasks: bigint[][] = Array(64).fill(0n).map(() => Array(64).fill(0n)); // mask of all squares between two
    readonly attackRays: bigint[][] = Array.from(Array(3), () => new Array(64).fill(0n)); // sliding piece attacks on an empty board
    readonly squareBB: BigUint64Array = new BigUint64Array(64); // Bitboard for single set square
    readonly distanceBetween: Square[][] = Array(64).fill(0n).map(() => Array(64).fill(0n)); // distance between two squares

    private readonly notAFile = 18374403900871474942n;
    private readonly notHFile = 9187201950435737471n;
    private readonly notHGFile = 4557430888798830399n;
    private readonly notABFile = 18229723555195321596n;

    readonly PawnAttacks: BigUint64Array = new BigUint64Array(128); // both white and black attacks, so 128
    readonly KnightAttacks: BigUint64Array = new BigUint64Array(64);
    readonly KingAttacks: BigUint64Array = new BigUint64Array(64);
    private readonly BishopMasks: BigUint64Array = new BigUint64Array(64);
    private readonly BishopAttacks: bigint[][] = Array.from(Array(64), () => new Array(512));
    private readonly RookMasks: BigUint64Array = new BigUint64Array(64);
    private readonly RookAttacks: bigint[][] = Array.from(Array(64), () => new Array(4096));

    private readonly BishopMagicNumbers = [
        0x2004200884050840n, 0x410100220842020n, 0x4008108408800844n, 0x4188204040844200n, 0x2044030841204080n, 0x5008229010048001n, 0x48809008228000n, 0xa00210050100800n,
        0x40121020020c006an, 0x1441004012828n, 0x5188202420508n, 0x1106404208c00a1n, 0x2820884841010000n, 0x1800020802480841n, 0x48440048041008c0n, 0x128c1a020686a800n,
        0x4808011191100080n, 0x885402008208102n, 0x204000818002008n, 0x28000c204010a0n, 0x204a000404a20020n, 0x4001000020a01000n, 0x9008912044100888n, 0x5603c082090901n,
        0x6620700048230800n, 0x18100d00820c1c02n, 0x49222002c040403n, 0x20808088020002n, 0x4038c000280201an, 0x2080836809011n, 0x102008432280100n, 0x201c302011280n,
        0x121008040122c400n, 0x104014801200211n, 0x3800223400080800n, 0x14020080480080n, 0x2004040400001010n, 0xd0510040460041n, 0x1180082010460n, 0x4208c0040370504n,
        0x12010440002200n, 0x40104208440020a0n, 0x1d0c0048001404n, 0x804204010452200n, 0xa08102010401208n, 0x230115001002020n, 0x2008028082040402n, 0x408080060480380n,
        0x1010802402080n, 0x403088090086800n, 0x20a0020201041000n, 0x200a8042420e0800n, 0x8004008a1010400n, 0x910230010004n, 0xc0100200811040n, 0x2202102307050410n,
        0x20208200904000n, 0x4002104100411n, 0x8010000044040490n, 0xa0008040840400n, 0x1006001110121201n, 0xc00c4088017108n, 0x2800080210020210n, 0x60200a1002018910n, 
    ];

    private readonly RookMagicNumbers = [
        0x80016418400081n, 0x40004010002000n, 0x48020011000800an, 0xc800c8290000800n, 0x200080420020010n, 0x8100020400080100n, 0x8080008002000100n, 0xe10000c600288100n,
        0x800080304000n, 0xa00210a004081n, 0xb0080200010008an, 0x8808008001000n, 0x1004808004000800n, 0x92000600508c08n, 0x100400040102d018n, 0x8004e9000a80n,
        0x21b4228000400082n, 0x41010020804000n, 0x208c110020090040n, 0x2030010020081100n, 0x300808008000400n, 0x9202008080040002n, 0x400804000201b008n, 0x1060020004008041n,
        0x36846080034000n, 0x208040008020008cn, 0x200080100080n, 0x2088100080080080n, 0x1800808004000an, 0x812040080020080n, 0x8041010400100802n, 0x904a482000c00c3n,
        0x40204000800080n, 0x40201008400041n, 0xa10040800200020n, 0x380801004800800n, 0x804000800800480n, 0x184800200800400n, 0x1002100104004882n, 0x240186000943n,
        0x100802040188000n, 0x890004020004000n, 0x4810080400202000n, 0x2c00100008008080n, 0x8000805010010n, 0x200c010002004040n, 0x1001c21011340048n, 0x4084146081020004n,
        0x102002080410200n, 0xa004088210200n, 0x804200281200n, 0x100008008080n, 0x110a080081040080n, 0x4010002004040n, 0x400c08294a100400n, 0x12441080410a00n,
        0x608880f1020240a2n, 0x108025004202n, 0xa4c401020000d01n, 0x19000410000821n, 0x4052009120080402n, 0x2000884011002n, 0x20c100104b2080cn, 0xc04104100840022n, 
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

    /**
     * Resets the board/game state (start position is NOT automatically loaded)
     */
    Reset() {
        this.BoardHistory.length = 0;
        this.BoardState.PiecesBB = new BigUint64Array(12);
        this.BoardState.OccupanciesBB = new BigUint64Array(2);
        this.BoardState.Squares = new Array(64).fill(undefined);
        this.BoardState.SideToMove = Color.White;
        this.BoardState.EnPassSq = Square.no_sq;
        this.BoardState.HalfMoves = 0;
        this.BoardState.Ply = 0;
        this.BoardState.PawnHash = 0n;
        this.BoardState.Phase = this.PhaseTotal;
        this.BoardState.CastlingRights = 0;
        this.BoardState.CastlingPaths = [],
        this.BoardState.CastlingRookSquares = [],
        this.BoardState.CastlingSquaresMask = new Array(64).fill(15);

        this.ResizeTranspositionTable(32);
        this.ResizePawnTable(4);

        this.nodesSearched = 0;
        this.pvArray = Array(this.MAXPLY).fill(0).map(() => Array(this.MAXPLY).fill(0));
        this.pvLength = Array(this.MAXPLY).fill(0);
        this.killerMoves = Array(this.MAXPLY).fill(0).map(() => Array(2).fill(0));
        this.historyMoves = Array(2).fill(0).map(() => Array(64).fill(0).map(() => Array(64).fill(0)));
        this.counterMoves = Array(64).fill(0).map(() => Array(64).fill(0));

        // todo: should reset timer
    }

    private PRNG_SEED = 192085716n;
    
    /**
     * Generates a random 64-bit number
     * see https://vigna.di.unimi.it/ftp/papers/xorshift.pdf
     */
    Random64() {
        let s = this.PRNG_SEED;

        s ^= s >> 12n;
        s ^= BigInt.asUintN(64, s << 25n);
        s ^= s >> 27n;

        this.PRNG_SEED = s;

        return BigInt.asUintN(64, s * 2685821657736338717n);

        // generate "actual" random numbers (unseedable)
        // return crypto.getRandomValues(new BigUint64Array(1))[0];
    }

    /**
     * Generates magic numbers for sliding piece attacks
     * @param type Rook or bishop piece to generate magics for
     */
    FindMagics(type: PieceType.Bishop | PieceType.Rook) {
        const occupancies = new BigUint64Array(4096);
        const attacks = new BigUint64Array(4096);
        
        const bishop = type === PieceType.Bishop;

        for (let square = Square.a8; square <= Square.h1; square++) {
            let magic = 0n;
            const mask = bishop ? this.GenerateBishopMasks(square) : this.GenerateRookMasks(square);
            const shift = bishop ? this.BishopRelevantBits[square] : this.RookRelevantBits[square];
            const n = Number(this.CountBits(mask));

            for (let index = 0; index < (1 << n); index++) {
                occupancies[index] = this.SetOccupancy(index, n, mask);
                attacks[index] = bishop ? this.GenerateBishopAttacksFly(square, occupancies[index]) : this.GenerateRookAttacksFly(square, occupancies[index]);
            }

            while (true) {
                magic = BigInt.asUintN(64, this.Random64() & this.Random64() & this.Random64());
    
                // skip bad magic numbers
                if (this.CountBits(BigInt.asUintN(64, (mask * magic)) & 0xFF00000000000000n) < 6) {
                    continue;
                }

                const used = new BigUint64Array(4096);

                let failed = false;
                for (let i = 0; i < (1 << n); i++) {
                    const index = Number(BigInt.asUintN(64, (occupancies[i] * magic)) >> (64n - shift));
                    if (used[index] === 0n) {
                        used[index] = attacks[i];
                    }
                    // magic index doesn't work
                    else if (used[index] !== attacks[i]) {
                        failed = true;
                        break;
                    }
                }
                if (!failed) {
                    console.log(`Square: ${square} magic: 0x${magic.toString(16)}`);
                    break;
                }
            }
        }
    }

    /****************************
     * 
     *    Bitboard Operations
     *
     ****************************/

    /** Set a bit on the square of the board */
    SetBit(board: bigint, square: Square) {
        return board |= 1n << this.SquareBigInt[square];
    }

    /** Remove a bit on the square of the board */
    RemoveBit(board: bigint, square: Square) {
        return board &= ~(1n << this.SquareBigInt[square]);
    }

    /** Get a bit on the square of the board */
    GetBit(board: bigint, square: Square) {
        return board & (1n << this.SquareBigInt[square]);
    }

    /** Count the number of set bits on the board */
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

    /** Get the square of the lowest set bit on the board */
    GetLS1B(bitboard: bigint) {
        return this.CountBits((bitboard & -bitboard) - 1n);
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

    /**
     * Shifts the bitboard one square in the given direction
     * @returns The shifted bitboard
     */
    Shift(board: bigint, direction: Direction) {
        switch (direction) {
            case Direction.NORTH: {
                return board >> 8n;
            }
            case Direction.SOUTH: {
                return BigInt.asUintN(64, board << 8n);
            }
            case Direction.EAST: {
                return (board & this.notHFile) << 1n;
            }
            case Direction.WEST: {
                return (board & this.notAFile) >> 1n;
            }
            case Direction.NORTHWEST: {
                return (board & this.notAFile) >> 9n;
            }
            case Direction.NORTHEAST: {
                return (board & this.notHFile) >> 7n;
            }
            case Direction.SOUTHEAST: {
                return (board & this.notHFile) << 9n;
            }
            case Direction.SOUTHWEST: {
                return (board & this.notAFile) << 7n;
            }
        }
    }

    Fill(direction: Direction.NORTH | Direction.SOUTH, square: Square) {
        let board = this.squareBB[square];

        if (direction === Direction.NORTH) {
            board |= (board >> 8n);
            board |= (board >> 16n);
            board |= (board >> 32n);
        }
        else {
            board |= (board << 8n);
            board |= (board << 16n);
            board |= (board << 32n);
        }

        return this.Shift(board, direction);;
    }

    /****************************
     * 
     *       Initialize
     *
     ****************************/
    Init() {
        const m1 = -1n;
        const a2a7 = 0x0001010101010100n;
        const b2g7 = 0x0040201008040200n;
        const h1b7 = 0x0002040810204080n;
        let btwn, line, rank, file;
        
        for (let square = Square.a8; square <= Square.h1; square++) {
            this.squareBB[square] = this.SetBit(0n, square);
            this.rankMasks[square] = 0xffn << (BigInt(square) & 56n);
            this.fileMasks[square] = 0x0101010101010101n << (BigInt(square) & 7n);
            this.isolatedMasks[square] = (this.fileMasks[square] & this.notHFile) << 1n | (this.fileMasks[square] & this.notAFile) >> 1n;

            /* * * * * * * * * * * * * * * * * * * *
             *
             * Pawn, knight, king attack masks
             *
             * * * * * * * * * * * * * * * * * * * */
            this.PawnAttacks[square] = this.MaskPawnAttacks(Color.White, square);
            this.PawnAttacks[square + 64] = this.MaskPawnAttacks(Color.Black, square);
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
             * Sliding piece attacks on an empty board
             *
             * * * * * * * * * * * * * * * * * * * * * * * * */
            this.attackRays[PieceType.Bishop - PieceType.Bishop][square] = this.GenerateBishopAttacks(0n, square);
            this.attackRays[PieceType.Queen - PieceType.Bishop][square] |= this.attackRays[PieceType.Bishop - PieceType.Bishop][square];
            this.attackRays[PieceType.Rook - PieceType.Bishop][square] = this.GenerateRookAttacks(0n, square);
            this.attackRays[PieceType.Queen - PieceType.Bishop][square] |= this.attackRays[PieceType.Rook - PieceType.Bishop][square];

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

    InitHashes() {
        // Init piece keys
        for (let piece = PieceType.Pawn; piece <= PieceType.King; piece++) {
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

    GenerateHashes() {
        let hash = 0n;
        let pawnHash = 0n;

        // Add the hashes of individual pieces
        for (let square = Square.a8; square <= Square.h1; square++) {
            const piece = this.BoardState.Squares[square];

            if (piece) {
                hash ^= this.Zobrist.Pieces[piece.Color][piece.Type][square];

                if (piece.Type === PieceType.Pawn) {
                    pawnHash ^= this.Zobrist.Pieces[piece.Color][PieceType.Pawn][square];
                }
            }
        }

        // Add the en passant hash
        if (this.BoardState.EnPassSq !== Square.no_sq) {
            hash ^= this.Zobrist.EnPassant[this.BoardState.EnPassSq];
        }

        // Add the castling hash
        hash ^= this.Zobrist.Castle[this.BoardState.CastlingRights];

        // Add the side to move hash
        if (this.BoardState.SideToMove === Color.Black) {
            hash ^= this.Zobrist.SideToMove;
        }

        return { hash, pawnHash };
    }

    /****************************
     * 
     *       Attack masks
     *
     ****************************/

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

    /****************************
     * 
     *     Move Generation
     *
     ****************************/

    EncodeMove(from: Square, to: Square, type: MoveType) {
        return ((type & 0xf) << 12) | ((from & 0x3f) << 6) | (to & 0x3f);
    }

    MoveType(move: number): MoveType {
        return (move >> 12) & 0x0f;
    }

    HasFlag(move: number, flag: MoveFlag) {
        return ((move >> 12) & flag) !== 0;
    }

    IsCapture(move: number) {
        return ((move >> 12) & MoveFlag.Capture) !== 0;
    }

    IsPromotion(move: number) {
        return ((move >> 12) & MoveFlag.Promotion) !== 0;
    }

    MoveTo(move: number) {
        return move & 0x3f;
    }

    MoveFrom(move: number) {
        return (move >> 6) & 0x3f;
    }

    IsCastle(move: number) {
        return this.MoveType(move) === MoveType.KingCastle || this.MoveType(move) === MoveType.QueenCastle;
    }

    StringifyMove(move: number) {
        const from = this.MoveFrom(move);
        let to = this.MoveTo(move);
        const type = this.MoveType(move);

        if (this.IsCastle(move) && !this.isChess960) {
            to = to > from ? to - 1 : to + 2;
        }

        let prettymove = `${Square[from]}${Square[to]}`;
        if (this.HasFlag(move, MoveFlag.Promotion)) {
            if (type === MoveType.KnightPromotion || type === MoveType.KnightPromotionCapture) {
                prettymove += "n";
            }
            if (type === MoveType.BishopPromotion || type === MoveType.BishopPromotionCapture) {
                prettymove += "b";
            }
            if (type === MoveType.RookPromotion || type === MoveType.RookPromotionCapture) {
                prettymove += "r";
            }
            if (type === MoveType.QueenPromotion || type === MoveType.QueenPromotionCapture) {
                prettymove += "q";
            }
        }
        return prettymove;
    }

    GenerateBishopAttacks(occupancy: bigint, square: Square) {
        occupancy = BigInt.asUintN(64, (occupancy & this.BishopMasks[square]) * this.BishopMagicNumbers[square]);
        occupancy >>= 64n - this.BishopRelevantBits[square];

        return this.BishopAttacks[square][Number(occupancy)];
    }

    GenerateRookAttacks(occupancy: bigint, square: Square) {
        occupancy = BigInt.asUintN(64, (occupancy & this.RookMasks[square]) * this.RookMagicNumbers[square]);
        occupancy >>= 64n - this.RookRelevantBits[square];

        return this.RookAttacks[square][Number(occupancy)];
    }

    /**
     * Generate pawn moves. Pawns have a number of special rules (like double push, en passant, promotions) so
     * their moves are generated separately from the main move function.
     */
    GeneratePawnMoves(capturesOnly = false) {
        const moves: number[] = [];
        
        // Define directions, depending on color to move
        const side = this.BoardState.SideToMove;
        const pawns = this.BoardState.PiecesBB[PieceType.Pawn + (6 * side)];
        const empty = ~(this.BoardState.OccupanciesBB[Color.White] | this.BoardState.OccupanciesBB[Color.Black]);
        const enemy = this.BoardState.OccupanciesBB[side ^ 1];
        let doublePushRank = this.rankMasks[Square.a3];
        let up = Direction.NORTH;
        let upLeft = Direction.NORTHWEST;
        let upRight = Direction.NORTHEAST;
        let notRank8 = ~this.rankMasks[Square.a8];

        if (side === Color.Black) {
            doublePushRank = this.rankMasks[Square.a6];
            up = Direction.SOUTH;
            upLeft = Direction.SOUTHEAST;
            upRight = Direction.SOUTHWEST;
            notRank8 = ~this.rankMasks[Square.a1];
        }

        if (!capturesOnly) {
            // generates a bitboard of all the target squares that pawns can push to
            let push = this.Shift(pawns, up) & empty & notRank8;
            let doublePush = this.Shift(push & doublePushRank, up) & empty;

            while (push) {
                const toSquare = this.GetLS1B(push);
                push = this.RemoveBit(push, toSquare);
                moves.push(this.EncodeMove(toSquare + up, toSquare, MoveType.Quiet));
            }

            while (doublePush) {
                const toSquare = this.GetLS1B(doublePush);
                doublePush = this.RemoveBit(doublePush, toSquare);
                moves.push(this.EncodeMove(toSquare + (2 * up), toSquare, MoveType.Quiet));
            }
        }

        // pawn captures
        let rightAttacks = this.Shift(pawns, upRight) & enemy;
        let leftAttacks = this.Shift(pawns, upLeft) & enemy;

        while (rightAttacks) {
            const toSquare = this.GetLS1B(rightAttacks);
            rightAttacks = this.RemoveBit(rightAttacks, toSquare);

            // attacks to promotion
            if ((side === Color.White && (toSquare <= Square.h8)) || (side === Color.Black && (toSquare >= Square.a1))) {
                moves.push(
                    this.EncodeMove(toSquare + upRight, toSquare, MoveType.KnightPromotionCapture),
                    this.EncodeMove(toSquare + upRight, toSquare, MoveType.BishopPromotionCapture),
                    this.EncodeMove(toSquare + upRight, toSquare, MoveType.RookPromotionCapture),
                    this.EncodeMove(toSquare + upRight, toSquare, MoveType.QueenPromotionCapture),
                );
            }
            else {
                // regular attacks
                moves.push(this.EncodeMove(toSquare + upRight, toSquare, MoveType.Capture));
            }
        }

        while (leftAttacks) {
            const toSquare = this.GetLS1B(leftAttacks);
            leftAttacks = this.RemoveBit(leftAttacks, toSquare);

            // attacks to promotion
            if ((side === Color.White && (toSquare <= Square.h8)) || (side === Color.Black && (toSquare >= Square.a1))) {
                moves.push(
                    this.EncodeMove(toSquare + upLeft, toSquare, MoveType.KnightPromotionCapture),
                    this.EncodeMove(toSquare + upLeft, toSquare, MoveType.BishopPromotionCapture),
                    this.EncodeMove(toSquare + upLeft, toSquare, MoveType.RookPromotionCapture),
                    this.EncodeMove(toSquare + upLeft, toSquare, MoveType.QueenPromotionCapture),
                );
            }
            else {
                // regular attacks
                moves.push(this.EncodeMove(toSquare + upLeft, toSquare, MoveType.Capture));
            }
        }

        // promotions (not attacks)
        let promotions = this.Shift(pawns, up) & empty & ~notRank8;
        while (promotions) {
            const toSquare = this.GetLS1B(promotions);
            promotions = this.RemoveBit(promotions, toSquare);

            moves.push(
                this.EncodeMove(toSquare + up, toSquare, MoveType.KnightPromotion),
                this.EncodeMove(toSquare + up, toSquare, MoveType.BishopPromotion),
                this.EncodeMove(toSquare + up, toSquare, MoveType.RookPromotion),
                this.EncodeMove(toSquare + up, toSquare, MoveType.QueenPromotion),
            );
        }

        // en passant capture
        // check if the en passant square is set and if there are any pawns that could capture
        if (this.BoardState.EnPassSq !== Square.no_sq && (this.PawnAttacks[this.BoardState.EnPassSq + (64 * (this.BoardState.SideToMove ^ 1))] & pawns)) {
            let right = this.Shift(pawns, upRight) & this.squareBB[this.BoardState.EnPassSq];
            let left = this.Shift(pawns, upLeft) & this.squareBB[this.BoardState.EnPassSq];

            while (right) {
                const toSquare = this.GetLS1B(right);
                right = this.RemoveBit(right, toSquare);

                moves.push(this.EncodeMove(toSquare + upRight, toSquare, MoveType.EPCapture));
            }

            while (left) {
                const toSquare = this.GetLS1B(left);
                left = this.RemoveBit(left, toSquare);

                moves.push(this.EncodeMove(toSquare + upLeft, toSquare, MoveType.EPCapture));
            }
        }

        return moves;
    }

    /**
     * Generate all pseudo-legal moves for the current player to move. Moves obey piece movement rules, but might leave the king in check
     * so further validation should be done.
     * @param capturesOnly Should only captures be generated
     * @returns A list of all pseudo-legal moves
     */
    GenerateMoves(capturesOnly = false) {
        const moveList: number[] = [];
        const opponent = this.BoardState.OccupanciesBB[this.BoardState.SideToMove ^ 1];
        const occupied = this.BoardState.OccupanciesBB[Color.White] | this.BoardState.OccupanciesBB[Color.Black];
        const empty = ~occupied;
        let pieces = this.BoardState.OccupanciesBB[this.BoardState.SideToMove] & ~this.BoardState.PiecesBB[PieceType.Pawn + (6 * this.BoardState.SideToMove)];

        // generate pawns (done separately because they have many unique moves)
        moveList.push(...this.GeneratePawnMoves(capturesOnly));

        // Iterate through all non-pawn pieces
        while (pieces) {
            const square = this.GetLS1B(pieces);
            pieces = this.RemoveBit(pieces, square);
            const pieceType = (this.BoardState.Squares[square] as Piece).Type;
            let moves: bigint = 0n;

            switch (pieceType) {
                case PieceType.Knight: {
                    moves = this.KnightAttacks[square];
                    break;
                }
                case PieceType.Bishop: {
                    moves = this.GenerateBishopAttacks(occupied, square);
                    break;
                }
                case PieceType.Rook: {
                    moves = this.GenerateRookAttacks(occupied, square);
                    break;
                }
                case PieceType.Queen: {
                    moves = this.GenerateBishopAttacks(occupied, square) | this.GenerateRookAttacks(occupied, square);
                    break;
                }
                case PieceType.King: {
                    moves = this.KingAttacks[square];
                    break;
                }
                default: {
                    // If this ever gets hit, there's a serious issue
                    throw new Error("Invalid piece in move gen.");
                }
            }

            if (!capturesOnly) {
                let quietMoves = moves & empty;

                while (quietMoves) {
                    const toSquare = this.GetLS1B(quietMoves);
                    quietMoves = this.RemoveBit(quietMoves, toSquare);
                    moveList.push(this.EncodeMove(square, toSquare, MoveType.Quiet));
                }
            }
    
            let captures = moves & opponent;
            
            while (captures) {
                const toSquare = this.GetLS1B(captures);
                captures = this.RemoveBit(captures, toSquare);
                moveList.push(this.EncodeMove(square, toSquare, MoveType.Capture));
            }
        }

        // castling moves - a bit complicated due to chess960, where the king and rook squares can vary
        if (!capturesOnly) {
            const kingSquare = this.GetLS1B(this.BoardState.PiecesBB[PieceType.King + (6 * this.BoardState.SideToMove)]);

            if (!this.IsSquareAttacked(kingSquare, this.BoardState.SideToMove ^ 1)) {
                if (this.BoardState.SideToMove === Color.White) {
                    if (this.BoardState.CastlingRights & CastlingRights.WhiteKingside
                        && ((this.BoardState.CastlingPaths[CastlingRights.WhiteKingside] & occupied) === 0n)
                        && !this.IsPathAttacked(this.betweenMasks[kingSquare][Square.h1])) {
                            moveList.push(this.EncodeMove(kingSquare, this.BoardState.CastlingRookSquares[CastlingRights.WhiteKingside], MoveType.KingCastle));
                    }

                    if (this.BoardState.CastlingRights & CastlingRights.WhiteQueenside
                        && ((this.BoardState.CastlingPaths[CastlingRights.WhiteQueenside] & occupied) === 0n)
                        && !this.IsPathAttacked(this.betweenMasks[kingSquare][Square.c1])) {
                            moveList.push(this.EncodeMove(kingSquare, this.BoardState.CastlingRookSquares[CastlingRights.WhiteQueenside], MoveType.QueenCastle));
                    }
                }
                else {
                    if (this.BoardState.CastlingRights & CastlingRights.BlackKingside
                        && ((this.BoardState.CastlingPaths[CastlingRights.BlackKingside] & occupied) === 0n)
                        && !this.IsPathAttacked(this.betweenMasks[kingSquare][Square.h8])) {
                            moveList.push(this.EncodeMove(kingSquare, this.BoardState.CastlingRookSquares[CastlingRights.BlackKingside], MoveType.KingCastle));
                    }

                    if (this.BoardState.CastlingRights & CastlingRights.BlackQueenside
                        && ((this.BoardState.CastlingPaths[CastlingRights.BlackQueenside] & occupied) === 0n)
                        && !this.IsPathAttacked(this.betweenMasks[kingSquare][Square.c8])) {
                            moveList.push(this.EncodeMove(kingSquare, this.BoardState.CastlingRookSquares[CastlingRights.BlackQueenside], MoveType.QueenCastle));
                    }
                }
            }
        }

        return moveList;
    }

    ScoreMoves(moves: number[], ttMove: number, previousMove: number) {
        let scored = [];

        for (let i = 0; i < moves.length; i++) {
            const move = moves[i];
            const from = this.MoveFrom(move);
            const to = this.MoveTo(move);

            if (move === ttMove) {
                scored.push({ move: ttMove, score: this.INFINITY }); // ttMove should be scored highest so that it's played first
            }
            else if (this.IsCapture(move)) {
                const movingPiece = this.BoardState.Squares[from] as Piece;
                const capturedPiece = this.BoardState.Squares[to] ?? { Type: PieceType.Pawn, Color: Color.White }; // if the piece from the squares is null, that means it's an en passant capture

                scored.push({ move, score: this.MGPieceValue[capturedPiece.Type] - movingPiece.Type + 10000 });
            }
            else {
                if (move === this.killerMoves[this.BoardState.Ply][0]) {
                    scored.push({ move, score: 9000 });
                }
                else if (move === this.killerMoves[this.BoardState.Ply][1]) {
                    scored.push({ move, score: 8000 });
                }
                else if (move === this.counterMoves[this.MoveFrom(previousMove)][this.MoveTo(previousMove)]) {
                    scored.push({ move, score: 7000 });
                }
                else {
                    scored.push({ move, score: this.historyMoves[this.BoardState.SideToMove][from][to] });
                }
            }
        }

        return scored;
    }

    NextMove(moves: { move: number, score: number }[], index: number) {
        let best = index;

        for (let i = index; i < moves.length; i++) {
            if (moves[i].score > moves[best].score) {
                best = i;
            }
        }

        const temp = moves[index];
        moves[index] = moves[best];
        moves[best] = temp;

        return moves[index++];
    }

    AttacksToByColor(square: Square, color: Color) {
        const pawns = this.BoardState.PiecesBB[PieceType.Pawn + (6 * color)] & this.PawnAttacks[square + (64 * (color ^ 1))];
        const knights = this.BoardState.PiecesBB[PieceType.Knight + (6 * color)] & this.KnightAttacks[square];
        const kings = this.BoardState.PiecesBB[PieceType.King + (6 * color)] & this.KingAttacks[square];
        const occupancy = this.BoardState.OccupanciesBB[Color.White] | this.BoardState.OccupanciesBB[Color.Black];

        let bishopQueens = this.BoardState.PiecesBB[PieceType.Bishop + (6 * color)] | this.BoardState.PiecesBB[PieceType.Queen + (6 * color)];
        bishopQueens &= this.GenerateBishopAttacks(occupancy, square);

        let rookQueens = this.BoardState.PiecesBB[PieceType.Rook + (6 * color)] | this.BoardState.PiecesBB[PieceType.Queen + (6 * color)];
        rookQueens &= this.GenerateRookAttacks(occupancy, square);

        return pawns | knights | kings | bishopQueens | rookQueens;
    }

    /**
     * Gets all attacked squares, without indicating the pieces attacking
     * @param side The side attacking
     * @param occupied Should be the full board occupancy
     * @returns All the attacked squares
     */
    AttackedSquares(side: Color, occupied: bigint) {
        const pawns = this.BoardState.PiecesBB[PieceType.Pawn + (6 * side)];
        let pieces = this.BoardState.OccupanciesBB[side] & ~pawns;
        let upLeft = Direction.NORTHWEST;
        let upRight = Direction.NORTHEAST;

        if (side === Color.Black) {
            upLeft = Direction.SOUTHEAST;
            upRight = Direction.SOUTHWEST;
        }

        // pawn attacks
        let attacks = this.Shift(pawns, upLeft) | this.Shift(pawns, upRight);

        // all other piece attacks
        while (pieces) {
            const square = this.GetLS1B(pieces);
            pieces = this.RemoveBit(pieces, square);
            const pieceType = (this.BoardState.Squares[square] as Piece).Type;

            switch (pieceType) {
                case PieceType.Knight: {
                    attacks |= this.KnightAttacks[square];
                    break;
                }
                case PieceType.Bishop: {
                    attacks |= this.GenerateBishopAttacks(occupied, square);
                    break;
                }
                case PieceType.Rook: {
                    attacks |= this.GenerateRookAttacks(occupied, square);
                    break;
                }
                case PieceType.Queen: {
                    attacks |= this.GenerateBishopAttacks(occupied, square) | this.GenerateRookAttacks(occupied, square);
                    break;
                }
                case PieceType.King: {
                    attacks |= this.KingAttacks[square];
                    break;
                }
                default: {
                    // If this ever gets hit, there's a serious issue
                    throw new Error("Invalid piece in move gen.");
                }
            }
        }

        return attacks;
    }

    /****************************
     * 
     *     Move Functions
     *
     ****************************/

    private readonly boardStates: StateCopy[] = [];

    /** Place a piece on the square and updates board state */
    PlacePiece(piece: PieceType, color: Color, square: Square) {
        this.BoardState.PiecesBB[piece + (6 * color)] = this.SetBit(this.BoardState.PiecesBB[piece + (6 * color)], square);
        this.BoardState.OccupanciesBB[color] = this.SetBit(this.BoardState.OccupanciesBB[color], square);
        this.BoardState.Squares[square] = { Type: piece, Color: color };
    }

    /** Remove a piece on the square and updates board state */
    RemovePiece(piece: PieceType, color: Color, square: Square) {
        this.BoardState.PiecesBB[piece + (6 * color)] = this.RemoveBit(this.BoardState.PiecesBB[piece + (6 * color)], square);
        this.BoardState.OccupanciesBB[color] = this.RemoveBit(this.BoardState.OccupanciesBB[color], square);
        this.BoardState.Squares[square] = undefined;
    }

    /** Moves a piece from and to given squares and updates board state */
    MovePiece(piece: Piece, from: Square, to: Square) {
        const moveBB = this.squareBB[from] | this.squareBB[to];
        this.BoardState.PiecesBB[piece.Type + (6 * piece.Color)] ^= moveBB;
        this.BoardState.OccupanciesBB[piece.Color] ^= moveBB;
        this.BoardState.Squares[from] = undefined;
        this.BoardState.Squares[to] = piece;
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
        this.RemovePiece(PieceType.Rook, piece.Color, rookFrom);
        this.RemovePiece(piece.Type, piece.Color, from);

        // Place the king and rook on their squares
        this.PlacePiece(PieceType.Rook, piece.Color, rookTo);
        this.PlacePiece(piece.Type, piece.Color, kingTo);

        this.BoardState.Hash ^= this.Zobrist.Pieces[piece.Color][PieceType.Rook][rookFrom] ^ this.Zobrist.Pieces[piece.Color][PieceType.Rook][rookTo]
            ^ this.Zobrist.Pieces[piece.Color][PieceType.King][kingTo] ^ this.Zobrist.Pieces[piece.Color][PieceType.King][from];
    }

    UndoCastle(from: Square, to: Square) {
        const color = this.BoardState.SideToMove;
        const kingSide = to > from;
        let kingTo = Square.g1 ^ (color * 56);
        let rookTo = Square.f1 ^ (color * 56);

        if (!kingSide) {
            kingTo = Square.c1 ^ (color * 56);
            rookTo = Square.d1 ^ (color * 56);
        }
        const rookFrom = to;

        this.RemovePiece(PieceType.Rook, color, rookTo);
        this.RemovePiece(PieceType.King, color, kingTo);
        this.PlacePiece(PieceType.Rook, color, rookFrom);
        this.PlacePiece(PieceType.King, color, from);
    }

    /**
     * Make the given move and update board state and hashes
     * @param move The move to make
     * @returns False if the move is illegal (leaves the king in check), otherwise true
     */
    MakeMove(move: number) {
        const from = this.MoveFrom(move);
        const to = this.MoveTo(move);
        const moveType = this.MoveType(move);
        const piece = this.BoardState.Squares[from] as Piece;
        let captured = moveType === MoveType.EPCapture ? { Type: PieceType.Pawn, Color: this.BoardState.SideToMove ^ 1 } : this.BoardState.Squares[to];

        this.boardStates.push({
            CastlingRights: this.BoardState.CastlingRights,
            EnPassSq: this.BoardState.EnPassSq,
            Captured: captured,
            Hash: this.BoardState.Hash,
            PawnHash: this.BoardState.PawnHash,
            HalfMoves: this.BoardState.HalfMoves,
            Phase: this.BoardState.Phase,
        });

        this.BoardState.Ply++;
        this.BoardState.HalfMoves++;

        // Clear the en passant square
        if (this.BoardState.EnPassSq !== Square.no_sq) {
            this.BoardState.Hash ^= this.Zobrist.EnPassant[this.BoardState.EnPassSq];
            this.BoardState.EnPassSq = Square.no_sq;
        }

        if (this.IsCastle(move)) {
            this.DoCastle(piece, from, to);
        }
        else {
            let up = piece.Color === Color.White ? Direction.NORTH : Direction.SOUTH;
            if (captured !== undefined) {
                let captureSquare = to;
    
                if (moveType === MoveType.EPCapture) {
                    captureSquare = to + up;
                }
    
                this.RemovePiece(captured.Type, captured.Color, captureSquare);
                this.BoardState.HalfMoves = 0;

                this.BoardState.Hash ^= this.Zobrist.Pieces[captured.Color][captured.Type][captureSquare];

                this.BoardState.Phase += this.PhaseValues[captured.Type];

                if (captured.Type === PieceType.Pawn) {
                    this.BoardState.PawnHash ^= this.Zobrist.Pieces[captured.Color][captured.Type][captureSquare];
                }
            }
    
            this.MovePiece(piece, from, to);

            this.BoardState.Hash ^= this.Zobrist.Pieces[piece.Color][piece.Type][from] ^ this.Zobrist.Pieces[piece.Color][piece.Type][to];
    
            if (piece.Type === PieceType.Pawn) {
                this.BoardState.HalfMoves = 0;
                this.BoardState.PawnHash ^= this.Zobrist.Pieces[piece.Color][piece.Type][from] ^ this.Zobrist.Pieces[piece.Color][piece.Type][to];
    
                if (this.HasFlag(move, MoveFlag.Promotion)) {
                    let promotionPiece = 0;
                    switch (moveType) {
                        case MoveType.KnightPromotion:
                        case MoveType.KnightPromotionCapture: {
                            promotionPiece = PieceType.Knight;
                            break;
                        }
                        case MoveType.BishopPromotion:
                        case MoveType.BishopPromotionCapture: {
                            promotionPiece = PieceType.Bishop;
                            break;
                        }
                        case MoveType.RookPromotion:
                        case MoveType.RookPromotionCapture: {
                            promotionPiece = PieceType.Rook;
                            break;
                        }
                        case MoveType.QueenPromotion:
                        case MoveType.QueenPromotionCapture: {
                            promotionPiece = PieceType.Queen;
                            break;
                        }
                    }
                    const promotionType: Piece = { Type: promotionPiece, Color: piece.Color };
                    this.RemovePiece(piece.Type, piece.Color, to);
                    this.PlacePiece(promotionType.Type, promotionType.Color, to);
                    this.BoardState.Phase += this.PhaseValues[PieceType.Pawn];
                    this.BoardState.Phase -= this.PhaseValues[promotionType.Type];
                    this.BoardState.Hash ^= this.Zobrist.Pieces[piece.Color][piece.Type][to] ^ this.Zobrist.Pieces[promotionType.Color][promotionType.Type][to];
                    this.BoardState.PawnHash ^= this.Zobrist.Pieces[piece.Color][piece.Type][to];
                }
                // If a pawn double push, set the en passant square
                else if ((to ^ from) === 16) {
                    this.BoardState.EnPassSq = to + up;
                    this.BoardState.Hash ^= this.Zobrist.EnPassant[this.BoardState.EnPassSq];
                }
            }
        }

        // update castling rights
        this.BoardState.Hash ^= this.Zobrist.Castle[this.BoardState.CastlingRights];
        this.BoardState.CastlingRights &= this.BoardState.CastlingSquaresMask[from] & this.BoardState.CastlingSquaresMask[to];
        this.BoardState.Hash ^= this.Zobrist.Castle[this.BoardState.CastlingRights];

        // Update the side to move
        this.BoardState.SideToMove ^= 1;
        this.BoardState.Hash ^= this.Zobrist.SideToMove;

        this.BoardHistory[this.BoardHistory.length] = this.BoardState.Hash;

        // Because the move generator generates pseudo-legal moves,
        // The move that was just made might have left the side-to-move's king in check
        // Make sure that hasn't happened
        return !this.IsSquareAttacked(this.GetLS1B(this.BoardState.PiecesBB[PieceType.King + (6 * (this.BoardState.SideToMove ^ 1))]), this.BoardState.SideToMove);
    }

    UnmakeMove(move: number) {
        const state = this.boardStates.pop() as StateCopy;

        this.BoardState.Ply--;

        this.BoardHistory.pop();

        // Replace current position properties with those retreived from the state
        this.BoardState.CastlingRights = state.CastlingRights;
        this.BoardState.EnPassSq = state.EnPassSq;
        this.BoardState.HalfMoves = state.HalfMoves;
        this.BoardState.Phase = state.Phase;

        // Flip the side to move
        this.BoardState.SideToMove ^= 1;

        const from = this.MoveFrom(move);
        const to = this.MoveTo(move);
        const piece = this.BoardState.Squares[to] as Piece;

        if (this.IsCastle(move)) {
            this.UndoCastle(from, to);
        }
        else if (this.HasFlag(move, MoveFlag.Promotion)) {
            this.RemovePiece(piece.Type, piece.Color, to);
            this.PlacePiece(PieceType.Pawn, piece.Color, from);

            if (state.Captured) {
                this.PlacePiece(state.Captured.Type, state.Captured.Color, to);
            }
        }
        else {
            this.MovePiece(piece, to, from);

            if (state.Captured) {
                let captureSquare = to;
                let captured = state.Captured;

                if (this.MoveType(move) === MoveType.EPCapture) {
                    captureSquare = piece.Color === Color.White ? to + 8 : to - 8;
                }

                this.PlacePiece(captured.Type, captured.Color, captureSquare);
            }
        }

        // Set hash to previous value
        this.BoardState.Hash = state.Hash;
        this.BoardState.PawnHash = state.PawnHash;
    }

    MakeNullMove() {
        this.boardStates.push({
            CastlingRights: this.BoardState.CastlingRights,
            EnPassSq: this.BoardState.EnPassSq,
            Hash: this.BoardState.Hash,
            HalfMoves: this.BoardState.HalfMoves,
            PawnHash: this.BoardState.PawnHash,
            Phase: this.BoardState.Phase,
        });

        if (this.BoardState.EnPassSq !== Square.no_sq) {
            this.BoardState.Hash ^= this.Zobrist.EnPassant[this.BoardState.EnPassSq];
            this.BoardState.EnPassSq = Square.no_sq;
        }

        this.BoardState.HalfMoves = 0;
        this.BoardState.SideToMove ^= 1;
        this.BoardState.Hash ^= this.Zobrist.SideToMove;
        this.BoardState.Ply++;
    }

    UnmakeNullMove() {
        const state = this.boardStates.pop() as StateCopy;

        this.BoardState.CastlingRights = state.CastlingRights;
        this.BoardState.EnPassSq = state.EnPassSq;
        this.BoardState.HalfMoves = state.HalfMoves;
        this.BoardState.SideToMove ^= 1;
        this.BoardState.Hash = state.Hash;
        this.BoardState.PawnHash = state.PawnHash;
        this.BoardState.Ply--;
        this.BoardState.Phase = state.Phase;
    }

    IsSquareAttacked(square: Square, side: Color) {
        if (this.PawnAttacks[square + (64 * (side ^ 1))] & this.BoardState.PiecesBB[PieceType.Pawn + (6 * side)]) {
            return true;
        }
        if (this.KnightAttacks[square] & this.BoardState.PiecesBB[PieceType.Knight + (6 * side)]) { 
            return true;
        }

        const queens = this.BoardState.PiecesBB[PieceType.Queen + (6 * side)];
        const occupancy = this.BoardState.OccupanciesBB[Color.White] | this.BoardState.OccupanciesBB[Color.Black];

        const bishopQueens = this.BoardState.PiecesBB[PieceType.Bishop + (6 * side)] | queens;
        // Bishop and Rook attacks are expensive to calcuate, so check the masks first to see if the call even needs to be made
        if ((this.attackRays[PieceType.Bishop - PieceType.Bishop][square] & bishopQueens) && this.GenerateBishopAttacks(occupancy, square) & bishopQueens) {
            return true;
        }
        
        const rookQueens = this.BoardState.PiecesBB[PieceType.Rook + (6 * side)] | queens;
        if ((this.attackRays[PieceType.Rook - PieceType.Bishop][square] & rookQueens) && this.GenerateRookAttacks(occupancy, square) & rookQueens) {
            return true;
        }
        if (this.KingAttacks[square] & this.BoardState.PiecesBB[PieceType.King + (6 * side)]) {
            return true;
        }

        return false;
    }

    /**
     * Checks if any squares in a bitboard are attacked
     * @returns 
     */
    IsPathAttacked(path: bigint) {
        let attacked = false;
        while (path) {
            const square = this.GetLS1B(path);
            path = this.RemoveBit(path, square);
            if (this.IsSquareAttacked(square, this.BoardState.SideToMove ^ 1)) {
                attacked = true;
                break;
            }
        }

        return attacked;
    }

    /****************************
     * 
     *    Transposition Table
     *
     ****************************/

    // Default to a 32 MB hash table. Calculate how many 16-byte entries can fit
    private TT_Size = (32 * 1024 * 1024) / 16;

    /** Why a bunch of arrays (instead of a single array of entry objects)?
     * Due to how JS stores objects, a 16-byte object takes up more than 16-bytes of memory.
     * For large hash table sizes, this results in a large amount of memory being used (> 1GB).
     * This way has much better memory usage.
     **/
    private TT_Hash = new BigUint64Array(this.TT_Size);
    private TT_Depth = new Uint8Array(this.TT_Size);
    private TT_Move = new Uint16Array(this.TT_Size);
    private TT_Score = new Int16Array(this.TT_Size);
    private TT_Flag = new Uint8Array(this.TT_Size);
    private TTSize = BigInt((32 * 1024 * 1024) / 16); // as bigint for faster/easier operations against hashes
    private TTUsed = 0;

    /**
     * Resize the transposition table to the provided size
     * @param size The size, in MB, to set the hash table to
     */
    ResizeTranspositionTable(size: number) {
        this.TT_Size = (size * 1024 * 1024) / 16;
        this.TT_Hash = new BigUint64Array(this.TT_Size);
        this.TT_Depth = new Uint8Array(this.TT_Size);
        this.TT_Move = new Uint16Array(this.TT_Size);
        this.TT_Score = new Int16Array(this.TT_Size);
        this.TT_Flag = new Uint8Array(this.TT_Size);
        this.TTSize = BigInt(this.TT_Size);
        this.TTUsed = 0;
    }

    /**
     * Store an entry in the transposition table. Collisions are always replaced
     */
    StoreEntry(hash: bigint, depth: number, move: number, score: number, flag: HashFlag) {
        const index = Number(hash % this.TTSize);

        if (this.TT_Hash[index] === 0n) {
            this.TTUsed++;
        }

        this.TT_Hash[index] = hash;
        this.TT_Depth[index] = depth;
        this.TT_Move[index] = move;
        this.TT_Score[index] = score;
        this.TT_Flag[index] = flag;
    }

    /**
     * Get a hash entry from the transposition table
     * @param hash The hash to use to get the stored entry
     * @returns Will return null if an entry hasn't been set at that index or if the entry's hash doesn't match the provided hash.
     * Otherwise, the entry will be returned.
     */
    GetEntry(hash: bigint): TTEntry | null {
        const index = Number(hash % this.TTSize);
        const tt_hash = this.TT_Hash[index];

        if (tt_hash !== hash) {
            return null;
        }

        return {
            Hash: tt_hash,
            Move: this.TT_Move[index],
            Depth: this.TT_Depth[index],
            Score: this.TT_Score[index],
            Flag: this.TT_Flag[index],
        };
    }

    /****************************
     * 
     *     Pawn Hash Table
     *
     ****************************/

    private PawnTableSize = (4 * 1024 * 1024) / 16;  // 4 MB table size
    private PawnTableSize_Index = BigInt(this.PawnTableSize);

    private PawnTable_Hash = new BigUint64Array(this.PawnTableSize);
    private PawnTable_MGScore = new Int16Array(this.PawnTableSize);
    private PawnTable_EGScore = new Int16Array(this.PawnTableSize);
    private PawnTable_STM = new Uint8Array(this.PawnTableSize);

    ResizePawnTable(size: number) {
        this.PawnTableSize = (size * 1024 * 1024) / 16;
        this.PawnTableSize_Index = BigInt(this.PawnTableSize);
        this.PawnTable_Hash = new BigUint64Array(this.PawnTableSize);
        this.PawnTable_MGScore = new Int16Array(this.PawnTableSize);
        this.PawnTable_EGScore = new Int16Array(this.PawnTableSize);
        this.PawnTable_STM = new Uint8Array(this.PawnTableSize);
    }

    StorePawnHash(hash: bigint, mg: number, eg: number, side: Color) {
        const index = Number(hash % this.PawnTableSize_Index);

        this.PawnTable_Hash[index] = hash;
        this.PawnTable_MGScore[index] = mg;
        this.PawnTable_EGScore[index] = eg;
        this.PawnTable_STM[index] = side;
    }

    GetPawnEntry(hash: bigint): PawnEntry | null {
        const index = Number(hash % this.PawnTableSize_Index);
        const pt_hash = this.PawnTable_Hash[index];

        if (pt_hash !== hash) {
            return null;
        }

        return {
            Hash: pt_hash,
            Mg: this.PawnTable_MGScore[index],
            Eg: this.PawnTable_EGScore[index],
            SideToMove: this.PawnTable_STM[index],
        }
    }

    /****************************
     * 
     *        Evaluation
     *
     ****************************/

    readonly PST = [
        // opening/middle game values
        [
            // pawn
            [
                0, 0, 0, 0, 0, 0, 0, 0,
                43, 42, 29, 35, 18, 19, 2, 17,
                -9, 1, -2, 21, 3, 49, 16, -10,
                -24, -22, -21, -6, 3, -13, -10, -19,
                -29, -25, -21, -5, -9, -7, 15, -14,
                -31, -27, -26, -20, -16, -12, 44, -1,
                -35, -30, -36, -34, -32, 9, 54, -9,
                0, 0, 0, 0, 0, 0, 0, 0,
            ],
            
            // knight
            [
                -39, -4, -4, -5, 6, -4, 1, -29,
                -24, -13, 10, 30, 33, 37, -14, 3,
                -13, 12, 17, 46, 43, 75, 34, 13,
                -6, -4, 12, 27, 0, 48, 2, 33,
                -17, 3, 7, -1, 9, 9, -1, -15,
                -27, -14, -6, -8, 3, -9, 10, -37,
                -30, -26, -24, -9, -8, -15, -13, -8,
                -20, -18, -30, -34, -23, -16, -23, -28,
            ],

            // bishop
            [
                -12, -15, -8, -4, -9, -6, -1, -5,
                -16, -5, 7, -3, 10, 0, -5, -3,
                -4, 2, 14, 26, 26, 80, 36, 36,
                -21, -14, 7, 25, 14, -6, -9, -4,
                -9, 2, -8, 24, 11, -1, -7, -17,
                -10, 0, -2, -7, -3, 0, 5, 1,
                -26, -7, 2, -10, -12, -3, 14, 12,
                -21, -7, -14, -28, -13, -30, -10, -20,
            ],

            // rook
            [
                3, -1, 8, 25, 21, 20, 16, 19,
                -32, -22, 0, 19, 20, 31, 36, 18,
                -35, -20, -11, 2, 25, 30, 13, 7,
                -33, -32, -25, -3, -6, 6, 11, -6,
                -36, -33, -43, -17, -8, -8, 14, -25,
                -46, -31, -37, -25, -31, -29, 9, -23,
                -29, -42, -31, -26, -16, 7, -13, -33,
                -20, -35, -33, -24, -20, -10, -50, -10,
            ],

            // queen
            [
                -35, -8, 4, 13, 27, 25, 21, 28,
                -31, -19, -8, 12, 14, 67, 54, 49,
                -21, -13, -16, 21, 46, 69, 71, 37,
                -18, -12, -8, 1, 7, 18, 3, -1,
                -10, -9, -19, -17, -11, -4, 6, -13,
                -30, -1, -14, -13, -19, -13, 5, -13,
                -31, -15, -13, -2, -2, -3, -18, -26,
                -18, -34, -30, 1, -19, -32, -18, -9,
            ],

            // king
            [
                -1, 1, 0, 2, 0, 2, 1, -1,
                -1, 3, 4, 2, 5, 5, 6, 2,
                0, 2, 4, 6, 8, 11, 9, 5,
                -2, 1, 4, 1, 2, 6, -1, -3,
                -1, 1, -4, -4, 3, -17, -17, -32,
                -3, -7, -11, -21, -21, -16, -21, -24,
                -5, -2, -8, -50, -32, -56, 33, 53,
                -7, -22, -4, -52, 32, -50, 61, 53,
            ]
        ],
        // end game values
        [
            // pawn
            [
                0, 0, 0, 0, 0, 0, 0, 0,
                69, 70, 60, 35, 40, 40, 55, 67,
                43, 45, 25, -16, 4, 4, 38, 39,
                12, -2, -16, -42, -34, -22, -10, -7,
                -3, -13, -25, -38, -35, -30, -25, -29,
                -15, -18, -26, -25, -26, -23, -40, -34,
                -1, -5, -8, -50, -16, -10, -23, -29,
                0, 0, 0, 0, 0, 0, 0, 0,
            ],

            // knight
            [
                -30, -5, -4, -2, 3, -1, 0, -19,
                -21, -6, 17, 26, 13, -1, -13, -16,
                -15, 12, 30, 30, 30, 19, -3, -14,
                -7, 9, 31, 47, 37, 23, 22, -9,
                -9, 0, 36, 29, 37, 15, 1, -5,
                -30, -3, 10, 22, 13, 10, -18, -17,
                -14, -8, -9, 9, -12, -10, -12, -14,
                -18, -69, -26, -8, -12, -16, -49, -26,
            ],

            // bishop
            [
                -6, -14, -1, 1, 2, 3, 7, -6,
                2, 4, 0, 4, 6, 13, 2, -26,
                -5, 11, 15, -3, 20, 37, 18, 3,
                -6, 25, 20, 33, 22, 24, 16, -8,
                -7, -2, 38, 27, 22, 12, -5, -20,
                -23, 3, 26, 22, 27, 11, -12, -13,
                -20, -31, -15, 1, 3, -8, -11, -19,
                -20, -34, -50, -11, -23, -35, -8, -21,
            ],

            // rook
            [
                10, 21, 21, 20, 23, 24, 24, 26,
                29, 31, 28, 26, 19, 9, 22, 9,
                27, 19, 20, 10, 6, 15, 23, 9,
                14, 17, 22, 8, -6, 13, 4, -4,
                -4, 1, 21, 5, -10, -8, -5, -18,
                -8, -14, 1, -6, -11, -11, -21, -29,
                -23, -27, -12, -16, -21, -32, -15, -27,
                -15, -2, 6, -1, -7, -14, -7, -72,
            ],

            // queen
            [
                -13, 3, 15, 11, 21, 27, 11, 19,
                -22, -9, 10, 10, 30, 39, 29, 11,
                -31, -15, -5, 4, 36, 50, 36, 13,
                -27, -8, 2, 25, 32, 33, 25, 16,
                -39, -10, 1, 46, 21, 18, 4, 13,
                -17, -36, 2, -2, 21, 10, 3, -8,
                -16, -13, -17, -33, -28, -26, -12, -11,
                -20, -22, -18, -65, -16, -28, -16, -7,
            ],

            // king
            [
                -17, -5, -1, -1, 1, 8, 4, -8,
                -6, 16, 18, 10, 19, 27, 31, 4,
                3, 26, 25, 27, 33, 47, 41, 21,
                -12, 27, 26, 30, 29, 45, 34, 4,
                -17, -6, 15, 19, 21, 19, 12, -20,
                -19, -6, 4, 11, 11, 3, -8, -20,
                -20, -13, -14, 0, 1, 5, -20, -44,
                -19, -29, -17, -20, -85, -26, -57, -79,
            ]
        ]
    ];

    readonly MGPieceValue = [69, 260, 270, 352, 905, 15000];
    readonly EGPieceValue = [122, 287, 322, 548, 947, 15000];
    readonly MGKnightOutpost = 7;
    readonly EGKnightOutpost = 16;
    readonly MGRookOpenFileBonus = 40;
    readonly MGRookSemiOpenFileBonus = 18;
    readonly MGBishopPair = 5;
    readonly EGBishopPair = 53;
    readonly PawnDuoMulti = [0, -5, 10, 32, 78, 44, 27];
    readonly PawnSupportMulti = [0, 0, 22, 17, 25, 43, 31];
    readonly MGDoubledPawn = 17;
    readonly EGDoubledPawn = 17;
    readonly MGIsolatedPawn = 9;
    readonly EGIsolatedPawn = 0;
    readonly MGPassedPawnRank = [0, 7, -3, -17, 8, 26, 70];
    readonly EGPassedPawnRank = [0, -2, 10, 43, 64, 82, 90];
    readonly MGCorneredBishopPenalty = 3;
    readonly EGCorneredBishopPenalty = 55;

    readonly CenterDistance = [
        3, 3, 3, 3, 3, 3, 3, 3,
        3, 2, 2, 2, 2, 2, 2, 3,
        3, 2, 1, 1, 1, 1, 2, 3,
        3, 2, 1, 0, 0, 1, 2, 3,
        3, 2, 1, 0, 0, 1, 2, 3,
        3, 2, 1, 1, 1, 1, 2, 3,
        3, 2, 2, 2, 2, 2, 2, 3,
        3, 3, 3, 3, 3, 3, 3, 3,
    ];

    readonly CenterManhattanDistance = [
        6, 5, 4, 3, 3, 4, 5, 6,
        5, 4, 3, 2, 2, 3, 4, 5,
        4, 3, 2, 1, 1, 2, 3, 4,
        3, 2, 1, 0, 0, 1, 2, 3,
        3, 2, 1, 0, 0, 1, 2, 3,
        4, 3, 2, 1, 1, 2, 3, 4,
        5, 4, 3, 2, 2, 3, 4, 5,
        6, 5, 4, 3, 3, 4, 5, 6,
    ];

    Evaluate() {
        let mg = [0, 0];
        let eg = [0, 0];
        let phase = this.BoardState.Phase;
        let occupied = this.BoardState.OccupanciesBB[Color.White] | this.BoardState.OccupanciesBB[Color.Black];
        let pieces = occupied & ~(this.BoardState.PiecesBB[PieceType.Pawn] | this.BoardState.PiecesBB[PieceType.Pawn + 6]);
        const bishopCount = [0, 0];

        // If there are no more pawns left on the board, try to force weaker king to corner
        if ((this.BoardState.PiecesBB[PieceType.Pawn] | this.BoardState.PiecesBB[PieceType.Pawn + 6]) === 0n) {
            if (this.IsDraw()) {
                return 0;
            }

            let kingSquares = [Square.no_sq, Square.no_sq];

            while (pieces) {
                let square = this.GetLS1B(pieces);
                pieces = this.RemoveBit(pieces, square);
                const piece = this.BoardState.Squares[square] as Piece;

                eg[piece.Color] += this.EGPieceValue[piece.Type];

                if (piece.Type === PieceType.King) {
                    kingSquares[piece.Color] = square;
                }
            }

            const distance = this.distanceBetween[kingSquares[Color.White]][kingSquares[Color.Black]];

            // Which side is weaker (with a margin)?
            if (Math.abs(eg[Color.White] - eg[Color.Black]) > 10) {
                if (eg[Color.White] > eg[Color.Black]) {
                    eg[Color.Black] -= this.CenterManhattanDistance[kingSquares[Color.Black]] * 50;
                }
                else {
                    eg[Color.White] -= this.CenterManhattanDistance[kingSquares[Color.White]] * 50;
                }
            }
            else {
                // if the material value is similar, consider it a draw
                return 0;
            }

            return eg[this.BoardState.SideToMove] - eg[this.BoardState.SideToMove ^ 1] - (35 * (7 - distance));
        }

        // pawns are evaluated separately
        const pawnScore = this.EvaluatePawns();

        while (pieces) {
            let square = this.GetLS1B(pieces);
            const actualSquare = square;
            pieces = this.RemoveBit(pieces, square);
            const piece = this.BoardState.Squares[square] as Piece;

            // Because the PST are from white's perspective, we have to flip the square if the piece is black's
            if (piece.Color === Color.Black) {
                square ^= 56;
            }

            switch (piece.Type) {
                case PieceType.Knight: {
                    // OUTPOSTS:
                    // First condition checks if the square is defended by a pawn,
                    // second condition checks if the square is attacked by an enemy pawn
                    if ((this.PawnAttacks[actualSquare + (64 * (piece.Color ^ 1))] & this.BoardState.PiecesBB[PieceType.Pawn + (6 * piece.Color)])
                        && !(this.PawnAttacks[actualSquare + (64 * (piece.Color))] & this.BoardState.PiecesBB[PieceType.Pawn + (6 * (piece.Color ^ 1))])) {
                        mg[piece.Color] += this.MGKnightOutpost;
                        eg[piece.Color] += this.EGKnightOutpost;
                    }
                    break;
                }
                case PieceType.Bishop: {
                    bishopCount[piece.Color]++;

                    // An idea from Stockfish - If the bishop is on a corner square and blocked diagonally by a friendly pawn it deserves a penalty
                    if (this.isChess960 && (square === Square.a1 || square === Square.h1)) {
                        let blockingPawn = (square & 7) === 0 ? (1n << 49n) : (1n << 54n);

                        if (piece.Color === Color.Black) {
                            blockingPawn = blockingPawn >> 40n;
                        }

                        if ((blockingPawn & this.BoardState.PiecesBB[PieceType.Pawn + (6 * piece.Color)]) !== 0n) {
                            mg[piece.Color] -= this.MGCorneredBishopPenalty;
                            eg[piece.Color] -= this.EGCorneredBishopPenalty;
                        }
                    }

                    break;
                }
                case PieceType.Rook: {
                    // (SEMI-) OPEN FILE
                    // First condition checks for friendly pawns on the same file (semi-open file)
                    // Second condition checks for enemy pawns on the same file (open file)
                    if ((this.fileMasks[actualSquare] & this.BoardState.PiecesBB[PieceType.Pawn + (6 * piece.Color)]) === 0n) {
                        if ((this.fileMasks[actualSquare] & this.BoardState.PiecesBB[PieceType.Pawn + (6 * (piece.Color ^ 1))]) === 0n) {
                            mg[piece.Color] += this.MGRookOpenFileBonus;
                        }
                        else {
                            mg[piece.Color] += this.MGRookSemiOpenFileBonus;
                        }
                    }
                    break;
                }
            }

            // PST and material scores
            mg[piece.Color] += this.PST[0][piece.Type][square] + this.MGPieceValue[piece.Type];
            eg[piece.Color] += this.PST[1][piece.Type][square] + this.EGPieceValue[piece.Type];
        }

        if (bishopCount[Color.White] >= 2) {
            mg[Color.White] += this.MGBishopPair;
            eg[Color.White] += this.EGBishopPair;
        }

        if (bishopCount[Color.Black] >= 2) {
            mg[Color.Black] += this.MGBishopPair;
            eg[Color.Black] += this.EGBishopPair;
        }

        const opening = mg[this.BoardState.SideToMove] - mg[this.BoardState.SideToMove ^ 1] + pawnScore.opening;
        const endgame = eg[this.BoardState.SideToMove] - eg[this.BoardState.SideToMove ^ 1] + pawnScore.endgame;
        
        phase = ((phase * 256 + (this.PhaseTotal / 2)) / this.PhaseTotal) | 0;

        // tapered eval
        return (((opening * (256 - phase)) + (endgame * phase)) / 256 | 0);
    }

    EvaluatePawns() {
        // Check pawn hash table
        const pawnEntry = this.GetPawnEntry(this.BoardState.PawnHash);

        // if there's an entry, that means the stored hash matches the current hash and we can use the pawn scores
        if (pawnEntry) {
            // if the current side to move doesn't match the stored value, the entry's scores are from the other stm's point of view
            if (pawnEntry.SideToMove !== this.BoardState.SideToMove) {
                return { opening: pawnEntry.Mg * -1, endgame: pawnEntry.Eg * -1 };
            }

            return { opening: pawnEntry.Mg, endgame: pawnEntry.Eg };
        }

        // the pawn hash entry isn't valid, so we have to calculate the pawn score
        let mg = [0, 0];
        let eg = [0, 0];
        let pawns = this.BoardState.PiecesBB[PieceType.Pawn] | this.BoardState.PiecesBB[PieceType.Pawn + 6];

        while (pawns) {
            let square = this.GetLS1B(pawns);
            const actualSquare = square;
            pawns = this.RemoveBit(pawns, square);
            const piece = this.BoardState.Squares[square] as Piece;
            const rank = piece.Color === Color.White ? 8 - (square >> 3) : 1 + (square >> 3);
            const up = piece.Color === Color.White ? Direction.NORTH : Direction.SOUTH;

            if (piece.Color === Color.Black) {
                square ^= 56;
            }

            // pawn duos (pawns with a neighboring pawn)
            if (this.Shift(this.squareBB[actualSquare], Direction.EAST) & this.BoardState.PiecesBB[PieceType.Pawn + (6 * piece.Color)]) {
                //mg[piece.Color] += 3 * this.PawnRankMulti[rank - 1]; // [0, 1, 1.25, 2, 5, 8, 15, 0]
                eg[piece.Color] += this.PawnDuoMulti[rank - 1]; // [0, 10, 14, 25, 80, 150, 250, 0]
            }

            // defending pawn(s)?
            if (this.PawnAttacks[actualSquare + (64 * (piece.Color ^ 1))] & this.BoardState.PiecesBB[PieceType.Pawn + (6 * piece.Color)]) {
                //mg[piece.Color] += 2 * this.PawnRankMulti[rank - 1]; // [0, 1, 1.25, 2, 5, 8, 15, 0]
                eg[piece.Color] += this.PawnSupportMulti[rank - 1]; // [0, 0, 25, 40, 75, 100, 225, 0]
            }

            // doubled pawn
            if ((this.Shift(this.squareBB[actualSquare], up * -1) & this.BoardState.PiecesBB[PieceType.Pawn + (6 * piece.Color)]) !== 0n) {
                mg[piece.Color] -= this.MGDoubledPawn;
                eg[piece.Color] -= this.EGDoubledPawn;
            }

            // passed pawn
            // first condition ensures a doubled pawn doesn't get a bonus
            if ((this.Fill(up * -1, actualSquare) & this.BoardState.PiecesBB[PieceType.Pawn + (6 * piece.Color)]) === 0n && (this.passedMasks[piece.Color][square] & this.BoardState.PiecesBB[PieceType.Pawn + (6 * (piece.Color ^ 1))]) === 0n) {
                mg[piece.Color] += this.MGPassedPawnRank[rank - 1];
                eg[piece.Color] += this.EGPassedPawnRank[rank - 1];
            }

            // isolated pawn
            if ((this.isolatedMasks[actualSquare] & this.BoardState.PiecesBB[PieceType.Pawn + (6 * piece.Color)]) === 0n) {
                mg[piece.Color] -= this.MGIsolatedPawn;
                eg[piece.Color] -= this.EGIsolatedPawn;
            }

            // PST and material scores
            mg[piece.Color] += this.PST[0][PieceType.Pawn][square] + this.MGPieceValue[PieceType.Pawn];
            eg[piece.Color] += this.PST[1][PieceType.Pawn][square] + this.EGPieceValue[PieceType.Pawn];
        }

        const opening = mg[this.BoardState.SideToMove] - mg[this.BoardState.SideToMove ^ 1];
        const endgame = eg[this.BoardState.SideToMove] - eg[this.BoardState.SideToMove ^ 1];

        this.StorePawnHash(this.BoardState.PawnHash, opening, endgame, this.BoardState.SideToMove);

        return { opening, endgame };
    }

    IsDraw() {
        // Only kings
        if ((this.BoardState.PiecesBB[PieceType.King] | this.BoardState.PiecesBB[PieceType.King + 6]) === (this.BoardState.OccupanciesBB[Color.White] | this.BoardState.OccupanciesBB[Color.Black])) {
            return true;
        }

        const pawns = this.CountBits(this.BoardState.PiecesBB[PieceType.Pawn]) + this.CountBits(this.BoardState.PiecesBB[PieceType.Pawn + 6]);
        const wKnights = this.CountBits(this.BoardState.PiecesBB[PieceType.Knight]);
        const bKnights = this.CountBits(this.BoardState.PiecesBB[PieceType.Knight + 6]);
        const wBishops = this.CountBits(this.BoardState.PiecesBB[PieceType.Bishop]);
        const bBishops = this.CountBits(this.BoardState.PiecesBB[PieceType.Bishop + 6]);
        const rooks = this.CountBits(this.BoardState.PiecesBB[PieceType.Rook]) + this.CountBits(this.BoardState.PiecesBB[PieceType.Rook + 6]);
        const queens = this.CountBits(this.BoardState.PiecesBB[PieceType.Queen]) + this.CountBits(this.BoardState.PiecesBB[PieceType.Queen + 6]);

        const minors = wKnights + bKnights + wBishops + bBishops;

        if (rooks + queens + pawns === 0) {
            if (minors === 1) {
                // K + minor vs K;
                return true;
            }

            if (minors === 2) {
                if (wKnights === 1 && bKnights === 1) {
                    // KN vs KN
                    return true;
                }

                if (wBishops === 1 && bBishops === 1) {
                    // KB vs KB
                    return true;
                }
            }
        }

        return false;
    }

    /****************************
     * 
     *          Search
     *
     ****************************/
    private readonly INFINITY = 60000;
    private readonly MATE = 30000;
    private readonly MAXPLY = 100;
    private readonly ABORTEDSCORE = 500000;
    private nodesSearched = 0;
    private pvArray: number[][] = Array(this.MAXPLY).fill(0).map(() => Array(this.MAXPLY).fill(0));
    private pvLength = Array(this.MAXPLY).fill(0);
    private killerMoves = Array(this.MAXPLY).fill(0).map(() => Array(2).fill(0));
    private historyMoves = Array(2).fill(0).map(() => Array(64).fill(0).map(() => Array(64).fill(0))); // 2 64x64 arrays
    private counterMoves = Array(64).fill(0).map(() => Array(64).fill(0));
    private bestMoveScore = { move: 0, score: -this.INFINITY };

    GetPv() {
        let pv = "";

        for (let i = 0; i < this.pvLength[0]; i++) {
            pv += this.StringifyMove(this.pvArray[0][i]) + " ";
        }
    
        return pv;
    }

    FormatScore(score: number) {
        if (score < -this.MATE + this.MAXPLY) {
            return `mate ${(-this.MATE - score) / 2}`;
        }

        if (score > this.MATE - this.MAXPLY) {
            return `mate ${(Math.round((this.MATE - score + 1) / 2))}`;
        }

        return `cp ${score | 0}`;
    }

    UpdatePv(move: number) {
        this.pvArray[this.BoardState.Ply][this.BoardState.Ply] = move;
        for (let i = this.BoardState.Ply + 1; i < this.pvLength[this.BoardState.Ply + 1]; i++) {
            this.pvArray[this.BoardState.Ply][i] = this.pvArray[this.BoardState.Ply + 1][i];
        }
        this.pvLength[this.BoardState.Ply] = this.pvLength[this.BoardState.Ply + 1];
    }

    Search(targetDepth: number) {
        this.StartTimer();
        let alpha = -this.INFINITY;
        let beta = this.INFINITY;
        let score = -this.INFINITY;
        const startTime = Date.now();

        // reset pv table
        this.pvArray = Array(this.MAXPLY).fill(0).map(() => Array(this.MAXPLY).fill(0));
        this.pvLength = Array(this.MAXPLY).fill(0);

        this.nodesSearched = 0;
        this.BoardState.Ply = 0;

        for (let color = Color.White; color <= Color.Black; color++) {
            for (let from = Square.a8; from <= Square.h1; from++) {
                for (let to = Square.a8; to <= Square.h1; to++) {
                    this.historyMoves[color][from][to] /= 2;
                }
            }
        }

        // Iterative deepening
        for (let depth = 1; depth <= targetDepth; depth++) {
            let margin = 10;

            // Use aspiration windows at higher depths
            if (depth >= 5) {
                alpha = Math.max(score - margin, -this.INFINITY);
                beta = Math.min(score + margin, this.INFINITY);
            }

            while (true) {
                if (this.Timer.stop) {
                    break;
                }

                score = this.NegaScout(alpha, beta, depth, 0, true);

                // Adjust the aspiration window depending on whether the search failed high or low, or break from the loop if it didn't.
                if (score <= alpha) {
                    alpha = Math.max(score - margin, -this.INFINITY);
                    beta = (alpha + beta) / 2;
                }
                else if (score >= beta) {
                    beta = Math.min(score + margin, this.INFINITY);
                }
                else {
                    break;
                }

                margin += margin / 2;
            }

            if (this.Timer.stop) {
                break;
            }

            const endTime = Date.now();

            console.log(`info depth ${depth} score ${this.FormatScore(score)} nodes ${this.nodesSearched} nps ${(this.nodesSearched * 1000) / (endTime - startTime) | 0} hashfull ${1000 * this.TTUsed / Number(this.TTSize) | 0} time ${endTime - startTime} pv ${this.GetPv()}`);
        }

        console.log(`bestmove ${this.StringifyMove(this.pvArray[0][0])}`);
    }

    NegaScout(alpha: number, beta: number, depth: number, previousMove: number, nullAllowed: boolean): number {
        // Check whether search time is up every 1000 nodes
        if (this.nodesSearched % 1000 === 0) {
            this.CheckTime();

            if (this.Timer.stop) {
                return this.ABORTEDSCORE;
            }
        }

        this.nodesSearched++;

        if (this.BoardState.Ply >= this.MAXPLY) {
            return 0;
        }
        
        this.pvLength[this.BoardState.Ply] = this.BoardState.Ply;

        if (this.BoardState.Ply > 0 && (this.IsRepetition() || this.BoardState.HalfMoves > 100)) {
            return 0;
        }

        if (depth <= 0) {
            return this.Quiescence(alpha, beta, previousMove);
        }

        const isPVNode = beta - alpha > 1;
        let hashFlag = HashFlag.Alpha;
        let bestScore = -this.INFINITY;
        let bestMove = 0;
        let b = beta;
        let ttMove = 0;
        let legalMoves = 0;
        let quietMoves = [];
        let score = -this.INFINITY;

        const entry = this.GetEntry(this.BoardState.Hash);

        if (!isPVNode && entry && entry.Depth >= depth && (entry.Flag === HashFlag.Exact || (entry.Flag === HashFlag.Beta && entry.Score >= beta) || (entry.Flag === HashFlag.Alpha && entry.Score <= alpha))) {
            return entry.Score;
        }

        // Even if the entry doesn't contain a valid score to return, we can still use the move for move ordering
        if (entry) {
            ttMove = entry.Move;
        }

        let staticEval = -this.INFINITY;
        const inCheck = this.IsSquareAttacked(this.GetLS1B(this.BoardState.PiecesBB[PieceType.King + (6 * this.BoardState.SideToMove)]), this.BoardState.SideToMove ^ 1);

        if (ttMove === 0 && depth >= 3) {
            depth = depth - 1;
        }

        if (!inCheck && !isPVNode) {
            staticEval = this.Evaluate();

            // Static null move pruning (reverse futility pruning)
            if (depth <= 5 && staticEval - 60 * depth >= beta && Math.abs(staticEval) < (this.MATE - this.BoardState.Ply)) {
                return staticEval;
            }

            // Null move pruning
            // Don't prune if there are only kings and pawns left
            if (nullAllowed && staticEval >= beta
                && (this.BoardState.OccupanciesBB[this.BoardState.SideToMove] ^ this.BoardState.PiecesBB[PieceType.King + (6 * this.BoardState.SideToMove)] ^ this.BoardState.PiecesBB[PieceType.Pawn + (6 * this.BoardState.SideToMove)]) !== 0n) {
                this.MakeNullMove();

                const R = 3 + Math.floor(depth / 5);
                let score = -this.NegaScout(-beta, -beta + 1, depth - 1 - R, 0, false);

                this.UnmakeNullMove();

                if (score >= beta) {
                    if (Math.abs(score) > (this.MATE - this.BoardState.Ply)) {
                        return beta;
                    }
                    return score;
                }
            }
        }

        // Mate distance pruning
        alpha = Math.max(-this.MATE + this.BoardState.Ply, alpha);
        beta = Math.min(this.MATE - this.BoardState.Ply, beta);

        if (alpha >= beta) {
            return alpha;
        }

        const moves = this.ScoreMoves(this.GenerateMoves(), ttMove, previousMove);

        for (let i = 0; i < moves.length; i++) {
            const move = this.NextMove(moves, i).move;

            if (!isPVNode && !inCheck && !this.IsCapture(move) && !this.IsPromotion(move)) {
                // futility pruning
                if (depth <= 10 && legalMoves > 0 && staticEval + 110 * depth < alpha) {
                    continue;
                }

                // late move pruning
                if (depth <= 4 && legalMoves > 8 * depth) {
                    continue;
                }
            }

            if (!this.MakeMove(move)) {
                this.UnmakeMove(move);
                continue;
            }

            legalMoves++;

            let E = inCheck ? 1 : 0;

            // Late move reductions
            if (depth >= 3 && i > 4) {
                let R = 1 / (4 / depth) | 0;

                if (!this.IsCapture(move) && !this.IsPromotion(move)) {
                    R++;
                }

                R = Math.max(0, R);

                // Reduced-depth search
                score = -this.NegaScout(-alpha - 1, -alpha, depth - 1 - R + E, move, true);

                // if the reduced-depth search fails low, skip the move
                if (score <= alpha) {
                    this.UnmakeMove(move);
                    continue;
                }
            }

            // normal search, if not doing LMR or if LMR did not fail low
            score = -this.NegaScout(-b, -alpha, depth - 1 + E, move, true);

            if (score > alpha && score < beta && i > 1) {
                score = -this.NegaScout(-beta, -alpha, depth - 1 + E, move, true); /* re-search with wider window */
            }

            this.UnmakeMove(move);

            if (this.Timer.stop) {
                return this.ABORTEDSCORE;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }

            if (score > alpha) {
                alpha = score;
                hashFlag = HashFlag.Exact;
                this.UpdatePv(move);

                // If the search score, plus a margin, is below the current best score, we should extend the search
                this.Timer.extended = depth > 1 && score + 35 < this.bestMoveScore.score;
                this.bestMoveScore = { move: bestMove, score: bestScore };
            }

            if (alpha >= beta) {
                hashFlag = HashFlag.Beta;

                // Add killer, history, and counter moves
                if (!this.IsCapture(move)) {
                    this.killerMoves[this.BoardState.Ply][1] = this.killerMoves[this.BoardState.Ply][0];
                    this.killerMoves[this.BoardState.Ply][0] = move;

                    this.counterMoves[this.MoveFrom(previousMove)][this.MoveTo(previousMove)] = move;

                    this.historyMoves[this.BoardState.SideToMove][this.MoveFrom(move)][this.MoveTo(move)] += depth * depth;

                    for (let i = 0; i < quietMoves.length; i++) {
                        this.historyMoves[this.BoardState.SideToMove][this.MoveFrom(quietMoves[i])][this.MoveTo(quietMoves[i])] += -depth * depth;
                    }
                }

                break;
            }

            if (!this.IsCapture(move)) {
                quietMoves.push(move);
            }

            b = alpha + 1;
        }

        // If there are no legal moves, it's either checkmate or stalemate
        if (legalMoves === 0) {
            if (inCheck) {
                return -this.MATE + this.BoardState.Ply;
            }
            else {
                return 0;
            }
        }

        this.StoreEntry(this.BoardState.Hash, depth, bestMove, bestScore, hashFlag);
        
        return bestScore;
    }

    Quiescence(alpha: number, beta: number, previousMove: number) {
        if (this.nodesSearched % 1000 === 0) {
            this.CheckTime();

            if (this.Timer.stop) {
                return this.ABORTEDSCORE;
            }
        }

        this.nodesSearched++;

        if (this.BoardState.Ply >= this.MAXPLY) {
            return 0;
        }

        const isPVNode = beta - alpha > 1;
        let hashFlag = HashFlag.Alpha;
        let ttMove = 0;
        const entry = this.GetEntry(this.BoardState.Hash);

        if (!isPVNode && entry && (entry.Flag === HashFlag.Exact || (entry.Flag === HashFlag.Beta && entry.Score >= beta) || (entry.Flag === HashFlag.Alpha && entry.Score <= alpha))) {
            return entry.Score;
        }

        // Even if the entry doesn't contain a valid score to return, we can still use the move for move ordering
        if (entry) {
            ttMove = entry.Move;
        }

        const staticEval = this.Evaluate();

        if (staticEval >= beta) {
            return staticEval;
        }

        if (staticEval > alpha) {
            alpha = staticEval;
        }

        let bestScore = staticEval;
        let bestMove = 0;
        const moves = this.ScoreMoves(this.GenerateMoves(true), ttMove, previousMove);

        for (let i = 0; i < moves.length; i++) {
            const move = this.NextMove(moves, i).move;

            // delta pruning
            if (staticEval + 150 + this.MGPieceValue[PieceType.Queen] < alpha) {
                continue;
            }

            // skip bad captures (captures that end up losing material)
            if (this.See(move) < 0) {
                continue;
            }

            if (!this.MakeMove(move)) {
                this.UnmakeMove(move);
                continue;
            }

            let score = -this.Quiescence(-beta, -alpha, move);
            this.UnmakeMove(move);

            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }

            if (score >= beta) {
                hashFlag = HashFlag.Beta;
                break;
            }

            if (score > alpha) {
                alpha = score;
                hashFlag = HashFlag.Exact;
            }                
        }

        this.StoreEntry(this.BoardState.Hash, 0, bestMove, bestScore, hashFlag);

        return bestScore;
    }

    See(move: number) {
        const from = this.MoveFrom(move);
        const to = this.MoveTo(move);
        const movingPiece = this.BoardState.Squares[from];
        let capturedPiece = this.BoardState.Squares[to]?.Type;
        let sideToMove = this.BoardState.SideToMove ^ 1;
        const occupancies = this.BoardState.OccupanciesBB[Color.White] | this.BoardState.OccupanciesBB[Color.Black];

        if (movingPiece === undefined || capturedPiece === undefined) {
            // this shouldn't happen
            return 0;
        }

        const knights = this.BoardState.PiecesBB[PieceType.Knight] | this.BoardState.PiecesBB[PieceType.Knight + 6];
        const bishops = this.BoardState.PiecesBB[PieceType.Bishop] | this.BoardState.PiecesBB[PieceType.Bishop + 6];
        const rooks = this.BoardState.PiecesBB[PieceType.Rook] | this.BoardState.PiecesBB[PieceType.Rook + 6];
        const queens = this.BoardState.PiecesBB[PieceType.Queen] | this.BoardState.PiecesBB[PieceType.Queen + 6];
        const bishopQueens = bishops | queens;
        const rookQueens = rooks | queens;
        const maxXray = this.BoardState.PiecesBB[PieceType.Pawn] | this.BoardState.PiecesBB[PieceType.Pawn + 6] | bishops | rooks | queens;

        const gain = [];
        let depth = 0;
        let attackerBB = this.squareBB[from];
        let attdef = this.AttacksTo(to, occupancies, knights, bishopQueens, rookQueens);
        let movedBB = 0n;

        gain[depth] = this.MGPieceValue[capturedPiece];

        while (attackerBB) {
            depth++;

            gain[depth] = this.MGPieceValue[movingPiece.Type] - gain[depth - 1];

            if (Math.max(-gain[depth - 1], gain[depth]) < 0) {
                break;
            }

            attdef ^= attackerBB;
            movedBB |= attackerBB;

            if (attackerBB & maxXray) {
                attdef |= ((bishopQueens & this.GenerateBishopAttacks(occupancies, to)) | (rookQueens & this.GenerateRookAttacks(occupancies, to))) & ~movedBB;
            }

            const { bitboard, piece } = this.GetLeastValuablePiece(attdef, sideToMove, capturedPiece);
            attackerBB = bitboard;
            capturedPiece = piece;
            sideToMove ^= 1;
        }

        while (--depth) {
            gain[depth - 1] = -Math.max(-gain[depth - 1], gain[depth]);
        }

        return gain[0];
    }

    AttacksTo(square: Square, occupancy: bigint, knights: bigint, bishopQueens: bigint, rookQueens: bigint) {
        const pawns = (this.BoardState.PiecesBB[PieceType.Pawn] & this.PawnAttacks[square + 64]) | ((this.BoardState.PiecesBB[PieceType.Pawn + 6] & this.PawnAttacks[square]));
        const kings = (this.BoardState.PiecesBB[PieceType.King] | this.BoardState.PiecesBB[PieceType.King + 6]) & this.KingAttacks[square];

        bishopQueens &= this.GenerateBishopAttacks(occupancy, square);
        rookQueens &= this.GenerateRookAttacks(occupancy, square);

        return pawns | (knights & this.KnightAttacks[square]) | kings | bishopQueens | rookQueens;
    }

    GetLeastValuablePiece(board: bigint, side: Color, piece: PieceType) {
        for (piece = PieceType.Pawn; piece <= PieceType.King; piece++) {
            let subset = board & this.BoardState.PiecesBB[piece + (6 * side)];
            if (subset) {
                return { bitboard: subset & -subset, piece };
            }
        }
        return { bitboard: 0n, piece: 0 };
    }

    IsRepetition() {
        for (let i = this.boardStates.length - this.BoardState.HalfMoves; i < this.boardStates.length - 1; i++) {
            if (this.boardStates[i]?.Hash === this.BoardState.Hash) {
                return true;
            }
        }

        return false;
    }

    /**
     * Loads an FEN string into the engine
     * @param fen The FEN string to load
     */
    LoadFEN(fen: string) {
        this.BoardState.PiecesBB = new BigUint64Array(12);
        this.BoardState.OccupanciesBB = new BigUint64Array(2);
        this.BoardState.CastlingRights = 0;
        this.BoardState.Squares = new Array(64).fill(undefined);
        this.BoardState.EnPassSq = Square.no_sq;
        this.BoardState.Phase = this.PhaseTotal;
        this.BoardState.CastlingSquaresMask = new Array(64).fill(15);

        const pieces = fen.split(" ")[0].split("");

        // Loop over each character in the FEN string
        // Set bitboards according to characters
        let square = 0;
        for (let i = 0; i < pieces.length; i++) {
            const char = pieces[i];

            switch (char.toLowerCase()) {
                case "p": case "n": case "b": case "r":case "q": case "k": {
                    const piece = this.CharToPiece.get(char) as Piece;

                    this.PlacePiece(piece.Type, piece.Color, square);
                    this.BoardState.Phase -= this.PhaseValues[piece.Type];
                    square++;
                    break;
                }
                case "1": case "2": case "3": case "4": case "4": case "5": case "6": case "7": case "8": {
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
        this.BoardState.SideToMove = fen.split(' ')[1] === 'w' ? Color.White : Color.Black;

        // Set castling rights
        const castling = fen.split(' ')[2].split('');
        for (const castle of castling) {
            const side = castle.toUpperCase() === castle ? Color.White : Color.Black;
            const kingSquare = this.GetLS1B(this.BoardState.PiecesBB[PieceType.King + (side * 6)]);
            this.BoardState.CastlingSquaresMask[kingSquare] = side === Color.White ? 12 : 3;

            if (castle.toUpperCase() === "K") {
                const rookSquare = this.BoardState.Squares.findIndex((x, i) => x && x.Type === PieceType.Rook && x.Color === side && i > kingSquare && (i >> 3 === kingSquare >> 3));

                if (side === Color.White) {
                    this.BoardState.CastlingRights |= CastlingRights.WhiteKingside;
                    this.BoardState.CastlingPaths[CastlingRights.WhiteKingside] = (this.betweenMasks[kingSquare][Square.g1] | this.betweenMasks[rookSquare][Square.f1]) & ~(this.BoardState.PiecesBB[PieceType.King + (side * 6)] | this.SetBit(0n, rookSquare));
                    this.BoardState.CastlingRookSquares[CastlingRights.WhiteKingside] = rookSquare;
                    this.BoardState.CastlingSquaresMask[rookSquare] = 14;
                }
                else {
                    this.BoardState.CastlingRights |= CastlingRights.BlackKingside;
                    this.BoardState.CastlingPaths[CastlingRights.BlackKingside] = (this.betweenMasks[kingSquare][Square.g8] | this.betweenMasks[rookSquare][Square.f8]) & ~(this.BoardState.PiecesBB[PieceType.King + (side * 6)] | this.SetBit(0n, rookSquare));
                    this.BoardState.CastlingRookSquares[CastlingRights.BlackKingside] = rookSquare;
                    this.BoardState.CastlingSquaresMask[rookSquare] = 11;
                }
            }
            else if (castle.toUpperCase() === "Q") {
                const rookSquare = this.BoardState.Squares.findIndex((x, i) => x && x.Type === PieceType.Rook && x.Color === side && i < kingSquare && (i >> 3 === kingSquare >> 3));

                if (side === Color.White) {
                    this.BoardState.CastlingRights |= CastlingRights.WhiteQueenside;
                    this.BoardState.CastlingPaths[CastlingRights.WhiteQueenside] = (this.betweenMasks[kingSquare][Square.c1] | this.betweenMasks[rookSquare][Square.d1]) & ~(this.BoardState.PiecesBB[PieceType.King + (side * 6)] | this.SetBit(0n, rookSquare));
                    this.BoardState.CastlingRookSquares[CastlingRights.WhiteQueenside] = rookSquare;
                    this.BoardState.CastlingSquaresMask[rookSquare] = 13;
                }
                else {
                    this.BoardState.CastlingRights |= CastlingRights.BlackQueenside;
                    this.BoardState.CastlingPaths[CastlingRights.BlackQueenside] = (this.betweenMasks[kingSquare][Square.c8] | this.betweenMasks[rookSquare][Square.d8]) & ~(this.BoardState.PiecesBB[PieceType.King + (side * 6)] | this.SetBit(0n, rookSquare));
                    this.BoardState.CastlingRookSquares[CastlingRights.BlackQueenside] = rookSquare;
                    this.BoardState.CastlingSquaresMask[rookSquare] = 7;
                }
            }
            // Shredder-FEN castling notation for Chess960
            else if (castle.toUpperCase() >= "A" && castle.toUpperCase() <= "H") {
                // Kingside castle
                if (castle.toUpperCase().charCodeAt(0) - 65 > (kingSquare & 7)) {
                    const rookSquare = this.BoardState.Squares.findIndex((x, i) => x && x.Type === PieceType.Rook && x.Color === side && i > kingSquare && (i >> 3 === kingSquare >> 3));

                    if (side === Color.White) {
                        this.BoardState.CastlingRights |= CastlingRights.WhiteKingside;
                        this.BoardState.CastlingPaths[CastlingRights.WhiteKingside] = (this.betweenMasks[kingSquare][Square.g1] | this.betweenMasks[rookSquare][Square.f1] | this.squareBB[Square.g1] | this.squareBB[Square.f1]) & ~(this.BoardState.PiecesBB[PieceType.King + (side * 6)] | this.SetBit(0n, rookSquare));
                        this.BoardState.CastlingRookSquares[CastlingRights.WhiteKingside] = rookSquare;
                        this.BoardState.CastlingSquaresMask[rookSquare] = 14;
                    }
                    else {
                        this.BoardState.CastlingRights |= CastlingRights.BlackKingside;
                        this.BoardState.CastlingPaths[CastlingRights.BlackKingside] = (this.betweenMasks[kingSquare][Square.g8] | this.betweenMasks[rookSquare][Square.f8] | this.squareBB[Square.g8] | this.squareBB[Square.f8]) & ~(this.BoardState.PiecesBB[PieceType.King + (side * 6)] | this.SetBit(0n, rookSquare));
                        this.BoardState.CastlingRookSquares[CastlingRights.BlackKingside] = rookSquare;
                        this.BoardState.CastlingSquaresMask[rookSquare] = 11;
                    }
                }
                // Queenside castle
                else {
                    if (side === Color.White) {
                        const rookSquare = this.BoardState.Squares.findIndex((x, i) => x && x.Type === PieceType.Rook && x.Color === side && i >= 56 && i < kingSquare && (i >> 3 === kingSquare >> 3));
                        this.BoardState.CastlingRights |= CastlingRights.WhiteQueenside;
                        this.BoardState.CastlingPaths[CastlingRights.WhiteQueenside] = (this.betweenMasks[kingSquare][Square.c1] | this.betweenMasks[rookSquare][Square.d1] | this.squareBB[Square.c1] | this.squareBB[Square.d1]) & ~(this.BoardState.PiecesBB[PieceType.King + (side * 6)] | this.SetBit(0n, rookSquare));
                        this.BoardState.CastlingRookSquares[CastlingRights.WhiteQueenside] = rookSquare;
                        this.BoardState.CastlingSquaresMask[rookSquare] = 13;
                    }
                    else {
                        const rookSquare = this.BoardState.Squares.findIndex((x, i) => x && x.Type === PieceType.Rook && x.Color === side && i < kingSquare);
                        this.BoardState.CastlingRights |= CastlingRights.BlackQueenside;
                        this.BoardState.CastlingPaths[CastlingRights.BlackQueenside] = (this.betweenMasks[kingSquare][Square.c8] | this.betweenMasks[rookSquare][Square.d8] | this.squareBB[Square.c8] | this.squareBB[Square.d8]) & ~(this.BoardState.PiecesBB[PieceType.King + (side * 6)] | this.SetBit(0n, rookSquare));
                        this.BoardState.CastlingRookSquares[CastlingRights.BlackQueenside] = rookSquare;
                        this.BoardState.CastlingSquaresMask[rookSquare] = 7;
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
            this.BoardState.EnPassSq = enPSquare;
        }

        // Set the game ply. If ply is not set in FEN, set it to 0
        this.BoardState.Ply = parseInt(fen.split(' ')[5]) * 2 || 0;
        // Ply is only incremented after black's move,
        // so if it's black's turn, we have to decrease by 1
        if (this.BoardState.SideToMove === Color.Black) {
            this.BoardState.Ply--;

            if (this.BoardState.Ply < 0) {
                this.BoardState.Ply = 1;
            }
        }

        // Set the halfmove clock
        this.BoardState.HalfMoves = parseInt(fen.split(' ')[4]) || 0;

        // Generate the hashes for the position
        const { hash, pawnHash } = this.GenerateHashes();
        this.BoardState.Hash = hash;
        this.BoardState.PawnHash = pawnHash;
    }

    /**
     * Get the current board position as a FEN string
     */
    GenerateFEN() {
        let fen = "";

        // Add all the pieces (and empty spaces)
        for (let rank = 0; rank <= 7; rank++) {
            let empty = 0;

            for (let file = 0; file <= 7; file++) {
                const square = rank * 8 + file;
                const piece = this.BoardState.Squares[square];

                if (piece === undefined) {
                    empty++;
                    continue;
                }

                if (empty > 0) {
                    fen += empty.toString();
                    empty = 0;
                }

                let pieceChar = this.PieceToChar.get(piece.Type) as string;

                if (piece.Color === Color.Black) {
                    pieceChar = pieceChar.toLowerCase();
                }

                fen += pieceChar;
            }

            if (empty > 0) {
                fen += empty.toString();
            }

            if (rank >= 0 && rank !== 7) {
                fen += "/";
            }
        }

        if (this.BoardState.SideToMove === Color.White) {
            fen += " w ";
        }
        else {
            fen += " b ";
        }

        if (this.BoardState.CastlingRights === 0) {
            fen += "-";
        }
        if ((this.BoardState.CastlingRights & CastlingRights.WhiteKingside) !== 0) {
            fen += "K";
        }
        if ((this.BoardState.CastlingRights & CastlingRights.WhiteQueenside) !== 0) {
            fen += "Q";
        }
        if ((this.BoardState.CastlingRights & CastlingRights.BlackKingside) !== 0) {
            fen += "k";
        }
        if ((this.BoardState.CastlingRights & CastlingRights.BlackQueenside) !== 0) {
            fen += "q";
        }

        fen += " ";

        if (this.BoardState.EnPassSq === Square.no_sq) {
            fen += "-";
        }
        else {
            const rank = ((this.BoardState.EnPassSq ^ 56) / 8) | 0;
            const file = (this.BoardState.EnPassSq ^ 56) % 8;
            const square = `${String.fromCharCode(file + "a".charCodeAt(0))}${rank + 1}`
            fen += square;
        }

        fen += " " + this.BoardState.HalfMoves.toString();

        // fen += " " + this.BoardState.Ply.toString();

        return fen;
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

    /**
     * Prints a graphical representation of the current board position to the console
     */
    PrintBoard() {
        const unicode = [ ["♙", "♘", "♗", "♖", "♕", "♔"], ["♟︎", "♞", "♝", "♜", "♛", "♚"] ];
        for (let rank = 0; rank < 8; rank++) {
            let r = "";
            for (let file = 0; file < 8; file++) {
                let square = rank * 8 + file;
                let piece = this.BoardState.Squares[square] ?? null;

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
        console.log(`Side to move: ${this.BoardState.SideToMove === Color.White ? 'white' : 'black'}`);
        console.log(`En passant: ${this.BoardState.EnPassSq !== Square.no_sq ? Square[this.BoardState.EnPassSq] : "no"}`);
        console.log(`Castling rights: ${this.BoardState.CastlingRights & CastlingRights.WhiteKingside ? 'K' : '-'}${this.BoardState.CastlingRights & CastlingRights.WhiteQueenside ? 'Q' : '-'}${this.BoardState.CastlingRights & CastlingRights.BlackKingside ? 'k' : '-'}${this.BoardState.CastlingRights & CastlingRights.BlackQueenside ? 'q' : '-'}`);
        console.log(`Plies: ${this.BoardState.Ply}`);
    }

    /***************************
     * 
     *     Time Management
     * 
     **************************/

    private readonly Timer = {
        timeleft: -1, // infinite time left
        increment: 0,
        depth: this.MAXPLY,
        movestogo: 0,
        startTime: 0,
        stopTime: 0,
        movetime: -1, // infinite time per move
        stop: false,
        extended: false,
    }

    StartTimer() {
        let searchTime = 0;
        this.Timer.stop = false;
        this.Timer.extended = false;

        // If infinite time, we don't need to set any time limit on searching
        if (this.Timer.timeleft === -1 && this.Timer.movetime === -1) {
            return;
        }

        // If there are X moves left before the next time control
        if (this.Timer.movestogo !== 0) {
            const movesLeft = Math.min(Math.max(this.Timer.movestogo, 2), 30);
            searchTime = this.Timer.timeleft / movesLeft;
        }
        // If told to search for a specific time
        else if (this.Timer.movetime !== -1) {
            searchTime = this.Timer.movetime;
        }
        else {
            let movesLeft = 25;
            if (this.BoardState.Ply <= 20) {
                movesLeft = 45 - this.BoardState.Ply;
            }

            searchTime = (this.Timer.timeleft / movesLeft) + (this.Timer.increment / 2);
        }

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
            // If time limit has been exceeded and search was done to a set time limit...
            if (this.Timer.movetime !== -1) {
                this.Timer.stop = true;
                return;
            }

            if (!this.Timer.extended) {
                this.Timer.stop = true;
                return;
            }

            if (Date.now() - this.Timer.startTime >= this.Timer.timeleft * 0.60) {
                this.Timer.stop = true;
                return;
            }

            return;
        }

        // Search for at least the calculated time limit, but can search longer if extended (up to 75% of the total time left)
        if (Date.now() > this.Timer.stopTime && (!this.Timer.extended || Date.now() - this.Timer.startTime >= (this.Timer.timeleft * 0.75))) {
            this.Timer.stop = true;
        }
    }

    /***************************
     * 
     *          UCI
     * 
     **************************/

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

        const piece = this.BoardState.Squares[from] as Piece;
        let moveType = MoveType.Quiet;

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
        // Check if the move was a castling move
        if (piece.Type === PieceType.King) {
            const kingSide = to > from;

            // Castling in standard chess always has the same strings...
            if (!this.isChess960 && (move === "e1g1" || move === "e1c1" || move === "e8g8" || move === "e8c8")) {
                to = (kingSide ? Square.h1 : Square.a1) ^ (piece.Color * 56);
                moveType = kingSide ? MoveType.KingCastle : MoveType.QueenCastle;
            }
            // Chess960 is a little more hard to parse. We have to check if the move is to the rook square and the side still has castling rights.
            else if (
                (to === this.BoardState.CastlingRookSquares[CastlingRights.WhiteKingside] && this.BoardState.CastlingRights & CastlingRights.WhiteKingside)
                || (to === this.BoardState.CastlingRookSquares[CastlingRights.BlackKingside] && this.BoardState.CastlingRights & CastlingRights.BlackKingside)
                || (to === this.BoardState.CastlingRookSquares[CastlingRights.WhiteQueenside] && this.BoardState.CastlingRights & CastlingRights.WhiteQueenside)
                || (to === this.BoardState.CastlingRookSquares[CastlingRights.BlackQueenside] && this.BoardState.CastlingRights & CastlingRights.BlackQueenside)
            ) {
                moveType = kingSide ? MoveType.KingCastle : MoveType.QueenCastle;
            }
        }
        // If en passant capture
        else if (to === this.BoardState.EnPassSq && piece.Type === PieceType.Pawn) {
            moveType = MoveType.EPCapture;
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
        const sidePrefix = this.BoardState.SideToMove === Color.White ? "w" : "b";

        let timeleft = -1; // negative value indicates infinite time
        let increment = 0;
        let movestogo = 0;
        let movetime = -1; // -1 is infinite
        let depth = this.MAXPLY;

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
                depth = Math.min(parseInt(commands[i + 1]), this.MAXPLY);
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

    /****************************
     * 
     *       Perft Tests
     *
     ****************************/

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
                    console.log(`${this.StringifyMove(move)}: ${nodes}`);
                }
            }
    
            this.UnmakeMove(move);
        }
    
        const end = performance.now();
        if (printNodes) {
            console.log(`Nodes: ${this.totalNodes.toLocaleString()}. nps: ${Math.round((this.totalNodes * 1000 / (end-start))).toLocaleString()}. Total time taken: ${end - start} ms`);
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
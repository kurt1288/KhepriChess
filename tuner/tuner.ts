import fs from "fs";
import path from "path";
import readline from "readline";
import CLIProgress from "cli-progress";
import Khepri, { CastlingRights, Color, Direction, MoveType, Piece, PieceType } from '.././src/engine';

interface Indexes {
    MG_Material_StartIndex: number
    EG_Material_StartIndex: number
    EG_PSQT_StartIndex: number
    MG_KnightOutpost_StartIndex: number
    EG_KnightOutpost_StartIndex: number
    MG_RookOpenFileBonus_StartIndex: number;
    MG_RookSemiOpenFileBonus_StartIndex: number;
    EG_PawnDuoMulti_StartIndex: number;
    EG_PawnSupportMulti_StartIndex: number;
    MG_DoubledPawn_StartIndex: number;
    EG_DoubledPawn_StartIndex: number;
    MG_PassedPawn_StartIndex: number;
    EG_PassedPawn_StartIndex: number;
    MG_BishopPair_StartIndex: number;
    EG_BishopPair_StartIndex: number;
    MG_IsolatedPawn_StartIndex: number;
    EG_IsolatedPawn_StartIndex: number;
}

enum Outcome {
    BlackWin = 0.0,
    Draw = 0.5,
    WhiteWin = 1.0,
}

interface Coefficient {
    index: number
    value: number
}

interface Position {
    normals: Coefficient[]
    outcome: Outcome
    MGPhase: number
}

export default class Tuner {
    readonly Engine = new Khepri();
    private readonly LearningRate = 0.5;
    private readonly ScalingFactor = 0.01;
    private readonly Epsilon = 0.00000001;

    /**
     *
     * @param epochs Number of epochs to run
     * @param numPositions Number of positions to test per epoch. "0" to test all positions loaded
     */
    Tune(epochs: number, numPositions: number) {
        const { weights, indexes } = this.LoadWeights();

        const positions = this.LoadPositions(indexes, numPositions, weights.length);

        console.log("Tuning...");
        const progress = new CLIProgress.SingleBar({
            format: '{bar} | {percentage}% | {value}/{total} epochs | Elapsed time: {duration_formatted} | ETA: {eta_formatted}',
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            hideCursor: true,
            etaBuffer: 1000,
        });
        progress.start(epochs, 0);

        const gradientsSumsSquared = new Array(weights.length).fill(0);
        const beforeErr = this.ComputeMSE(positions, weights);

        if (numPositions === 0) {
            numPositions = positions.length;
        }

        let N = numPositions;
        let learningRate = this.LearningRate;
        const errors: number[] = [];

        for (let epoch = 0; epoch < epochs; epoch++) {
            let gradients = this.ComputeGradient(positions, weights);

            for (let [index, gradient] of gradients.entries()) {
                const leadingCoefficent = (-2 * this.ScalingFactor) / N;
                gradientsSumsSquared[index] += (leadingCoefficent * gradient) * (leadingCoefficent * gradient);
                weights[index] += (leadingCoefficent * gradient) * (-learningRate / Math.sqrt(gradientsSumsSquared[index] + this.Epsilon));
            }

            errors.push(this.ComputeMSE(positions, weights));
            progress.update(epoch + 1);
        }

        progress.stop();
        const file = fs.createWriteStream("errors.txt");
        file.on("error", (err) => {
            throw new Error("Unable to write errors to file");
        });
        for (const [index, value] of errors.entries()) {
            file.write(`${index}, ${value}\n`);
        }
        file.end();

        console.log(`Best error before tuning: ${beforeErr}`);
        console.log(`Best error after tuning: ${this.ComputeMSE(positions, weights)}`);
        this.PrintResults(weights, indexes);
    }

    PrintResults(weights: number[], indexes: Indexes) {
        console.log(`MG Piece Values: ${weights.slice(indexes.MG_Material_StartIndex, indexes.MG_Material_StartIndex + 5).map(x => Math.round(x))}`);
        console.log(`EG Piece Values: ${weights.slice(indexes.EG_Material_StartIndex, indexes.EG_Material_StartIndex + 5).map(x => Math.round(x))}`);

        const pieceNames = [ "Pawn", "Knight", "Bishop", "Rook", "Queen", "King" ];

        for (let piece = 0, index = 0; piece <= 5; piece++, index += 64) {
            console.log(`MG ${pieceNames[piece]} PST = `);
            console.log(`[`);
            const slice = weights.slice(index, index + 64);
            const pst: number[] = [];
            for (let i = 0; i < slice.length; i++) {
                pst[i] = Math.round(slice[i]);
            }
            for (let i = 0; i < 64; i += 8) {
                console.log(pst.slice(i, i + 8).join(", ").concat(", "));
            }
            console.log(`]`);
        }

        for (let piece = 0, index = 0; piece <= 5; piece++, index += 64) {
            console.log(`EG ${pieceNames[piece]} PST = `);
            console.log(`[`);
            const slice = weights.slice(indexes.EG_PSQT_StartIndex + index, indexes.EG_PSQT_StartIndex + index + 64);
            const pst: number[] = [];
            for (let i = 0; i < slice.length; i++) {
                pst[i] = Math.round(slice[i]);
            }
            for (let i = 0; i < 64; i += 8) {
                console.log(pst.slice(i, i + 8).join(", ").concat(", "));
            }
            console.log(`]`);
        }

        console.log(`MG Knight Outpost Score: ${weights.slice(indexes.MG_KnightOutpost_StartIndex, indexes.MG_KnightOutpost_StartIndex + 1).map(x => Math.round(x))}`);
        console.log(`EG Knight Outpost Score: ${weights.slice(indexes.EG_KnightOutpost_StartIndex, indexes.EG_KnightOutpost_StartIndex + 1).map(x => Math.round(x))}`);
        console.log(`Rook File Semi-Open Score: ${weights.slice(indexes.MG_RookSemiOpenFileBonus_StartIndex, indexes.MG_RookSemiOpenFileBonus_StartIndex + 1).map(x => Math.round(x))}`);
        console.log(`Rook File Open Score: ${weights.slice(indexes.MG_RookOpenFileBonus_StartIndex, indexes.MG_RookOpenFileBonus_StartIndex + 1).map(x => Math.round(x))}`);
        console.log(`EG Pawn Duo Multi: ${weights.slice(indexes.EG_PawnDuoMulti_StartIndex, indexes.EG_PawnDuoMulti_StartIndex + 7).map(x => Math.round(x))}`);
        console.log(`EG Pawn Support Multi: ${weights.slice(indexes.EG_PawnSupportMulti_StartIndex, indexes.EG_PawnSupportMulti_StartIndex + 7).map(x => Math.round(x))}`);
        console.log(`MG Doubled Pawn: ${weights.slice(indexes.MG_DoubledPawn_StartIndex, indexes.MG_DoubledPawn_StartIndex + 1).map(x => Math.round(x))}`);
        console.log(`EG Doubled Pawn: ${weights.slice(indexes.EG_DoubledPawn_StartIndex, indexes.EG_DoubledPawn_StartIndex + 1).map(x => Math.round(x))}`);
        console.log(`MG Passed Pawn: ${weights.slice(indexes.MG_PassedPawn_StartIndex, indexes.MG_PassedPawn_StartIndex + 7).map(x => Math.round(x))}`);
        console.log(`EG Passed Pawn: ${weights.slice(indexes.EG_PassedPawn_StartIndex, indexes.EG_PassedPawn_StartIndex + 7).map(x => Math.round(x))}`);
        console.log(`MG Bishop Pair: ${weights.slice(indexes.MG_BishopPair_StartIndex, indexes.MG_BishopPair_StartIndex + 1).map(x => Math.round(x))}`);
        console.log(`EG Bishop Pair: ${weights.slice(indexes.EG_BishopPair_StartIndex, indexes.EG_BishopPair_StartIndex + 1).map(x => Math.round(x))}`);
        console.log(`MG Isolated Pawn: ${weights.slice(indexes.MG_IsolatedPawn_StartIndex, indexes.MG_IsolatedPawn_StartIndex + 1).map(x => Math.round(x))}`);
        console.log(`EG Isolated Pawn: ${weights.slice(indexes.EG_IsolatedPawn_StartIndex, indexes.EG_IsolatedPawn_StartIndex + 1).map(x => Math.round(x))}`);
    }

    Evaluate(weights: number[], normals: Coefficient[]) {
        let score = 0;

        for (let i of normals) {
            score += weights[i.index] * i.value;
            if (isNaN(score)) {
                throw new Error(`Invalid score returned: ${score}. i: ${i}`);
            }
        }

        return score;
    }

    ComputeMSE(positions: Position[], weights: number[]) {
        let errorSum = 0;

        for (let position of positions) {
            let score = this.Evaluate(weights, position.normals);
            let sigmoid = 1 / (1 + Math.exp(-(this.ScalingFactor * score)));
            let error = position.outcome - sigmoid;
            errorSum += Math.pow(error, 2);
        }

        return errorSum / positions.length;
    }

    ComputeGradient(positions: Position[], weights: number[]) {
        const gradients: number[] = new Array(weights.length).fill(0);

        for (let position of positions) {
            let score = this.Evaluate(weights, position.normals);
            let sigmoid = 1 / (1 + Math.exp(-(this.ScalingFactor * score)));
            let error = position.outcome - sigmoid;

            let term = error * (1 - sigmoid) * sigmoid;

            for (let normal of position.normals) {
                gradients[normal.index] += term * normal.value;
            }
        }

        return gradients;
    }

    LoadWeights() {
        const weights: number[] = [];
        const indexes: Indexes = {
            // MG_PSQT_StartIndex begins at 0
            EG_PSQT_StartIndex: 64 * 6,
            MG_Material_StartIndex: 0,
            EG_Material_StartIndex: 0,
            MG_KnightOutpost_StartIndex: 0,
            EG_KnightOutpost_StartIndex: 0,
            MG_RookOpenFileBonus_StartIndex: 0,
            MG_RookSemiOpenFileBonus_StartIndex: 0,
            EG_PawnDuoMulti_StartIndex: 0,
            EG_PawnSupportMulti_StartIndex: 0,
            MG_DoubledPawn_StartIndex: 0,
            EG_DoubledPawn_StartIndex: 0,
            MG_PassedPawn_StartIndex: 0,
            EG_PassedPawn_StartIndex: 0,
            MG_BishopPair_StartIndex: 0,
            EG_BishopPair_StartIndex: 0,
            MG_IsolatedPawn_StartIndex: 0,
            EG_IsolatedPawn_StartIndex: 0,
        };

        let index = 0;

        for (let i = 0; i <= 5; i++) {
            weights.splice(index, 0, ...this.Engine.PST[0][i]);
            weights.splice(384 + index, 0, ...this.Engine.PST[1][i]);
            index += 64;
        }

        index *= 2;

        indexes.MG_Material_StartIndex = index;
        indexes.EG_Material_StartIndex = index + 5;

        weights.splice(indexes.MG_Material_StartIndex, 0, ...this.Engine.MGPieceValue.slice(0, -1));
        weights.splice(indexes.EG_Material_StartIndex, 0, ...this.Engine.EGPieceValue.slice(0, -1));

        index += 10;

        indexes.MG_KnightOutpost_StartIndex = index;
        weights.splice(indexes.MG_KnightOutpost_StartIndex, 0, this.Engine.MGKnightOutpost);

        indexes.EG_KnightOutpost_StartIndex = index + 1;
        weights.splice(indexes.EG_KnightOutpost_StartIndex, 0, this.Engine.EGKnightOutpost);

        indexes.MG_RookOpenFileBonus_StartIndex = index + 2;
        weights.splice(indexes.MG_RookOpenFileBonus_StartIndex, 0, this.Engine.MGRookOpenFileBonus);

        indexes.MG_RookSemiOpenFileBonus_StartIndex = index + 3;
        weights.splice(indexes.MG_RookSemiOpenFileBonus_StartIndex, 0, this.Engine.MGRookSemiOpenFileBonus);

        index += 4;

        indexes.EG_PawnDuoMulti_StartIndex = index;
        weights.splice(indexes.EG_PawnDuoMulti_StartIndex, 0, ...this.Engine.PawnDuoMulti);

        indexes.EG_PawnSupportMulti_StartIndex = index + 7;
        weights.splice(indexes.EG_PawnSupportMulti_StartIndex, 0, ...this.Engine.PawnSupportMulti);

        indexes.MG_DoubledPawn_StartIndex = weights.length;
        weights.splice(indexes.MG_DoubledPawn_StartIndex, 0, this.Engine.MGDoubledPawn);

        indexes.EG_DoubledPawn_StartIndex = weights.length;
        weights.splice(indexes.EG_DoubledPawn_StartIndex, 0, this.Engine.EGDoubledPawn);

        indexes.MG_PassedPawn_StartIndex = weights.length;
        weights.splice(indexes.MG_PassedPawn_StartIndex, 0, ...this.Engine.MGPassedPawnRank);

        indexes.EG_PassedPawn_StartIndex = weights.length;
        weights.splice(indexes.EG_PassedPawn_StartIndex, 0, ...this.Engine.EGPassedPawnRank);

        indexes.MG_BishopPair_StartIndex = weights.length;
        weights.splice(indexes.MG_BishopPair_StartIndex, 0, this.Engine.MGBishopPair);

        indexes.EG_BishopPair_StartIndex = weights.length;
        weights.splice(indexes.EG_BishopPair_StartIndex, 0, this.Engine.EGBishopPair);

        indexes.MG_IsolatedPawn_StartIndex = weights.length;
        weights.splice(indexes.MG_IsolatedPawn_StartIndex, 0, this.Engine.MGIsolatedPawn);

        indexes.EG_IsolatedPawn_StartIndex = weights.length;
        weights.splice(indexes.EG_IsolatedPawn_StartIndex, 0, this.Engine.EGIsolatedPawn);

        return { weights, indexes };
    }

    LoadPositions(indexes: Indexes, numPositions: number, weightsLength: number): Position[] {
        const positions: Position[] = [];
        const reg = new RegExp("\"(.*?)\"");

        console.log("Loading positions...");

        const progress = new CLIProgress.SingleBar({
            format: '{bar} | {percentage}% | {value}/{total} positions | Elapsed time: {duration_formatted} | ETA: {eta_formatted}',
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            hideCursor: true,
            etaBuffer: 1000,
        });

        try {
            const data = fs.readFileSync(path.join(__dirname, "./positions.txt"), "utf8");
            const lines = data.split("\n");

            if (numPositions === 0) {
                numPositions = lines.length;
            }

            progress.start(numPositions, 0);

            for (let i = 0; i < numPositions; i++) {
                const line = lines[i];
                const fen = line.split("\"")[0];
                const value = (line.match(reg) as RegExpMatchArray)[1];
                let result = Outcome.Draw;

                if (value === "0-1") {
                    result = Outcome.BlackWin;
                }
                else if (value === "1-0") {
                    result = Outcome.WhiteWin;
                }

                this.Engine.LoadFEN(fen);

                const coefficients = this.GetCoefficients(indexes, weightsLength);

                const phase = ((this.Engine.BoardState.Phase * 256 + (this.Engine.PhaseTotal / 2)) / this.Engine.PhaseTotal) | 0;
                const mgPhase = (256-phase) / 256;

                progress.update(i + 1);
                positions.push({ normals: coefficients, outcome: result, MGPhase: mgPhase });
            }

            progress.stop();
        }
        catch (error) {
            console.log(error);
        }

        return positions;
    }

    GetCoefficients(indexes: Indexes, weightsLength: number) {
        const rawNormals = new Array(weightsLength).fill(0);
        const normals: Coefficient[] = [];
        const phase = ((this.Engine.BoardState.Phase * 256 + (this.Engine.PhaseTotal / 2)) / this.Engine.PhaseTotal) | 0;
        const mgPhase = (256 - phase) / 256;
        const egPhase = phase / 256;
        const bishopCount = [0, 0];

        let allOccupancies = this.Engine.BoardState.OccupanciesBB[0] | this.Engine.BoardState.OccupanciesBB[1];

        while (allOccupancies) {
            let square = this.Engine.GetLS1B(allOccupancies);
            let actualSquare = square;
            allOccupancies = this.Engine.RemoveBit(allOccupancies, square);
            const piece = this.Engine.BoardState.Squares[square] as Piece;
            const rank = piece.Color === Color.White ? 8 - (square >> 3) : 1 + (square >> 3);
            const up = piece.Color === Color.White ? Direction.NORTH : Direction.SOUTH;
            let sign = 1;

            // Because the PST are from white's perspective, we have to flip the square if the piece is black's
            if (piece.Color === 1) {
                square ^= 56;
                sign = -1;
            }

            // PST coefficients
            const mgIndex = (piece.Type * 64) + square;
            const egIndex = indexes.EG_PSQT_StartIndex + mgIndex;
            rawNormals[mgIndex] += sign * mgPhase;
            rawNormals[egIndex] += sign * egPhase;

            switch (piece.Type) {
                case PieceType.Pawn: {
                    // pawn duos (pawns with a neighboring pawn)
                    if (this.Engine.Shift(this.Engine.squareBB[actualSquare], Direction.EAST) & this.Engine.BoardState.PiecesBB[PieceType.Pawn + (6 * piece.Color)]) {
                        // mg[piece.Color] += 3 * this.PawnRankMulti[rank - 1]; // [0, 1, 1.25, 2, 5, 8, 15, 0]
                        // eg[piece.Color] += this.Engine.PawnDuoMulti[rank - 1]; // [0, 10, 14, 25, 80, 150, 250, 0]
                        rawNormals[indexes.EG_PawnDuoMulti_StartIndex + (rank - 1)] += sign * egPhase;
                    }

                    // defending pawn(s)?
                    if (this.Engine.PawnAttacks[actualSquare + (64 * (piece.Color ^ 1))] & this.Engine.BoardState.PiecesBB[PieceType.Pawn + (6 * piece.Color)]) {
                        // mg[piece.Color] += 2 * this.PawnRankMulti[rank - 1]; // [0, 1, 1.25, 2, 5, 8, 15, 0]
                        // eg[piece.Color] += this.Engine.PawnSupportMulti[rank - 1]; // [0, 0, 25, 40, 75, 100, 225, 0]
                        rawNormals[indexes.EG_PawnSupportMulti_StartIndex + (rank - 1)] += sign * egPhase;
                    }

                    // doubled pawns
                    if ((this.Engine.Shift(this.Engine.squareBB[actualSquare], up * -1) & this.Engine.BoardState.PiecesBB[PieceType.Pawn + (6 * piece.Color)]) !== 0n) {
                        rawNormals[indexes.MG_DoubledPawn_StartIndex] -= sign * mgPhase;
                        rawNormals[indexes.EG_DoubledPawn_StartIndex] -= sign * egPhase;
                    }

                    // passed pawns
                    if ((this.Engine.Fill(up * -1, actualSquare) & this.Engine.BoardState.PiecesBB[PieceType.Pawn + (6 * piece.Color)]) === 0n && (this.Engine.passedMasks[piece.Color][square] & this.Engine.BoardState.PiecesBB[PieceType.Pawn + (6 * (piece.Color ^ 1))]) === 0n) {
                        rawNormals[indexes.MG_PassedPawn_StartIndex + (rank - 1)] += sign * mgPhase;
                        rawNormals[indexes.EG_PassedPawn_StartIndex + (rank - 1)] += sign * egPhase;
                    }

                    // isolated pawns
                    if ((this.Engine.isolatedMasks[actualSquare] & this.Engine.BoardState.PiecesBB[PieceType.Pawn + (6 * piece.Color)]) === 0n) {
                        rawNormals[indexes.MG_IsolatedPawn_StartIndex] -= sign * mgPhase;
                        rawNormals[indexes.EG_IsolatedPawn_StartIndex] -= sign * egPhase;
                    }

                    break;
                }
                case PieceType.Knight: {
                    // OUTPOSTS:
                    // First condition checks if the square is defended by a pawn,
                    // second condition checks if the square is attacked by an enemy pawn
                    if ((this.Engine.PawnAttacks[actualSquare + (64 * (piece.Color ^ 1))] & this.Engine.BoardState.PiecesBB[PieceType.Pawn + (6 * piece.Color)])
                        && !(this.Engine.PawnAttacks[actualSquare + (64 * (piece.Color))] & this.Engine.BoardState.PiecesBB[PieceType.Pawn + (6 * (piece.Color ^ 1))])) {
                            rawNormals[indexes.MG_KnightOutpost_StartIndex] += sign * mgPhase;
                            rawNormals[indexes.EG_KnightOutpost_StartIndex] += sign * egPhase;
                    }
                    break;
                }
                case PieceType.Bishop: {
                    bishopCount[piece.Color]++;
                    break;
                }
                case PieceType.Rook: {
                    // (SEMI-) OPEN FILE
                    // First condition checks for friendly pawns on the same file (semi-open file)
                    // Second condition checks for enemy pawns on the same file (open file)
                    if ((this.Engine.fileMasks[actualSquare] & this.Engine.BoardState.PiecesBB[PieceType.Pawn + (6 * piece.Color)]) === 0n) {
                        if ((this.Engine.fileMasks[actualSquare] & this.Engine.BoardState.PiecesBB[PieceType.Pawn + (6 * (piece.Color ^ 1))]) === 0n) {
                            rawNormals[indexes.MG_RookOpenFileBonus_StartIndex] += sign * mgPhase;
                        }
                        else {
                            rawNormals[indexes.MG_RookSemiOpenFileBonus_StartIndex] += sign * mgPhase;
                        }
                    }
                    break;
                }
            }
        }

        if (bishopCount[Color.White] >= 2) {
            rawNormals[indexes.MG_BishopPair_StartIndex] += mgPhase;
            rawNormals[indexes.EG_BishopPair_StartIndex] += egPhase;
        }

        if (bishopCount[Color.Black] >= 2) {
            rawNormals[indexes.MG_BishopPair_StartIndex] -= mgPhase;
            rawNormals[indexes.EG_BishopPair_StartIndex] -= egPhase;
        }

        // Material coeffs
        for (let piece = 0; piece <= 4; piece++) {
            const whiteCount = this.Engine.CountBits(this.Engine.BoardState.PiecesBB[piece]);
            const blackCount = this.Engine.CountBits(this.Engine.BoardState.PiecesBB[piece + 6]);
            rawNormals[indexes.MG_Material_StartIndex + piece] = (whiteCount - blackCount) * mgPhase;
            rawNormals[indexes.EG_Material_StartIndex + piece] = (whiteCount - blackCount) * egPhase;
        }

        for (let [index, normal] of rawNormals.entries()) {
            if (normal !== 0) {
                normals.push({ index, value: normal });
            }
        }

        return normals;
    }
}

class Game {
    private Engine = new Khepri();
    Result: string | null = null;
    Positions: string[];

    constructor() {
        this.Positions = [];
    }

    private readonly CharToPiece = new Map([
        ["N", PieceType.Knight],
        ["B", PieceType.Bishop],
        ["R", PieceType.Rook],
        ["Q", PieceType.Queen],
        ["K", PieceType.King],
    ]);

    Reset() {
        this.Positions.length = 0;
        this.Result = null;
        // this.Engine.Reset();
        this.Engine.LoadFEN(Khepri.positions.start);
    }

    LoadFEN(fen: string) {
        this.Engine.LoadFEN(fen);
    }

    IsChess960(value: boolean) {
        this.Engine.isChess960 = value; 
    }

    CoordsToSquare(coords: string) {
        if (coords.length !== 2) {
            throw new Error(`Incorrect length on coords: ${coords}`);
        }

        const file = coords.charCodeAt(0) - "a".charCodeAt(0);
        const rank = coords.charCodeAt(1) - '1'.charCodeAt(0);

        const square = (rank * 8 + file) ^ 56;

        if (square > 63 || square < 0) {
            throw new Error(`Square from coords outside of board bounds: ${coords}`);
        }

        return square;
    }

    GetSANMove(sanmove: string, line: string) {
        // Check or checkmate symbol aren't required
        if (sanmove.endsWith("+") || sanmove.endsWith("#")) {
            sanmove = sanmove.slice(0, -1);
        }

        if (sanmove === "O-O") {
            const kingSquare = this.Engine.GetLS1B(this.Engine.BoardState.PiecesBB[PieceType.King + (6 * this.Engine.BoardState.SideToMove)]);
            if (this.Engine.BoardState.SideToMove === Color.White) {
                return this.Engine.EncodeMove(kingSquare, this.Engine.BoardState.CastlingRookSquares[CastlingRights.WhiteKingside], MoveType.KingCastle);
            }
            else {
                return this.Engine.EncodeMove(kingSquare, this.Engine.BoardState.CastlingRookSquares[CastlingRights.BlackKingside], MoveType.KingCastle);
            }
        }

        if (sanmove === "O-O-O") {
            const kingSquare = this.Engine.GetLS1B(this.Engine.BoardState.PiecesBB[PieceType.King + (6 * this.Engine.BoardState.SideToMove)]);
            if (this.Engine.BoardState.SideToMove === Color.White) {
                return this.Engine.EncodeMove(kingSquare, this.Engine.BoardState.CastlingRookSquares[CastlingRights.WhiteQueenside], MoveType.QueenCastle);
            }
            else {
                return this.Engine.EncodeMove(kingSquare, this.Engine.BoardState.CastlingRookSquares[CastlingRights.BlackQueenside], MoveType.QueenCastle);
            }
        }

        const moves = sanmove.includes("x") ? this.Engine.GenerateMoves(true) : this.Engine.GenerateMoves();

        const sanPiece = sanmove.charAt(0) === sanmove.charAt(0).toLowerCase() ? PieceType.Pawn : this.CharToPiece.get(sanmove.charAt(0)) as PieceType;

        for (let move of moves) {
            const from = this.Engine.MoveFrom(move);
            const to = this.Engine.MoveTo(move);
            const piece = this.Engine.BoardState.Squares[from] as Piece;
            const moveString = this.Engine.StringifyMove(move);

            if (piece.Type !== sanPiece) {
                continue;
            }

            if (sanPiece === PieceType.Pawn) {
                let sanTo = -1;

                if (sanmove.includes("x")) {
                    sanTo = this.CoordsToSquare(sanmove.substring(2, 4));
                }
                else if (sanmove.includes("=")) {
                    sanTo = this.CoordsToSquare(sanmove.substring(0, 2));
                }
                else {
                    sanTo = this.CoordsToSquare(sanmove);
                }

                // skip if the to squares don't match
                if (sanTo !== to) {
                    continue;
                }

                // skip if the from squares' files don't match
                if ((sanmove.charCodeAt(0) - 97) !== (from & 7)) {
                    continue;
                }

                // promotion
                if (sanmove.includes("=")) {
                    // skip moves in the list that aren't a promotion if the san move is a promotion
                    if (!this.Engine.IsPromotion(move)) {
                        continue;
                    }

                    const promotionType = sanmove.charAt(sanmove.length - 1);

                    // skip if the promotion pieces don't match
                    if (promotionType.toLowerCase() !== moveString.charAt(moveString.length - 1)) {
                        continue;
                    }

                    if (!this.Engine.MakeMove(move)) {
                        this.Engine.UnmakeMove(move);
                        continue;
                    }
                    this.Engine.UnmakeMove(move);

                    return move;
                }

                if (!this.Engine.MakeMove(move)) {
                    this.Engine.UnmakeMove(move);
                    continue;
                }
                this.Engine.UnmakeMove(move);

                return move;
            }

            if (sanmove.includes("x")) {
                if (!this.Engine.IsCapture(move)) {
                    continue;
                }

                const coords = sanmove.substring(sanmove.indexOf("x") + 1);
                const sanTo = this.CoordsToSquare(coords);

                if (sanTo !== to) {
                    continue;
                }

                // move has disambiguation (e.g. R5xh4)
                if (sanmove.length > 4) {
                    // disambiguator is a letter (file)
                    if (isNaN(+sanmove.charAt(1))) {
                        if (moveString.charAt(0) !== sanmove.charAt(1)) {
                            continue;
                        }
                    }
                    // disambiguator is a number (rank)
                    else {
                        if (moveString.charAt(1) !== sanmove.charAt(1)) {
                            continue;
                        }
                    }
                }
                else {
                    if (sanmove.charAt(1) !== "x" && (sanmove.charCodeAt(0) - 97) !== (to & 7)) {
                        continue;
                    }
                }

                if (!this.Engine.MakeMove(move)) {
                    this.Engine.UnmakeMove(move);
                    continue;
                }
                this.Engine.UnmakeMove(move);

                return move;
            }

            const sanTo = this.CoordsToSquare(sanmove.substring(sanmove.length - 2));

            if (sanTo !== to) {
                continue;
            }

            // move has disambiguation (e.g. Rad1 or R7a4 or Rd1d2)
            if (sanmove.length > 3) {
                if (sanmove.length > 4) {
                    if (moveString.charAt(0) !== sanmove.charAt(1) || moveString.charAt(1) !== sanmove.charAt(2)) {
                        continue;
                    }
                }

                // disambiguator is a letter (file)
                if (isNaN(+sanmove.charAt(1))) {
                    if (moveString.charAt(0) !== sanmove.charAt(1)) {
                        continue;
                    }
                }
                // disambiguator is a number (rank)
                else {
                    if (moveString.charAt(1) !== sanmove.charAt(1)) {
                        continue;
                    }
                }
            }

            // At this point there's a possible matching move, BUT...
            // Some moves that might normally be disambiguated might not be if
            // the other possible piece move would leave the king in check
            // Example: rnb1k2r/p2nppbp/2pp2p1/q7/2B1PP1Q/2N5/PPP3PP/R1B1K1NR w KQq - 7 13
            // There are two knights that could move to e2, but one of them can't move
            // without leaving the king in check.
            // So check that the move is legal
            if (!this.Engine.MakeMove(move)) {
                this.Engine.UnmakeMove(move);
                continue;
            }
            this.Engine.UnmakeMove(move);

            return move;
        }

        // This is only reached if there's a problem and we can't continue;
        this.Engine.PrintBoard();
        throw new Error(`Unable to get a valid move for ${sanmove}. Line: ${line}`);
    }

    MakeMove(move: number) {
        this.Engine.MakeMove(move);
        this.Positions.push(this.Engine.GenerateFEN());
    }

    QuiescePosition(position: string) {
        // this.Engine.Reset();
        this.Engine.LoadFEN(position);
        const pv: number[] = [];
        this.Quiesce(-60000, 60000, pv);

        // Quiet the position
        for (let move of pv) {
            this.Engine.MakeMove(move);
        }

        return this.Engine.GenerateFEN();
    }

    Quiesce(alpha: number, beta: number, pv: number[]) {
        const staticEval = this.Engine.Evaluate();

        if (staticEval >= beta) {
            return beta;
        }

        if (staticEval > alpha) {
            alpha = staticEval;
        }

        let bestScore = staticEval;
        const moves = this.Engine.ScoreMoves(this.Engine.GenerateMoves(true), 0, 0);
        const newPv: number[] = [];

        for (let i = 0; i < moves.length; i++) {
            const move = this.Engine.NextMove(moves, i).move;

            if (!this.Engine.MakeMove(move)) {
                this.Engine.UnmakeMove(move);
                continue;
            }

            let score = -this.Quiesce(-beta, -alpha, newPv);
            this.Engine.UnmakeMove(move);

            if (score > bestScore) {
                bestScore = score;
            }

            if (score >= beta) {
                break;
            }

            if (score > alpha) {
                alpha = score;
                pv.length = 0;
                pv.push(move);
                pv.push(...newPv);
            }

            newPv.length = 0;
        }

        return bestScore;
    }
}

class PGNParser {
    private readonly NumPositionsPerGame = 5;
    private readonly MinGameLength = 15;
    private SourceFile!: readline.Interface;
    private ResultFile = fs.createWriteStream(path.join(__dirname, "extracted_positions.txt"), 'utf-8');
    private Positions: Set<string> = new Set();
    private Game = new Game();
    private FileSize = 0;

    /**
     * Generate tuning data from a file containing PGNs
     * @param fileName Just the filename, no path information.
     */
    async ParseFile(fileName: string) {
        this.FileSize = fs.statSync(fileName).size;
        const readStream = fs.createReadStream(path.join(__dirname, fileName), 'utf-8');
        this.SourceFile = readline.createInterface({ input: readStream });

        console.log(`Parsing PGN file: ${fileName}`);
        await this.GetPositions();
        console.log("Finished parsing PGN file");

        this.ResultFile.close();
        readStream.close();
    }

    ParseGame(positions: string[], result: string) {
        // Skip games that don't have enough positions
        if (positions.length <= this.MinGameLength) {
            // console.log(`Skipped game. Has ${positions.length} positions (min ${this.MinGameLength}).`);
            return;
        }

        if (positions.length >= 130 && result === "1/2-1/2") {
            // console.log(`Skipped game. Has ${positions.length} and ends in a draw.`);
            return;
        }

        let i = 0;
        let attempts = 0;
        let previousRandoms: number[] = [];

        while (i < this.NumPositionsPerGame && attempts < 20) {
            // random position (no position within the first 5 moves)
            const rand = Math.floor(Math.random() * ((positions.length - 1) - 3 + 1) + 3);

            // Don't use a position that's within 6 plys of another position (within the same game)
            for (let random of previousRandoms) {
                if (rand >= random - 6 && rand <= random + 6) {
                    attempts++;
                    continue;
                }
            }

            const pos = positions[rand];

            // Don't use duplicate positions
            if (this.Positions.has(pos)) {
                attempts++;
                continue;
            }

            let position = "";

            try {
                position = this.Game.QuiescePosition(pos);
                this.Positions.add(position);
                this.ResultFile.write(`${position} c9 "${result}";\n`);
            }
            catch {
                console.log(`Error quiescing position ${pos}`);
                continue;
            }

            i++;
        }
    }

    ParseMoveLine(line: string) {
        let index = 0;

        while (index < line.length && index >= 0) {
            // Skip whitespaces
            while (line[index] === " ") {
                index++;
            }

            let end = line.indexOf(" ", index);

            if (end === -1) {
                end = line.length;
            }

            const token = line.substring(index, end);

            // skip "tokens" that are comments
            if (token.startsWith("{")) {
                if (token.endsWith("}")) {
                    end = index + token.length;
                }
                else {
                    end = line.indexOf("}", index) + 1;
                }

                index = end;
                continue;
            }

            // skip "tokens" that are move numbers
            if (token.endsWith(".")) {
                index = end;
                continue;
            }

            // skip the result token at the end
            if (token === "1-0" || token === "0-1" || token === "1/2-1/2") {
                return true;
            }

            let move = this.Game.GetSANMove(token, line);

            if (move === 0) {
                throw new Error(`Unable to get encoded move for move: ${token}`);
            }

            this.Game.MakeMove(move);

            index = end;
        }

        return false;
    }

    async GetPositions() {
        let bytesRead = 0;
        const progress = new CLIProgress.SingleBar({
            format: '{bar} | {percentage}% | {value}/{total} bytes | Elapsed time: {duration_formatted} | ETA: {eta_formatted}',
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            hideCursor: true,
            etaBuffer: 1000,
        });
        progress.start(this.FileSize, 0);

        let skipGame = false;

        for await (const line of this.SourceFile) {
            bytesRead += line.length + 1; // +1 to read the \n character
            progress.update(bytesRead);

            if (line === null || line === "") {
                continue;
            }

            if (line.startsWith("[Result ")) {
                this.Game.Reset();
                skipGame = false;
                const stop = line.indexOf("]");
                let result = line.substring(9, stop - 1);

                if (result === "1-0" || result === "0-1" || result === "1/2-1/2") {
                    this.Game.Result = result;
                }
                else {
                    // throw new Error(`Unable to parse result from line: ${line}`);
                    skipGame = true;
                }
            }
            else if (line.startsWith("[Termination ")) {
                const stop = line.indexOf("]");
                let result = line.substring(14, stop - 1);

                if (result === "illegal move" || result === "unterminated") {
                    skipGame = true;
                }
            }
            else if (line.startsWith("[FEN ")) {
                const stop = line.indexOf("]");
                let fen = line.substring(6, stop - 1);

                this.Game.LoadFEN(fen);
            }
            else if (line.startsWith("[Variant ")) {
                const stop = line.indexOf("]");
                let variant = line.substring(10, stop - 1);

                if (variant === "fischerandom") {
                    this.Game.IsChess960(true);
                }
            }
            else if (!line.startsWith("[") && !skipGame) {
                const end = this.ParseMoveLine(line);

                if (end) {
                    if (this.Game.Result === null) {
                        throw new Error("Unable to record game with null result");
                    }

                    this.ParseGame(this.Game.Positions, this.Game.Result);
                }
            }
        }

        progress.stop();
    }
}

const args = process.argv.slice(2);
if (args[0] === "parse") {
    const tuner = new PGNParser();
    tuner.ParseFile(args[1]);
}
else if (args[0] === "tune") {
    const tuner = new Tuner();
    tuner.Tune(parseInt(args[1]), 0);
}
else {
    console.log("Argument 'parse <pgn filename>' or 'tune <number of epochs>' required");
}
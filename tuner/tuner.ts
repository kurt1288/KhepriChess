/**
 * This is a Javascript implementation, and adapted for KhepriChess,
 * of the tuner written for Blunder:
 * https://github.com/algerbrex/blunder/tree/main/tuner
 */

import { readFileSync, createWriteStream } from 'fs';
import path from 'path';
import Engine, { Color, Pieces, Square } from '../src/engine';

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

interface Indexes {
    MG_Material_StartIndex: number
    EG_Material_StartIndex: number
    EG_PSQT_StartIndex: number
    MG_DoubledPawn_Index: number
    EG_DoubledPawn_Index: number
    MG_IsolatedPawn_Index: number
    EG_IsolatedPawn_Index: number
    MG_FileSemiOpen_Index: number
    MG_FileOpen_Index: number
    MG_PassedPawn_Index: number
    EG_PassedPawn_Index: number
    MG_RookQueen_Index: number
    MG_KnightOutpost_Index: number
    EG_KnightOutpost_Index: number
    MG_BishopOutpost_Index: number
    EG_BishopOutpost_Index: number
    KingSemiOpen_Index: number
    MG_BishopPair_Index: number
    EG_BishopPair_Index: number
    MG_KnightMobility_Index: number
    MG_BishopMobility_Index: number
    MG_RookMobility_Index: number
    MG_QueenMobility_Index: number
    EG_KnightMobility_Index: number
    EG_BishopMobility_Index: number
    EG_RookMobility_Index: number
    EG_QueenMobility_Index: number
}

export const engine = new Engine();

const _scalingFactor = 0.01;
const _epsilon = 0.00000001;
const _learningRate = 0.5;

export function LoadWeights() {
    const weights: number[] = [];
    const indexes: Indexes = {
        // MG_PSQT_StartIndex begins at 0
        EG_PSQT_StartIndex: 64 * 6,
        MG_Material_StartIndex: 0,
        EG_Material_StartIndex: 0,
        MG_DoubledPawn_Index: 0,
        EG_DoubledPawn_Index: 0,
        MG_IsolatedPawn_Index: 0,
        EG_IsolatedPawn_Index: 0,
        MG_FileSemiOpen_Index: 0,
        MG_FileOpen_Index: 0,
        MG_PassedPawn_Index: 0,
        EG_PassedPawn_Index: 0,
        MG_RookQueen_Index: 0,
        MG_KnightOutpost_Index: 0,
        EG_KnightOutpost_Index: 0,
        MG_BishopOutpost_Index: 0,
        EG_BishopOutpost_Index: 0,
        KingSemiOpen_Index: 0,
        MG_BishopPair_Index: 0,
        EG_BishopPair_Index: 0,
        MG_KnightMobility_Index: 0,
        MG_BishopMobility_Index: 0,
        MG_RookMobility_Index: 0,
        MG_QueenMobility_Index: 0,
        EG_KnightMobility_Index: 0,
        EG_BishopMobility_Index: 0,
        EG_RookMobility_Index: 0,
        EG_QueenMobility_Index: 0,
    };

    let index = 0;

    for (let i = 0; i <= 5; i++) {
        weights.splice(index, 0, ...engine.PST[0][i]);
        weights.splice(384 + index, 0, ...engine.PST[1][i]);
        index += 64;
    }

    index *= 2;

    indexes.MG_Material_StartIndex = index;
	indexes.EG_Material_StartIndex = index + 5;

    weights.splice(indexes.MG_Material_StartIndex, 0, ...engine.MGPieceValue.slice(0, -1));
    weights.splice(indexes.EG_Material_StartIndex, 0, ...engine.EGPieceValue.slice(0, -1));

    index += 10;

    indexes.MG_DoubledPawn_Index = index;
    indexes.EG_DoubledPawn_Index = index + 1;

    weights.splice(indexes.MG_DoubledPawn_Index, 0, engine.MGdoubledPenalty);
    weights.splice(indexes.EG_DoubledPawn_Index, 0, engine.EGdoubledPenalty);

    index += 2;

    indexes.MG_IsolatedPawn_Index = index;
    indexes.EG_IsolatedPawn_Index = index + 1;

    weights.splice(indexes.MG_IsolatedPawn_Index, 0, engine.MGisolatedPenalty);
    weights.splice(indexes.EG_IsolatedPawn_Index, 0, engine.EGisolatedPenalty);

    index += 2;

    indexes.MG_FileSemiOpen_Index = index;
    indexes.MG_FileOpen_Index = index + 1;

    weights.splice(indexes.MG_FileSemiOpen_Index, 0, engine.MGfileSemiOpenScore);
    weights.splice(indexes.MG_FileOpen_Index, 0, engine.MGfileOpenScore);

    index += 2;

    indexes.MG_PassedPawn_Index = index;
    indexes.EG_PassedPawn_Index = index + 8;

    weights.splice(indexes.MG_PassedPawn_Index, 0, ...engine.MGpassedBonus);
    weights.splice(indexes.EG_PassedPawn_Index, 0, ...engine.EGpassedBonus);

    index += 16;

    indexes.MG_RookQueen_Index = index;
    weights.splice(indexes.MG_RookQueen_Index, 0, engine.MGrookQueenFileBonus);

    index += 1;

    indexes.MG_KnightOutpost_Index = index;
    indexes.EG_KnightOutpost_Index = index + 1;

    weights.splice(indexes.MG_KnightOutpost_Index, 0, engine.MGKnightOutpostBonus);
    weights.splice(indexes.EG_KnightOutpost_Index, 0, engine.EGKnightOutpostBonus);

    index += 2;

    indexes.MG_BishopOutpost_Index = index;
    indexes.EG_BishopOutpost_Index = index + 1;

    weights.splice(indexes.MG_BishopOutpost_Index, 0, engine.MGBishopOutpostBonus);
    weights.splice(indexes.EG_BishopOutpost_Index, 0, engine.EGBishopOutpostBonus);

    index += 2;

    indexes.KingSemiOpen_Index = index;

    weights.splice(indexes.KingSemiOpen_Index, 0, engine.MGKingSemiOpenPenalty);

    index += 1;

    indexes.MG_BishopPair_Index = index;
    indexes.EG_BishopPair_Index = index + 1;

    weights.splice(indexes.MG_BishopPair_Index, 0, engine.MGBishopPairBonus);
    weights.splice(indexes.EG_BishopPair_Index, 0, engine.EGBishopPairBonus);

    index += 2;

    indexes.MG_KnightMobility_Index = index;
    indexes.MG_BishopMobility_Index = index + 9;
    indexes.MG_RookMobility_Index = indexes.MG_BishopMobility_Index + 14;
    indexes.MG_QueenMobility_Index = indexes.MG_RookMobility_Index + 15;
    indexes.EG_KnightMobility_Index = indexes.MG_QueenMobility_Index + 28;
    indexes.EG_BishopMobility_Index = indexes.EG_KnightMobility_Index + 9;
    indexes.EG_RookMobility_Index = indexes.EG_BishopMobility_Index + 14;
    indexes.EG_QueenMobility_Index = indexes.EG_RookMobility_Index + 15;

    weights.splice(indexes.MG_KnightMobility_Index, 0, ...engine.MGKnightMobility);
    weights.splice(indexes.MG_BishopMobility_Index, 0, ...engine.MGBishopMobility);
    weights.splice(indexes.MG_RookMobility_Index, 0, ...engine.MGRookMobility);
    weights.splice(indexes.MG_QueenMobility_Index, 0, ...engine.MGQueenMobility);
    weights.splice(indexes.EG_KnightMobility_Index, 0, ...engine.EGKnightMobility);
    weights.splice(indexes.EG_BishopMobility_Index, 0, ...engine.EGBishopMobility);
    weights.splice(indexes.EG_RookMobility_Index, 0, ...engine.EGRookMobility);
    weights.splice(indexes.EG_QueenMobility_Index, 0, ...engine.EGQueenMobility);

    return { weights, indexes };
}

function LoadPositions(indexes: Indexes, numPositions: number, weightsLength: number): Position[] {
    const positions: Position[] = [];
    const reg = new RegExp("\"(.*?)\"");

    try {
        const data = readFileSync(path.join(__dirname, "./quiet-extended-2.epd"), "utf8");
        const lines = data.split("\n");

        if (numPositions === 0) {
            numPositions = lines.length;
        }
        
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

            engine.LoadFEN(fen);

            const coefficients = GetCoefficients(indexes, weightsLength);

            const phase = ((engine.Position.Phase * 256 + (engine.PhaseTotal / 2)) / engine.PhaseTotal) | 0;
		    const mgPhase = (256-phase) / 256;

            positions.push({ normals: coefficients, outcome: result, MGPhase: mgPhase });
        }

        console.log("Finished loading positions");
    }
    catch (error) {
        console.log(error);
    }

    return positions;
}

export function GetCoefficients(indexes: Indexes, weightsLength: number) {
    const rawNormals = new Array(weightsLength).fill(0);
    const normals: Coefficient[] = [];
    const phase = ((engine.Position.Phase * 256 + (engine.PhaseTotal / 2)) / engine.PhaseTotal) | 0;
    const mgPhase = (256 - phase) / 256;
	const egPhase = phase / 256;
    const bishopCount = [0, 0];
    const kingSquares = [
        engine.GetLS1B(engine.Position.PiecesBB[Color.White][Pieces.King]),
        engine.GetLS1B(engine.Position.PiecesBB[Color.White][Pieces.King]),
    ];
    const kingZones = [
        engine.KingAttacks[kingSquares[Color.White]] | engine.squareBB[kingSquares[Color.White]],
        engine.KingAttacks[kingSquares[Color.Black]] | engine.squareBB[kingSquares[Color.Black]],
    ];
    const kingAttackers = [0, 0];

    let allOccupancies = engine.Position.OccupanciesBB[0] | engine.Position.OccupanciesBB[1];
    const outpostRanks = [engine.rankMasks[Square.a4] | engine.rankMasks[Square.a5] | engine.rankMasks[Square.a6], engine.rankMasks[Square.a3] | engine.rankMasks[Square.a4] | engine.rankMasks[Square.a5]];

    while (allOccupancies) {
        let square = engine.GetLS1B(allOccupancies);
        let actualSquare = square;
        allOccupancies = engine.RemoveBit(allOccupancies, square);
        const piece = engine.Position.Squares[square];
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
            case Pieces.Pawn: {
                // Doubled pawns
                const pawnsOnFile = engine.Position.PiecesBB[piece.Color][Pieces.Pawn] & engine.fileMasks[square];
                if ((pawnsOnFile & (pawnsOnFile - 1n)) !== 0n) {
                    rawNormals[indexes.MG_DoubledPawn_Index] -= sign * mgPhase;
                    rawNormals[indexes.EG_DoubledPawn_Index] -= sign * egPhase;
                }

                // Isolated pawns
                if ((engine.Position.PiecesBB[piece.Color][Pieces.Pawn] & engine.isolatedMasks[square]) === 0n) {
                    rawNormals[indexes.MG_IsolatedPawn_Index] -= sign * mgPhase;
                    rawNormals[indexes.EG_IsolatedPawn_Index] -= sign * egPhase;
                }

                // Passed pawns
                if ((engine.passedMasks[piece.Color][square] & engine.Position.PiecesBB[piece.Color ^ 1][Pieces.Pawn]) === 0n) {
                    // https://www.chessprogramming.org/Ranks
                    const rank = 7 - (square >> 3);
                    rawNormals[indexes.MG_PassedPawn_Index + rank] += sign * mgPhase;
                    rawNormals[indexes.EG_PassedPawn_Index + rank] += sign * egPhase;
                }
                break;
            }
            case Pieces.Knight: {
                // Knight outposts
                if ((outpostRanks[piece.Color] & engine.squareBB[actualSquare])
                    && (engine.passedMasks[piece.Color][actualSquare] & ~engine.fileMasks[actualSquare] & engine.Position.PiecesBB[piece.Color ^ 1][Pieces.Pawn]) === 0n
                    && engine.PawnAttacks[piece.Color ^ 1][actualSquare] & engine.Position.PiecesBB[piece.Color][Pieces.Pawn]) {
                        rawNormals[indexes.MG_KnightOutpost_Index] += sign * mgPhase
                        rawNormals[indexes.EG_KnightOutpost_Index] += sign * egPhase
                }

                const attacks = engine.KnightAttacks[actualSquare];
                const mobility = engine.CountBits(attacks);

                rawNormals[indexes.MG_KnightMobility_Index + mobility] += sign * mgPhase;
                rawNormals[indexes.EG_KnightMobility_Index + mobility] += sign * egPhase;

                break;
            }
            case Pieces.Bishop: {
                bishopCount[piece.Color]++;

                const attacks = engine.GenerateBishopAttacks(engine.Position.OccupanciesBB[0] | engine.Position.OccupanciesBB[1], actualSquare);
                const mobility = engine.CountBits(attacks);

                rawNormals[indexes.MG_BishopMobility_Index + mobility] += sign * mgPhase;
                rawNormals[indexes.EG_BishopMobility_Index + mobility] += sign * egPhase;

                if ((outpostRanks[piece.Color] & engine.squareBB[actualSquare])
                    && (engine.passedMasks[piece.Color][actualSquare] & ~engine.fileMasks[actualSquare] & engine.Position.PiecesBB[piece.Color ^ 1][Pieces.Pawn]) === 0n
                    && engine.PawnAttacks[piece.Color ^ 1][actualSquare] & engine.Position.PiecesBB[piece.Color][Pieces.Pawn]) {
                        rawNormals[indexes.MG_BishopOutpost_Index] += sign * mgPhase
                        rawNormals[indexes.EG_BishopOutpost_Index] += sign * egPhase
                }

                break;
            }
            case Pieces.Rook: {
                const attacks = engine.GenerateRookAttacks(engine.Position.OccupanciesBB[0] | engine.Position.OccupanciesBB[1], actualSquare);
                const mobility = engine.CountBits(attacks);

                rawNormals[indexes.MG_RookMobility_Index + mobility] += sign * mgPhase;
                rawNormals[indexes.EG_RookMobility_Index + mobility] += sign * egPhase;

                if ((engine.Position.PiecesBB[piece.Color][Pieces.Pawn] & engine.fileMasks[square]) === 0n) {
                    if ((engine.Position.PiecesBB[piece.Color ^ 1][Pieces.Pawn] & engine.fileMasks[square]) === 0n) {
                        rawNormals[indexes.MG_FileOpen_Index] += sign * mgPhase;
                    }
                    else {
                        rawNormals[indexes.MG_FileSemiOpen_Index] += sign * mgPhase;
                    }
                }

                // Bonus if rook is on the same file as opponent's queen
                if (engine.fileMasks[square] & engine.Position.PiecesBB[piece.Color ^ 1][Pieces.Queen]) {
                    rawNormals[indexes.MG_RookQueen_Index] += sign * mgPhase;
                }
                break;
            }
            case Pieces.Queen: {
                const attacks = engine.GenerateBishopAttacks(engine.Position.OccupanciesBB[0] | engine.Position.OccupanciesBB[1], actualSquare) | engine.GenerateRookAttacks(engine.Position.OccupanciesBB[0] | engine.Position.OccupanciesBB[1], actualSquare);
                const mobility = engine.CountBits(attacks);

                rawNormals[indexes.MG_QueenMobility_Index + mobility] += sign * mgPhase;
                rawNormals[indexes.EG_QueenMobility_Index + mobility] += sign * egPhase;

                break;
            }
            case Pieces.King: {
                const file = Math.min(Math.max(square & 7, 1), 6);
                let j = 1;

                for (let i = file - 1; i <= file + 1; i++) {
                    if ((engine.fileMasks[i] & engine.Position.PiecesBB[piece.Color][Pieces.Pawn]) === 0n) {
                        rawNormals[indexes.KingSemiOpen_Index] -= mgPhase * sign * j * j;
                        j++;
                    }
                }

                break;
            }
        }
    }

    if (bishopCount[Color.White] >= 2) {
        rawNormals[indexes.MG_BishopPair_Index] += mgPhase;
        rawNormals[indexes.EG_BishopPair_Index] += egPhase;
    }
    if (bishopCount[Color.Black] >= 2) {
        rawNormals[indexes.MG_BishopPair_Index] -= mgPhase;
        rawNormals[indexes.EG_BishopPair_Index] -= egPhase;
    }

    // Material coeffs
    for (let piece = 0; piece <= 4; piece++) {
        const whiteCount = engine.CountBits(engine.Position.PiecesBB[0][piece]);
        const blackCount = engine.CountBits(engine.Position.PiecesBB[1][piece]);
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

export function Evaluate(weights: number[], normals: Coefficient[]) {
    let score = 0;

    for (let i of normals) {
        score += weights[i.index] * i.value;
    }

    return score;
}

function ComputeMSE(positions: Position[], weights: number[]) {
    let errorSum = 0;

    for (let position of positions) {
        let score = Evaluate(weights, position.normals);
        let sigmoid = 1 / (1 + Math.exp(-(_scalingFactor * score)));
        let error = position.outcome - sigmoid;
        errorSum += Math.pow(error, 2);
    }

    return errorSum / positions.length;
}

function ComputeGradient(positions: Position[], weights: number[], indexes: Indexes) {
    const gradients: number[] = new Array(weights.length).fill(0);

    for (let position of positions) {
        let score = Evaluate(weights, position.normals);
        let sigmoid = 1 / (1 + Math.exp(-(_scalingFactor * score)));
        let error = position.outcome - sigmoid;

        let term = error * (1 - sigmoid) * sigmoid;

        for (let normal of position.normals) {
            gradients[normal.index] += term * normal.value;
        }
    }

    return gradients;
}

function PrintResults(weights: number[], indexes: Indexes) {
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

    console.log(`MG Doubled Penalty: ${weights.slice(indexes.MG_DoubledPawn_Index, indexes.MG_DoubledPawn_Index + 1).map(x => Math.round(x))}`);
    console.log(`EG Doubled Penalty: ${weights.slice(indexes.EG_DoubledPawn_Index, indexes.EG_DoubledPawn_Index + 1).map(x => Math.round(x))}`);
    console.log(`MG Isolated Penalty: ${weights.slice(indexes.MG_IsolatedPawn_Index, indexes.MG_IsolatedPawn_Index + 1).map(x => Math.round(x))}`);
    console.log(`EG Isolated Penalty: ${weights.slice(indexes.EG_IsolatedPawn_Index, indexes.EG_IsolatedPawn_Index + 1).map(x => Math.round(x))}`);
    console.log(`MG File Semi-Open Score: ${weights.slice(indexes.MG_FileSemiOpen_Index, indexes.MG_FileSemiOpen_Index + 1).map(x => Math.round(x))}`);
    console.log(`EG File Open Score: ${weights.slice(indexes.MG_FileOpen_Index, indexes.MG_FileOpen_Index + 1).map(x => Math.round(x))}`);
    console.log(`MG Passed Pawn Bonus: ${weights.slice(indexes.MG_PassedPawn_Index, indexes.MG_PassedPawn_Index + 8).map(x => Math.round(x)).join(", ")}`);
    console.log(`EG Passed Pawn Bonus: ${weights.slice(indexes.EG_PassedPawn_Index, indexes.EG_PassedPawn_Index + 8).map(x => Math.round(x)).join(", ")}`);
    console.log(`MG Rook-Queen File Score: ${weights.slice(indexes.MG_RookQueen_Index, indexes.MG_RookQueen_Index + 1).map(x => Math.round(x))}`);
    console.log(`MG Knight Outpost Score: ${weights.slice(indexes.MG_KnightOutpost_Index, indexes.MG_KnightOutpost_Index + 1).map(x => Math.round(x))}`);
    console.log(`EG Knight Outpost Score: ${weights.slice(indexes.EG_KnightOutpost_Index, indexes.EG_KnightOutpost_Index + 1).map(x => Math.round(x))}`);
    console.log(`MG Bishop Outpost Score: ${weights.slice(indexes.MG_BishopOutpost_Index, indexes.MG_BishopOutpost_Index + 1).map(x => Math.round(x))}`);
    console.log(`EG Bishop Outpost Score: ${weights.slice(indexes.EG_BishopOutpost_Index, indexes.EG_BishopOutpost_Index + 1).map(x => Math.round(x))}`);
    console.log(`King Semi Open: ${weights.slice(indexes.KingSemiOpen_Index, indexes.KingSemiOpen_Index + 1).map(x => Math.round(x))}`);
    console.log(`MG Bishop Pair Score: ${weights.slice(indexes.MG_BishopPair_Index, indexes.MG_BishopPair_Index + 1).map(x => Math.round(x))}`);
    console.log(`EG Bishop Pair Score: ${weights.slice(indexes.EG_BishopPair_Index, indexes.EG_BishopPair_Index + 1).map(x => Math.round(x))}`);

    console.log(`MG Knight Mobility: ${weights.slice(indexes.MG_KnightMobility_Index, indexes.MG_KnightMobility_Index + 9).map(x => Math.round(x))}`);
    console.log(`MG Bishop Mobility: ${weights.slice(indexes.MG_BishopMobility_Index, indexes.MG_BishopMobility_Index + 14).map(x => Math.round(x))}`);
    console.log(`MG Rook Mobility: ${weights.slice(indexes.MG_RookMobility_Index, indexes.MG_RookMobility_Index + 15).map(x => Math.round(x))}`);
    console.log(`MG Queen Mobility: ${weights.slice(indexes.MG_QueenMobility_Index, indexes.MG_QueenMobility_Index + 28).map(x => Math.round(x))}`);
    console.log(`EG Knight Mobility: ${weights.slice(indexes.EG_KnightMobility_Index, indexes.EG_KnightMobility_Index + 9).map(x => Math.round(x))}`);
    console.log(`EG Bishop Mobility: ${weights.slice(indexes.EG_BishopMobility_Index, indexes.EG_BishopMobility_Index + 14).map(x => Math.round(x))}`);
    console.log(`EG Rook Mobility: ${weights.slice(indexes.EG_RookMobility_Index, indexes.EG_RookMobility_Index + 15).map(x => Math.round(x))}`);
    console.log(`EG Queen Mobility: ${weights.slice(indexes.EG_QueenMobility_Index, indexes.EG_QueenMobility_Index + 28).map(x => Math.round(x))}`);
}

function Tune(epochs: number, numPositions: number) {
    console.time("tuner");
    const { weights, indexes } = LoadWeights();
    const positions = LoadPositions(indexes, numPositions, weights.length);

    const gradientsSumsSquared = new Array(weights.length).fill(0);
    const beforeErr = ComputeMSE(positions, weights);

    if (numPositions === 0) {
        numPositions = positions.length;
    }
    
    let N = numPositions;
    let learningRate = _learningRate;
    const errors: number[] = [];

    for (let epoch = 0; epoch < epochs; epoch++) {
        let gradients = ComputeGradient(positions, weights, indexes);

        for (let [index, gradient] of gradients.entries()) {
            const leadingCoefficent = (-2 * _scalingFactor) / N;
			gradientsSumsSquared[index] += (leadingCoefficent * gradient) * (leadingCoefficent * gradient);
			weights[index] += (leadingCoefficent * gradient) * (-learningRate / Math.sqrt(gradientsSumsSquared[index] + _epsilon));
        }

        errors.push(ComputeMSE(positions, weights));
        console.log(`Epoch number ${epoch + 1} completed`);
    }

    const file = createWriteStream("errors.txt");
    file.on("error", (err) => {
        throw new Error("Unable to write errors to file");
    });
    for (const [index, value] of errors.entries()) {
        file.write(`${index}, ${value}\n`);
    }
    file.end();

    console.log(`Best error before tuning: ${beforeErr}`);
    console.log(`Best error after tuning: ${ComputeMSE(positions, weights)}`);
    PrintResults(weights, indexes);
    console.timeEnd("tuner");
}

Tune(10000, 0);
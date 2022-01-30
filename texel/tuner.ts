import { readFileSync } from 'fs';
import Engine from "../src/kheprichess";
import { passedBonus, pieceValue, pieceSquareValues } from "./initialWeights";

export default class Tuner {
   weights: any;
   positions: { fen: string, result: string }[];
   engine: Engine;

   constructor() {
      this.engine = new Engine();
      this.weights = this.MakeWeights();
      this.positions = [];
   }

   MakeWeights() {
      return [...passedBonus.flat(), ...pieceValue.flat(), ...[...pieceSquareValues.flat()].flat()];
   }

   async GetPositions() {
      try {
         const data = readFileSync("positions.epd", "utf8");
         const positions = data.split("\n");
         for (let i = 0; i < positions.length; i++) {
            if (positions[i] === "") {
               continue;
            }
            const fen = positions[i].split(";")[0];
            const result = positions[i].match(/pgn=(\d.\d)/);
            if (!fen || !result) {
               throw new Error("Unable to get position data");
            }
            this.positions.push({ fen, result: result[1] });
         }
      }
      catch (error) {
         console.log(error);
      }
   }

   MeanSquareError(K: number) {
      this.engine.UpdateWeights(this.weights);
      let error = 0;
      const numberOfPositions = 10;

      for (let i = 0; i <= numberOfPositions; i++) {
         let result = parseFloat(this.positions[i].result);
         this.engine.ParseFEN(this.positions[i].fen);
         let score = this.engine.Evaluate();

         if (this.engine.Side === 1) {
            score = score * -1;
         }

         let sigmoid = 1 / (1 + Math.pow(10, -K * score / 400));
         error += Math.pow(result - sigmoid, 2);
      }

      return error / numberOfPositions;
   }

   async Tune() {
      const startTime = Date.now();
      console.log(`Tuning started at ${new Date(startTime).toLocaleString()}`);
      const K = 0.2;
      await this.GetPositions();

      let bestError = this.MeanSquareError(K);
      let improved = true;
      const weightsLength = this.weights.length;

      while (improved) {
         improved = false;

         for (let i = 0; i < weightsLength; i++) {
            this.weights[i] += 1;

            let newError = this.MeanSquareError(K);

            if (newError < bestError) {
               bestError = newError;
               improved = true;
            }
            else {
               this.weights[i] -= 2;
               newError = this.MeanSquareError(K);

               if (((i >= 0 && i <= 8) || (i >= 8 && i <= 13) || (i >= 20 && i <= 25)) && this.weights[i] <= 0) {
                  this.weights[i] += 1;
                  continue;
               }

               if (newError < bestError) {
                  bestError = newError;
                  improved = true;
               }
            }
         }
      }

      const passedBonus = this.weights.slice(0, 8);
      const pieceValue = [this.weights.slice(8, 20), this.weights.slice(20, 32)];
      const pieceSquareValues: number[][][] = [[], []];
      for (let i = 32; i < this.weights.length; i += 64) {
         if (i < 384) {
            pieceSquareValues[0].push(this.weights.slice(i, i + 64));
         }
         else {
            pieceSquareValues[1].push(this.weights.slice(i, i + 64));
         }         
      }
      console.log(`Tuning complete in ${Date.now() - startTime}`);
      console.log(`Passed pawn bonus: ${passedBonus}`);
      console.log(`Piece values: ${pieceValue}`);
      console.log(`Piece square values: ${pieceSquareValues}`);
   }
}

const tune = new Tuner();
tune.Tune();
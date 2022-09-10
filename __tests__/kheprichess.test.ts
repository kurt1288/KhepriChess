import fs from "fs";
import path from "path";
import Engine from "../src/engine";

describe("perft tests", () => {
   describe("opening", () => {
      let engine: Engine;
      beforeEach(() => {
         engine = new Engine();
         engine.LoadFEN(Engine.positions.start);
      });

      test("depth 1", () => {
         expect(engine.Perft(1)).toBe(20);
      });

      test("depth 2", () => {
         expect(engine.Perft(2)).toBe(400);
      });

      test("depth 3", () => {
         expect(engine.Perft(3)).toBe(8902);
      });
      
      test("depth 4", () => {
         expect(engine.Perft(4)).toBe(197281);
      });

      test("depth 5", () => {
         expect(engine.Perft(5)).toBe(4865609);
      });
   });

   describe("kiwipete", () => {
      let engine: Engine;
      beforeEach(() => {
         engine = new Engine();
         engine.LoadFEN(Engine.positions.kiwipete);
      });

      test("depth 1", () => {
         expect(engine.Perft(1)).toBe(48);
      });

      test("depth 2", () => {
         expect(engine.Perft(2)).toBe(2039);
      });

      test("depth 3", () => {
         expect(engine.Perft(3)).toBe(97862);
      });
      
      test("depth 4", () => {
         expect(engine.Perft(4)).toBe(4085603);
      });
   });

   describe("position 3", () => {
      let engine: Engine;
      beforeEach(() => {
         engine = new Engine();
         engine.LoadFEN(Engine.positions.pos3);
      });

      test("depth 1", () => {
         expect(engine.Perft(1)).toBe(14);
      });

      test("depth 2", () => {
         expect(engine.Perft(2)).toBe(191);
      });

      test("depth 3", () => {
         expect(engine.Perft(3)).toBe(2812);
      });
      
      test("depth 4", () => {
         expect(engine.Perft(4)).toBe(43238);
      });

      test("depth 5", () => {
         expect(engine.Perft(5)).toBe(674624);
      });
   });

   describe("position 4 white", () => {
      let engine: Engine;
      beforeEach(() => {
         engine = new Engine();
         engine.LoadFEN(Engine.positions.pos4w);
      });

      test("depth 1", () => {
         expect(engine.Perft(1)).toBe(6);
      });

      test("depth 2", () => {
         expect(engine.Perft(2)).toBe(264);
      });

      test("depth 3", () => {
         expect(engine.Perft(3)).toBe(9467);
      });
      
      test("depth 4", () => {
         expect(engine.Perft(4)).toBe(422333);
      });
   });

   describe("position 4 black", () => {
      let engine: Engine;
      beforeEach(() => {
         engine = new Engine();
         engine.LoadFEN(Engine.positions.pos4b);
      });

      test("depth 1", () => {
         expect(engine.Perft(1)).toBe(6);
      });

      test("depth 2", () => {
         expect(engine.Perft(2)).toBe(264);
      });

      test("depth 3", () => {
         expect(engine.Perft(3)).toBe(9467);
      });
      
      test("depth 4", () => {
         expect(engine.Perft(4)).toBe(422333);
      });
   });

   describe("position 5", () => {
      let engine: Engine;
      beforeEach(() => {
         engine = new Engine();
         engine.LoadFEN(Engine.positions.pos5);
      });

      test("depth 1", () => {
         expect(engine.Perft(1)).toBe(44);
      });

      test("depth 2", () => {
         expect(engine.Perft(2)).toBe(1486);
      });

      test("depth 3", () => {
         expect(engine.Perft(3)).toBe(62379);
      });
      
      test("depth 4", () => {
         expect(engine.Perft(4)).toBe(2103487);
      });
   });
   
   describe("position 6", () => {
      let engine: Engine;
      beforeEach(() => {
         engine = new Engine();
         engine.LoadFEN(Engine.positions.pos6);
      });
      
      test("depth 1", () => {
         expect(engine.Perft(1)).toBe(46);
      });

      test("depth 2", () => {
         expect(engine.Perft(2)).toBe(2079);
      });

      test("depth 3", () => {
         expect(engine.Perft(3)).toBe(89890);
      });
      
      test("depth 4", () => {
         expect(engine.Perft(4)).toBe(3894594);
      });
   });
});

interface Position {
   fen: string
   d1: number
   d2: number
   d3: number
   d4: number
}

describe("chess960 position tests", () => {
   const file = fs.readFileSync(path.join(__dirname, "fischer.epd.txt"), 'utf8');
   const position: Position[] = [];
   const lines = file.split(/\r?\n/);

   // Don't test all 960 positions at once. You'll get an out-of-memory exception
   for (let i = 0; i < 100; i++) {
      const temp = lines[i].split(";");

      position.push({
         fen: temp[0].trim(),
         d1: parseInt(temp[1].trim().split(" ")[1]),
         d2: parseInt(temp[2].trim().split(" ")[1]),
         d3: parseInt(temp[3].trim().split(" ")[1]),
         d4: parseInt(temp[4].trim().split(" ")[1]),
      });
   }

   describe.each(position)("Position %s", (position) => {
      let engine: Engine;
      beforeEach(() => {
         engine = new Engine();
         engine.isChess960 = true;
         engine.LoadFEN(position.fen);
      });

      test("depth 1", () => {
         expect(engine.Perft(1)).toBe(position.d1);
      });

      test("depth 2", () => {
         expect(engine.Perft(2)).toBe(position.d2);
      });

      test("depth 3", () => {
         expect(engine.Perft(3)).toBe(position.d3);
      });

      test("depth 4", () => {
         expect(engine.Perft(4)).toBe(position.d4);
      });
   });
});
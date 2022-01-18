import Engine from "./kheprichess";

describe("perft tests", () => {
   describe("opening", () => {
      let engine: Engine;
      beforeEach(() => {
         engine = new Engine(Engine.positions.start);
      });

      test("depth 1", async () => {
         await expect(engine.Perft(1)).resolves.toBe(20);
      });

      test("depth 2", async () => {
         await expect(engine.Perft(2)).resolves.toBe(400);
      });

      test("depth 3", async () => {
         await expect(engine.Perft(3)).resolves.toBe(8902);
      });
      
      test("depth 4", async () => {
         await expect(engine.Perft(4)).resolves.toBe(197281);
      });

      test("depth 5", async () => {
         await expect(engine.Perft(5)).resolves.toBe(4865609);
      });
   });

   describe("kiwipete", () => {
      let engine: Engine;
      beforeEach(() => {
         engine = new Engine(Engine.positions.kiwipete);
      });

      test("depth 1", async () => {
         await expect(engine.Perft(1)).resolves.toBe(48);
      });

      test("depth 2", async () => {
         await expect(engine.Perft(2)).resolves.toBe(2039);
      });

      test("depth 3", async () => {
         await expect(engine.Perft(3)).resolves.toBe(97862);
      });
      
      test("depth 4", async () => {
         await expect(engine.Perft(4)).resolves.toBe(4085603);
      });
   });

   describe("position 3", () => {
      let engine: Engine;
      beforeEach(() => {
         engine = new Engine(Engine.positions.pos3);
      });

      test("depth 1", async () => {
         await expect(engine.Perft(1)).resolves.toBe(14);
      });

      test("depth 2", async () => {
         await expect(engine.Perft(2)).resolves.toBe(191);
      });

      test("depth 3", async () => {
         await expect(engine.Perft(3)).resolves.toBe(2812);
      });
      
      test("depth 4", async () => {
         await expect(engine.Perft(4)).resolves.toBe(43238);
      });

      test("depth 5", async () => {
         await expect(engine.Perft(5)).resolves.toBe(674624);
      });
   });

   describe("position 4 white", () => {
      let engine: Engine;
      beforeEach(() => {
         engine = new Engine(Engine.positions.pos4w);
      });

      test("depth 1", async () => {
         await expect(engine.Perft(1)).resolves.toBe(6);
      });

      test("depth 2", async () => {
         await expect(engine.Perft(2)).resolves.toBe(264);
      });

      test("depth 3", async () => {
         await expect(engine.Perft(3)).resolves.toBe(9467);
      });
      
      test("depth 4", async () => {
         await expect(engine.Perft(4)).resolves.toBe(422333);
      });
   });

   describe("position 4 black", () => {
      let engine: Engine;
      beforeEach(() => {
         engine = new Engine(Engine.positions.pos4b);
      });

      test("depth 1", async () => {
         await expect(engine.Perft(1)).resolves.toBe(6);
      });

      test("depth 2", async () => {
         await expect(engine.Perft(2)).resolves.toBe(264);
      });

      test("depth 3", async () => {
         await expect(engine.Perft(3)).resolves.toBe(9467);
      });
      
      test("depth 4", async () => {
         await expect(engine.Perft(4)).resolves.toBe(422333);
      });
   });

   describe("position 5", () => {
      let engine: Engine;
      beforeEach(() => {
         engine = new Engine(Engine.positions.pos5);
      });

      test("depth 1", async () => {
         await expect(engine.Perft(1)).resolves.toBe(44);
      });

      test("depth 2", async () => {
         await expect(engine.Perft(2)).resolves.toBe(1486);
      });

      test("depth 3", async () => {
         await expect(engine.Perft(3)).resolves.toBe(62379);
      });
      
      test("depth 4", async () => {
         await expect(engine.Perft(4)).resolves.toBe(2103487);
      });
   });
   
   describe("position 6", () => {
      let engine: Engine;
      beforeEach(() => {
         engine = new Engine(Engine.positions.pos6);
      });
      
      test("depth 1", async () => {
         await expect(engine.Perft(1)).resolves.toBe(46);
      });

      test("depth 2", async () => {
         await expect(engine.Perft(2)).resolves.toBe(2079);
      });

      test("depth 3", async () => {
         await expect(engine.Perft(3)).resolves.toBe(89890);
      });
      
      test("depth 4", async () => {
         await expect(engine.Perft(4)).resolves.toBe(3894594);
      });
   });
})
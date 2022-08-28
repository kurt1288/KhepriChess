const readline = require('readline');
import Khepri from "./engine";
import Polyglot, { entry } from "./polyglot";

class UciInterface {
   interface;
   openingBook: Map<bigint, entry> | null = null;
   engine = new Khepri();

   constructor() {
      this.interface = readline.createInterface({
         input: process.stdin,
         output: process.stdout,
         terminal: false,
      });

      this.interface.on('line', (message: string) => {
         const command = message.split(' ')[0];
         switch (command) {
            case "uci": {
               console.log(`id name ${this.engine.name} ${this.engine.version}`);
               console.log(`id author ${this.engine.author}`);
               console.log('option name Hash type spin default 32 min 1 max 512');
               console.log('uciok');
               break;
            }
            case "isready": {
               console.log("readyok");
               break;
            }
            case "quit": {
               process.exit();
               break;
            }
            case "ucinewgame": {
               this.engine = new Khepri();

               const polyglot = new Polyglot();
               const entries = polyglot.TryLoad();

               if (entries) {
                  this.openingBook = entries;
               }

               break;
            }
            case "position": {
               this.engine.ParseUCIPosition(message);
               break;
            }
            case "go": {
               if (this.openingBook) {
                  const hash = Polyglot.PolyglotHash(this.engine.Position);
                  const openings = this.openingBook.get(hash);

                  if (openings !== undefined) {
                     console.log(`bestmove ${openings.move}`);
                     return;
                  }
               }

               this.engine.ParseUCIGo(message);
               break;
            }
            case "setoption": {
               const hash = parseInt((message.match(/Hash value (\d+)/) || [])[1]) || 0;

               if (hash) {
                  this.engine.SetTransTableSize(hash);
               }
               break;
            }
            default: {
               console.log(`Unrecognized command: ${command}`);
            }
         }
      });
   }
}

const uci = new UciInterface();

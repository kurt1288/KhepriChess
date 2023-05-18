const readline = require('readline');
import Khepri from "./engine";
import Polyglot, { entry } from "./polyglot";

class UciInterface {
   interface;
   openingBook: Map<bigint, entry> | null = null;
   engine = new Khepri();
   options = {
      isChess960: false,
      hashSize: 32, // in MB
   }

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
               console.log('option name UCI_Chess960 type check default false');
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
               this.engine.isChess960 = this.options.isChess960;
               this.engine.ResizeTranspositionTable(this.options.hashSize);

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
                  const hash = Polyglot.PolyglotHash(this.engine.BoardState);
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
               try {
                  const name = message.match(/name (\w+)/);

                  if (!name) {
                     console.error("Unable to parse option name");
                     return;
                  }
   
                  switch (name[1]) {
                     case "Hash": {
                        const hash = parseInt((message.match(/value (\d+)/) || [])[1]) || 0;
                        if (hash) {
                           this.options.hashSize = hash;
                           this.engine.ResizeTranspositionTable(hash);
                        }
                        break;
                     }
                     case "UCI_Chess960": {
                        const value = message.match(/value (\w+)/);

                        if (value) {
                           this.options.isChess960 = value[1] === "true" ? true : false;
                           this.engine.isChess960 = this.options.isChess960;
                        }
                        else {
                           console.error("Unable to parse value");
                           return;
                        }
                        
                        break;
                     }
                     default: {
                        console.log(`Unrecognized option: ${name[1]}`);
                        break;
                     }
                  }
               }
               catch {
                  console.log("Error parsing option");
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

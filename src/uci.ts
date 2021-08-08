const readline = require('readline');
import Engine from "./kheprichess";

class UciInterface {
   interface;
   engine = new Engine();

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
               this.engine = new Engine();
               break;
            }
            case "position": {
               this.engine.ParseUCIPosition(message);
               break;
            }
            case "go": {
               this.engine.ParseUCIGo(message);
               break;
            }
            case "setoption": {
               const hash = parseInt((message.match(/Hash value (\d+)/) || [])[1]) || 0;

               if (hash) {
                  this.engine.InitHashTable(hash);
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

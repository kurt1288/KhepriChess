import Khepri from "./engine";

const engine = new Khepri();
engine.LoadFEN("2k5/8/8/3p2p1/6P1/8/8/3RK1R1 w - - 0 1");
engine.Evaluate();
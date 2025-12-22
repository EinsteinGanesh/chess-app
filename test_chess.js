
import { Chess } from 'chess.js';

const chess = new Chess();
console.log("Initial FEN:", chess.fen());

try {
    const move = chess.move({ from: 'e2', to: 'e4', promotion: 'q' });
    console.log("Move result:", move);
} catch (e) {
    console.error("Move failed:", e.message);
}

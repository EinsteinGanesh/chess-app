import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import ChessboardJS from './components/ChessboardJS'; // Import the new wrapper
import ArrowOverlay from './components/ArrowOverlay';
import {
  History, Upload, Play, RotateCcw, ChevronLeft, ChevronRight,
  MessageSquare, Cpu, Settings, X, Send, AlertTriangle, CheckCircle, HelpCircle, Star
} from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import puzzlesData from './data/puzzles.json';
import { usePuzzles } from './hooks/usePuzzles';
import PuzzleSelector from './components/PuzzleSelector';

// --- Utility Components ---
function Button({ children, onClick, variant = 'primary', className, disabled }) {
  const base = "px-4 py-2 rounded font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-primary hover:bg-primary-hover text-white",
    secondary: "bg-gray-700 hover:bg-gray-600 text-gray-200",
    danger: "bg-red-600 hover:bg-red-700 text-white",
    ghost: "hover:bg-gray-800 text-gray-400 hover:text-white"
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={twMerge(base, variants[variant], className)}
    >
      {children}
    </button>
  );
}

function Card({ children, className, title, icon: Icon, action }) {
  return (
    <div className={twMerge("bg-gray-800 rounded-lg border border-gray-700 flex flex-col overflow-hidden", className)}>
      {(title || Icon) && (
        <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {Icon && <Icon size={18} className="text-primary" />}
            <h3 className="font-semibold text-gray-200">{title}</h3>
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="flex-1 overflow-auto p-4">
        {children}
      </div>
    </div>
  );
}

// --- Main App Component ---
function App() {
  // Game State
  const gameRef = useRef(new Chess());
  const [fen, setFen] = useState(gameRef.current.fen());
  const [history, setHistory] = useState([]);
  const historyRef = useRef(history);
  useEffect(() => { historyRef.current = history; }, [history]);

  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1); // -1 = start
  const [orientation, setOrientation] = useState('white');

  // Engine State
  const [engine, setEngine] = useState(null);
  const [evaluation, setEvaluation] = useState(null); // { cp: 0, mate: null }
  const [bestLine, setBestLine] = useState('');
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [moveAnalyses, setMoveAnalyses] = useState({}); // { index: { pre: {cp, mate}, post: {cp, mate}, classification: '...' } }
  const [analysisQueue, setAnalysisQueue] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalysisSummary, setShowAnalysisSummary] = useState(false);

  // Puzzle State
  const [appMode, setAppMode] = useState('analysis'); // 'analysis' | 'puzzle'
  const [puzzles, setPuzzles] = useState(puzzlesData);
  const [showImportModal, setShowImportModal] = useState(false);
  // Load Game Tray State
  const [showLoadGameTray, setShowLoadGameTray] = useState(false);

  // Firebase Puzzle Integration
  const {
    puzzles: firebasePuzzles,
    loading: puzzlesLoading,
    error: puzzlesError,
    filterByRating,
    filterByTheme,
    getRandomPuzzle: getRandomFirebasePuzzle,
    clearCache
  } = usePuzzles();

  // Sync Firebase puzzles to local state
  useEffect(() => {
    if (firebasePuzzles && firebasePuzzles.length > 0) {
      setPuzzles(firebasePuzzles);
      console.log(`✅ Loaded ${firebasePuzzles.length} puzzles from Firebase`);
    }
  }, [firebasePuzzles]);

  const [puzzleState, setPuzzleState] = useState({
    currentPuzzle: null,
    index: 0,
    status: 'idle', // 'idle' | 'solving' | 'solved' | 'failed'
    userRating: 1200,
    message: '',
    showSolution: false
  });

  // Arrows State
  const [manualArrows, setManualArrows] = useState([]); // Array of {from, to, color}
  const [rightClickStart, setRightClickStart] = useState(null); // {square, x, y}
  const [engineArrow, setEngineArrow] = useState(null);

  // Update engine arrow from bestLine
  useEffect(() => {
    if (bestLine) {
      const moves = bestLine.split(' ');
      if (moves.length > 0) {
        const bestMove = moves[0];
        // simplistic parse: first 2 chars from, next 2 chars to. 
        // promotion is 5th char but doesn't affect arrow coords logic usually.
        const from = bestMove.substring(0, 2);
        const to = bestMove.substring(2, 4);
        setEngineArrow({ from, to, color: 'rgba(0, 255, 0, 0.6)' }); // Green arrow
        return;
      }
    }
    setEngineArrow(null);
  }, [bestLine]);

  // AI Coach State
  // AI Coach State
  const [apiKey, setApiKey] = useState(() => {
    try {
      const saved = localStorage.getItem('gemini_api_key');
      return saved ? atob(saved) : '';
    } catch (e) {
      return '';
    }
  });

  const saveApiKey = (key) => {
    setApiKey(key);
    try {
      if (key) localStorage.setItem('gemini_api_key', btoa(key));
      else localStorage.removeItem('gemini_api_key');
    } catch (e) {
      console.error("Failed to save key", e);
    }
  }
  const [chatHistory, setChatHistory] = useState([{ role: 'model', text: "Hello! I'm your AI Chess Coach. Load a game or make a move, and I'll help you analyze it!" }]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  // UI State
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  //for animation

  const [showAnimations, setShowAnimations] = useState(true);

  //random FEN positions functions

  // generate random FEN position by playing random moves
  function generateRandomFen() {
    const game = new Chess();
    game.reset();
    const movesToPlay = Math.floor(Math.random() * 40) + 10; // Play between 10 and 50 moves

    for (let i = 0; i < movesToPlay; i++) {
      const moves = game.moves();
      if (moves.length === 0) break; // Checkmate or stalemate
      const randomMove = moves[Math.floor(Math.random() * moves.length)];
      game.move(randomMove);
    }

    const newFen = game.fen();
    gameRef.current.load(newFen); // <--- SYNC GAME REF
    setFen(newFen);
    setHistory(game.history({ verbose: true }));
    setCurrentMoveIndex(game.history().length - 1);
    setEvaluation(null);
    setBestLine('');
  }

  // --- Engine Initialization ---
  useEffect(() => {
    const worker = new Worker('/stockfish.js');
    worker.postMessage('uci');
    worker.postMessage('setoption name Hash value 64');
    setEngine(worker);
    return () => worker.terminate();
  }, []);

  // Click-to-move state
  // Click-to-move state
  const [moveFrom, setMoveFrom] = useState('');
  const [rightClickedSquares, setRightClickedSquares] = useState({});
  const [moveSquares, setMoveSquares] = useState({});
  const [optionSquares, setOptionSquares] = useState({});

  // --- Engine Analysis Trigger ---
  // --- Engine Analysis Trigger ---
  useEffect(() => {
    if (!engine || !isEngineReady || isAnalyzing) return;

    setAnalyzing(true);
    engine.postMessage('stop');
    engine.postMessage(`position fen ${fen}`);
    engine.postMessage('go depth 15'); // Moderate depth for responsiveness

    return () => {
      // Cleanup if needed
    };
  }, [engine, isEngineReady, fen, isAnalyzing]);

  // Debug: Log FEN changes
  useEffect(() => {
    console.log("FEN changed to:", fen);
  }, [fen]);

  // --- Game Logic ---
  function makeMove(move) {
    console.log("Attempting move:", move);
    try {
      const game = gameRef.current;
      const result = game.move(move);
      console.log("Move result:", result);

      if (result) {
        setFen(game.fen());
        const newHistory = game.history({ verbose: true });
        setHistory(newHistory);

        const newMoveIndex = newHistory.length - 1;
        setCurrentMoveIndex(newMoveIndex);

        // Record Pre-Move Evaluation
        setMoveAnalyses(prev => ({
          ...prev,
          [newMoveIndex]: {
            pre: evaluation, // evaluation of the position BEFORE this move
            san: move.san
          }
        }));

        setMoveSquares({
          [move.from]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' },
          [move.to]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' }
        });
        return true;
      }
    } catch (e) {
      console.error("Move failed:", e);
      return false;
    }
    return false;
  }

  function onDrop(sourceSquare, targetSquare) {
    console.log("onDrop:", sourceSquare, targetSquare);

    if (appMode === 'puzzle') {
      const success = handlePuzzleMove(sourceSquare, targetSquare);
      return success;
    }

    const move = makeMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q',
    });
    return move;
  }

  // Get move options for a square to show valid moves
  function getMoveOptions(square) {
    const moves = gameRef.current.moves({
      square,
      verbose: true
    });

    // if no moves, clear the option squares
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }

    // create a new object to store the option squares
    const newSquares = {};

    // loop through the moves and set the option squares
    const game = gameRef.current;
    for (const move of moves) {
      newSquares[move.to] = {
        background:
          game.get(move.to) && game.get(move.to)?.color !== game.get(square)?.color
            ? 'radial-gradient(circle, rgba(0, 0, 255, 0.5) 85%, transparent 85%)' // larger blue circle for capturing
            : 'radial-gradient(circle, rgba(0, 0, 255, 0.5) 25%, transparent 25%)', // smaller blue circle for moving
        borderRadius: '50%'
      };
    }

    // set the square clicked to move from to yellow
    newSquares[square] = {
      background: 'rgba(255, 255, 0, 0.4)'
    };

    // set the option squares
    setOptionSquares(newSquares);

    // return true to indicate that there are move options
    return true;
  }

  // square clicked to move to, check if valid move
  const game = gameRef.current;
  function onSquareClick(square) {
    console.log("onSquareClick:", square, "moveFrom:", moveFrom);
    if (!moveFrom) {
      const piece = game.get(square);
      if (!piece) return;

      const hasMoveOptions = getMoveOptions(square);
      if (hasMoveOptions) setMoveFrom(square);
      return;
    }

    const moves = game.moves({ square: moveFrom, verbose: true });
    const foundMove = moves.find(m => m.from === moveFrom && m.to === square);

    console.log("Found move?", foundMove);

    if (!foundMove) {
      const hasMoveOptions = getMoveOptions(square);
      setMoveFrom(hasMoveOptions ? square : '');
      return;
    }

    const success = makeMove({ from: moveFrom, to: square, promotion: 'q' });
    if (success) {
      setMoveFrom('');
      setOptionSquares({});
    }
  }


  // --- Arrow / Right Click Interaction ---

  const getSquareFromEvent = (e, domRect) => {
    const x = e.clientX - domRect.left;
    const y = e.clientY - domRect.top;

    // 0..1 relative pos
    const relX = x / domRect.width;
    const relY = y / domRect.height;

    let col = Math.floor(relX * 8);
    let row = Math.floor(relY * 8);

    // Clamp
    if (col < 0) col = 0; if (col > 7) col = 7;
    if (row < 0) row = 0; if (row > 7) row = 7;

    // Convert to square
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];

    let fileIndex = col;
    let rankIndex = 7 - row; // row 0 is top (rank 8), row 7 is bottom (rank 1)

    if (orientation === 'black') {
      fileIndex = 7 - col; // Left is 'h'
      rankIndex = row;     // Top is '1'
    }

    return files[fileIndex] + ranks[rankIndex];
  };

  const handleBoardContextMenu = (e) => {
    e.preventDefault();
  };

  const handleBoardMouseDown = (e) => {
    if (e.button === 2) { // Right click
      const rect = e.currentTarget.getBoundingClientRect();
      const square = getSquareFromEvent(e, rect);
      setRightClickStart(square);
    } else {
      // Left click clears arrows often
      if (manualArrows.length > 0) setManualArrows([]);
      if (rightClickStart) setRightClickStart(null);
    }
  };

  const handleBoardMouseUp = (e) => {
    if (e.button === 2 && rightClickStart) { // Right click release
      const rect = e.currentTarget.getBoundingClientRect();
      const square = getSquareFromEvent(e, rect);

      if (rightClickStart === square) {
        // Click on same square -> Clear arrows or circle? 
        // For now, let's just clear arrows if you click same square,
        // or maybe we implement circles later.
        // User requested "make arrow", so focus on drag.
        // If click same square, maybe do nothing or remove arrows involved?
        // Let's toggle red arrow if from==to? No that's a circle.

        // Let's implement toggle logic if not dragging
      } else {
        // Dragged from A to B
        const newArrow = { from: rightClickStart, to: square, color: 'orange' };

        // Toggle: if exists, remove. Else add.
        setManualArrows(prev => {
          const exists = prev.find(a => a.from === rightClickStart && a.to === square);
          if (exists) {
            return prev.filter(a => a !== exists);
          }
          return [...prev, newArrow];
        });
      }
      setRightClickStart(null);
    }
  };

  // --- Game Loading Logic ---
  async function fetchLichessGames(username) {
    try {
      const response = await fetch(`https://lichess.org/api/games/user/${username}?max=5&pgnInJson=true`);
      const text = await response.text();
      // Lichess returns NDJSON
      const games = text.trim().split('\n').map(line => JSON.parse(line));
      // For simplicity, just load the first one or show a list (we'll just load first for now to demonstrate)
      if (games.length > 0) {
        loadPgn(games[0].pgn);
        setChatHistory(prev => [...prev, { role: 'model', text: `Loaded most recent game vs ${games[0].players.black.user ? games[0].players.black.user.name : 'AI'}!` }]);
        setShowLoadGameTray(false); // Hide tray after loading
      }
    } catch (e) {
      alert("Error fetching Lichess games");
    }
  }

  // --- Play Mode Logic ---
  const [playMode, setPlayMode] = useState(false);
  const [userColor, setUserColorState] = useState('w'); // 'w' or 'b'

  // Derived AI color (always opposite of user)
  const aiColor = userColor === 'w' ? 'b' : 'w';

  // Wrapper to handle side effects of changing color
  const setUserColor = (color) => {
    setUserColorState(color);
    setOrientation(color === 'w' ? 'white' : 'black');
    resetGame();
  };

  const [pgnInput, setPgnInput] = useState('');
  const [fenInput, setFenInput] = useState('');

  function loadPgn(pgn) {
    try {
      const game = gameRef.current;
      game.loadPgn(pgn);
      setFen(game.fen());
      setHistory(game.history({ verbose: true }));
      setCurrentMoveIndex(game.history().length - 1);
      setShowLoadGameTray(false); // Hide tray after loading
    } catch (e) {
      alert("Invalid PGN");
    }
  }

  function loadFen(fen) {
    try {
      const game = gameRef.current;
      // Sanitize input: 
      // 1. Remove surrounding whitespace
      // 2. Remove surrounding single or double quotes
      // 3. Normalize spaces (replace multiple spaces with single space)
      const sanitizedFen = fen.trim().replace(/^['"]|['"]$/g, '').trim().replace(/\s+/g, ' ');

      console.log(`Attempting to load FEN: "${sanitizedFen}"`); // Debug log

      // Attempt to load
      try {
        const result = game.load(sanitizedFen);
        // Some chess.js versions return false on failure instead of throwing
        if (result === false) {
          throw new Error("Invalid FEN (game.load return false)");
        }
      } catch (loadError) {
        console.error("Inner FEN load error:", loadError);
        throw new Error("Invalid FEN string");
      }

      setFen(game.fen());
      setHistory([]);
      setCurrentMoveIndex(-1);
      setEvaluation(null);
      setBestLine('');
      setShowLoadGameTray(false); // Hide tray after loading

      // Add a system message to chat
      setChatHistory(prev => [...prev, { role: 'model', text: 'Loaded position from FEN.' }]);

    } catch (e) {
      console.error("FEN Load Error:", e);
      alert(`Invalid FEN string.\n\nDebug Info:\nInput: "${fen}"\nSanitized: "${fen.trim().replace(/^['"]|['"]$/g, '').trim().replace(/\s+/g, ' ')}"\nError: ${e.message}`);
    }
  }

  function resetGame() {
    const game = gameRef.current;
    game.reset();
    setFen(game.fen());
    setHistory([]);
    setCurrentMoveIndex(-1);
    setEvaluation(null);
    setBestLine('');
  }

  // --- Puzzle Logic ---

  function loadPuzzle(index) {
    if (index < 0 || index >= puzzles.length) return;

    const puzzle = puzzles[index];
    const game = gameRef.current;

    game.load(puzzle.FEN);
    setFen(game.fen());
    setHistory([]);
    setCurrentMoveIndex(-1);
    setEvaluation(null);
    setBestLine('');
    setMoveAnalyses({});
    setManualArrows([]);

    const turn = game.turn();
    const userSide = turn === 'w' ? 'white' : 'black';
    setOrientation(userSide);
    setUserColorState(turn); // Ensure logic matches

    setPuzzleState(prev => ({
      ...prev,
      currentPuzzle: puzzle,
      index: index,
      status: 'solving',
      message: 'Find the best move!',
      moveIndex: 0, // Track which move in the solution we are expected to play
      showSolution: false
    }));
  }

  const nextPuzzle = () => loadPuzzle(puzzleState.index + 1);

  function handlePuzzleMove(source, target) {
    const { currentPuzzle, moveIndex, status } = puzzleState;
    if (status !== 'solving' || !currentPuzzle) return false;

    const game = gameRef.current;

    const puzzleMoves = currentPuzzle.Moves.split(' '); // e.g. "f2g3 e6e7 ..."
    const expectedMoveStr = puzzleMoves[moveIndex]; // e.g. "f2g3"

    // User move in UCI format
    const userMoveUci = source + target;

    // If Correct
    if (userMoveUci === expectedMoveStr || (expectedMoveStr.length === 5 && userMoveUci === expectedMoveStr.substring(0, 4))) {

      // Make the move visually
      makeMove({ from: source, to: target, promotion: 'q' }); // Actual game move

      // Check if puzzle ended
      if (moveIndex + 1 >= puzzleMoves.length) {
        setPuzzleState(prev => ({
          ...prev,
          status: 'solved',
          message: 'Solved! +10 Rating',
          userRating: prev.userRating + 10
        }));
      } else {
        // Opponent's Turn (Automated)
        setPuzzleState(prev => ({ ...prev, moveIndex: prev.moveIndex + 1, message: 'Good move...' }));

        setTimeout(() => {
          const opponentMoveStr = puzzleMoves[moveIndex + 1];
          const from = opponentMoveStr.substring(0, 2);
          const to = opponentMoveStr.substring(2, 4);
          const promo = opponentMoveStr.length === 5 ? opponentMoveStr[4] : 'q';

          makeMove({ from, to, promotion: promo });

          // Set up for next user move
          setPuzzleState(prev => {
            const nextIndex = prev.moveIndex + 1; // We just played opponent move
            if (nextIndex + 1 >= puzzleMoves.length) {
              return {
                ...prev,
                status: 'solved',
                message: 'Solved! +10 Rating',
                userRating: prev.userRating + 10,
                moveIndex: nextIndex
              };
            }
            return {
              ...prev,
              moveIndex: nextIndex,
              message: 'your turn...'
            };
          });
        }, 500);
      }
      return true;
    } else {
      // WRONG MOVE - Allow retry
      setPuzzleState(prev => ({
        ...prev,
        message: '❌ Wrong move! Try again.'
      }));

      return false; // Snapback
    }
  }

  function handleShowSolution() {
    if (puzzleState.status !== 'solving' || puzzleState.showSolution) return;

    setPuzzleState(prev => ({
      ...prev,
      showSolution: true,
      userRating: prev.userRating - 5, // Penalty
      message: 'Solution Revealed (-5 pts)'
    }));
  }

  function handleImport() {
    if (!importText.trim()) return;

    const lines = importText.trim().split('\n');
    const newPuzzles = [];

    // Attempt to parse TSV/Excel copy-paste
    // Format usually: PuzzleId | FEN | Moves | Rating ...
    // We expect at least FEN and Moves.

    for (const line of lines) {
      const parts = line.split(/\t/); // Split by tab
      if (parts.length >= 3) {
        // Heuristic: Check if parts[1] looks like FEN (contains / and digits)
        // or parts[0] is ID.
        // Screenshot format: PuzzleId, FEN, Moves, Rating...
        const pid = parts[0].trim();
        const fen = parts[1].trim();
        const moves = parts[2].trim();
        const rating = parseInt(parts[3]) || 1200;
        const themes = parts[5] || '';

        if (fen.includes('/')) {
          newPuzzles.push({
            PuzzleId: pid,
            FEN: fen,
            Moves: moves,
            Rating: rating,
            Themes: themes
          });
        }
      }
    }

    if (newPuzzles.length > 0) {
      setPuzzles(prev => [...prev, ...newPuzzles]);
      setShowImportModal(false);
      setImportText('');
      alert(`Imported ${newPuzzles.length} puzzles!`);
    } else {
      alert("Could not parse puzzles. Ensure you pasted Excel data with columns: ID, FEN, Moves, Rating...");
    }
  }

  function jumpToMove(index) {
    const game = gameRef.current;
    game.reset();
    // Replay moves using the new gameRef
    for (let i = 0; i <= index; i++) {
      if (history[i]) {
        game.move(history[i]);
      }
    }
    setFen(game.fen());
    setCurrentMoveIndex(index);
    setEvaluation(null);
    setBestLine('');
  }

  // --- Batch Analysis Logic ---
  const analyzingIndexRef = useRef(null); // Tracks which FEN index (0..N) we are analyzing

  // Helper to process eval results
  const handleAnalysisResult = (fenIndex, newEval) => {
    // console.log(`Analysis Result: Index ${fenIndex}`, newEval);
    setMoveAnalyses(prev => {
      const next = { ...prev };

      // Helper to get numeric score (handling mate)
      const getScore = (e) => {
        if (e.mate !== null) {
          // If mate > 0 (we win), score is very high. If < 0 (we lose), very low.
          // Prefer smaller mate distance (higher score if positive, lower if negative)
          return e.mate > 0 ? (20000 - e.mate) : (-20000 - e.mate);
        }
        return e.cp;
      };

      if (fenIndex < historyRef.current.length) {
        const moveIdx = fenIndex;
        // console.log(`Updating PRE for move ${moveIdx}`);
        next[moveIdx] = { ...next[moveIdx], pre: newEval };
      }

      if (fenIndex > 0) {
        const moveIdx = fenIndex - 1;
        // console.log(`Updating POST for move ${moveIdx}`);
        next[moveIdx] = { ...next[moveIdx], post: newEval };

        const analysis = next[moveIdx];
        if (analysis.pre && analysis.post) {
          const preScore = getScore(analysis.pre);
          const postScore = getScore(analysis.post);

          if (preScore !== null && postScore !== null) {
            // Loss calculation: sum because post is from opponent perspective (sign flipped)
            // e.g. Pre +100 (White). Post +100 (Black). Sum 200? No.
            // Post +100 means Black is +1. So White is -1.
            // Pre=100 (W+1). Post=100 (B+1 => W-1).
            // Loss = 100 - (-100) = 200.
            // Wait, CP is always relative to side to move.
            // If White +1. CP=100.
            // Opponent move. Now Black to move.
            // If Black is +1. CP=100.
            // This means White is -1.
            // So deviation is from +1 to -1. Loss = 200.
            // Mathematical check:
            // Loss = Pre - (-Post)? No.
            // Loss = Pre + Post. 
            // 100 + 100 = 200. Correct.

            const loss = preScore + postScore;
            // console.log(`Move ${moveIdx} Loss: ${loss} (Pre: ${preScore}, Post: ${postScore})`);

            let classification = 'good';
            if (loss > 300) classification = 'blunder';
            else if (loss > 100) classification = 'mistake';
            else if (loss > 50) classification = 'inaccuracy';
            // Also consider winning a forced mate missed?
            // If preScore > 10000 (Mate) and postScore < 10000 (Lost mate)

            next[moveIdx].classification = classification;
            next[moveIdx].loss = loss;
          }
        }
      }
      return next;
    });
  };

  const startBatchAnalysis = () => {
    setMoveAnalyses({});
    setShowAnalysisSummary(false);
    const fens = [];
    const game = new Chess();
    fens.push({ index: 0, fen: game.fen() });

    for (let i = 0; i < history.length; i++) {
      game.move(history[i]);

      if (game.isGameOver()) {
        let score = { cp: 0, mate: null };
        if (game.isCheckmate()) {
          const isWhiteMated = game.turn() === 'w';
          // If White mated, score is -Win. If Black mated, score is +Win.
          // Using a tiny non-zero mate to preserve sign if needed, or just 0 logic?
          // getScore logic: e.mate > 0 ? (20000 - e.mate) : (-20000 - e.mate)
          // If mate is 0: 20000 - 0 = 20000. -20000 - 0 = -20000.
          // We need to pass signed mate. 
          // -0 is 0 in JS. 
          // Let's pass +1 or -1 for simplicity to represent "Mate in 0"? 
          // Actually, if we pass mate: 1 (Mate in 1 for White) -> 19999.
          // Mate in 0 for White (White Won): 20000? 
          // Mate 0 usually implies "Just delivered mate".
          // If turn is 'w', White IS mated. White lost. Score should be -20000.
          // So mate should be negative.
          score = { cp: null, mate: isWhiteMated ? -0.1 : 0.1 }; // hacky float to preserve sign? 
          // getScore uses `e.mate > 0`. 
          // 0.1 > 0 is true. -0.1 > 0 is false.
          // parseInt(mate) might kill the float.
          // Let's rely on standard: if White mated, evaluate as Black winning (negative mate for white?).
          // Wait. Mate +N means White wins in N. Mate -N means Black wins in N.
          // If White is mated, White lost. Score is -M0.
          // So mate param should be negative.
          // Let's just manually set the result via handleAnalysisResult?
          // But handleAnalysisResult expects an eval object.
          // I'll assume 'mate: isWhiteMated ? -1 : 1' roughly correct (Mate just happened).
          score = { cp: null, mate: isWhiteMated ? -1 : 1 }; // Mate in 1 (just happened)
        }
        // If Draw, cp 0 is default.

        // We need to apply this result to the PREVIOUS move's post-eval.
        // handleAnalysisResult(i + 1, score) does exactly that (updates move i).
        handleAnalysisResult(i + 1, score);
      } else {
        fens.push({ index: i + 1, fen: game.fen() });
      }
    }

    setAnalysisQueue(fens);
    setIsAnalyzing(true);
  };

  useEffect(() => {
    if (playMode && !gameRef.current.isGameOver()) {
      const turn = gameRef.current.turn();
      // If it's AI's turn
      if (turn === aiColor) {
        if (!engine) return;

        // Add a small delay for realism
        const timeout = setTimeout(() => {
          engine.postMessage(`position fen ${fen}`);
          engine.postMessage('go depth 10');
        }, 500);

        return () => clearTimeout(timeout);
      }
    }
  }, [playMode, fen, aiColor, engine]); // Removed 'game' dependency

  // --- Engine Message Handling (Unified) ---
  useEffect(() => {
    if (!engine) return;

    const handleEngineMessage = (e) => {
      const msg = e.data;

      if (msg === 'uciok') {
        setIsEngineReady(true);
      }

      if (msg.startsWith('info depth')) {
        const cpMatch = msg.match(/score cp (-?\d+)/);
        const mateMatch = msg.match(/score mate (-?\d+)/);
        const pvMatch = msg.match(/ pv (.+)/);

        if (cpMatch || mateMatch) {
          const score = cpMatch ? parseInt(cpMatch[1]) : 0;
          const mate = mateMatch ? parseInt(mateMatch[1]) : null;
          const newEval = { cp: score, mate };

          setEvaluation(newEval);

          if (analyzingIndexRef.current !== null) {
            handleAnalysisResult(analyzingIndexRef.current, newEval);
          } else {
            setCurrentMoveIndex(idx => {
              if (idx >= 0) {
                setMoveAnalyses(prev => {
                  const currentAnalysis = prev[idx] || {};
                  return {
                    ...prev,
                    [idx]: { ...currentAnalysis, post: newEval }
                  };
                });
              }
              return idx;
            });
          }
        }

        if (pvMatch) {
          setBestLine(pvMatch[1]);
        }
      }

      if (msg.startsWith('bestmove')) {
        const moveStr = msg.split(' ')[1];
        if (analyzingIndexRef.current !== null) {
          // Capture best move logic
          const idx = analyzingIndexRef.current;
          if (moveStr) {
            try {
              const tmp = new Chess();
              // Replay history to get to the position being analyzed
              // Note: idx corresponds to the move index in history. 
              // idx=0 is start pos (pre-move 0). 
              for (let i = 0; i < idx; i++) {
                // Ensure we don't go out of bounds if history changed (unlikely during analysis lock)
                if (historyRef.current[i]) tmp.move(historyRef.current[i]);
              }
              const moveObj = tmp.move({
                from: moveStr.substring(0, 2),
                to: moveStr.substring(2, 4),
                promotion: 'q'
              });
              if (moveObj) {
                setMoveAnalyses(prev => ({
                  ...prev,
                  [idx]: { ...prev[idx], bestMove: moveObj.san }
                }));
              }
            } catch (err) {
              console.error("Error calculating best move SAN:", err);
            }
          }

          analyzingIndexRef.current = null;
          setAnalysisQueue(queue => queue.slice(1));
        } else if (playMode && gameRef.current.turn() === aiColor && !isAnalyzing) {
          if (moveStr && moveStr.length >= 4) {
            makeMove({
              from: moveStr.substring(0, 2),
              to: moveStr.substring(2, 4),
              promotion: 'q'
            });
          }
        }
      }
    };

    engine.onmessage = handleEngineMessage;
    return () => { engine.onmessage = null; };
  }, [engine, playMode, aiColor]);



  // Processor
  useEffect(() => {
    if (!isAnalyzing) return;
    if (analysisQueue.length === 0) {
      if (isAnalyzing) {
        setIsAnalyzing(false);
        setShowAnalysisSummary(true);
      }
      analyzingIndexRef.current = null;
      return;
    }

    const task = analysisQueue[0];
    analyzingIndexRef.current = task.index;

    if (engine) {
      engine.postMessage(`position fen ${task.fen}`);
      engine.postMessage('go depth 10');
    }
  }, [analysisQueue, isAnalyzing, engine]);

  // --- AI Coach Logic ---
  async function sendToGemini(prompt) {
    if (!apiKey) {
      setChatHistory(prev => [...prev, { role: 'model', text: "Please enter your Gemini API Key in settings to use the AI Coach." }]);
      setShowApiKeyInput(true);
      return;
    }

    setIsChatLoading(true);
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      setChatHistory(prev => [...prev, { role: 'model', text }]);
    } catch (error) {
      setChatHistory(prev => [...prev, { role: 'model', text: "Error contacting Gemini: " + error.message }]);
    } finally {
      setIsChatLoading(false);
    }
  }

  function askCoachAboutMove() {
    const lastMove = history[currentMoveIndex];
    if (!lastMove) return;

    const prompt = `
      You are a friendly, helpful chess coach.
      The current position FEN is: ${fen}
      The last move played was: ${lastMove.san} (${lastMove.color === 'w' ? 'White' : 'Black'}).
      The engine evaluation is: ${evaluation ? (evaluation.cp ? evaluation.cp / 100 : 'Mate in ' + evaluation.mate) : 'Unknown'}.
      
      Explain the strategic purpose of this move. Was it a good move? If it was a mistake, explain why simply.
    `;

    setChatHistory(prev => [...prev, { role: 'user', text: `Coach, what do you think about ${lastMove.san}?` }]);
    sendToGemini(prompt);
  }

  function handleChatSubmit(e) {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);

    const prompt = `
      Context: FEN ${fen}. History: ${history.map(m => m.san).join(' ')}.
      User: ${userMsg}
      Answer as a chess coach.
    `;
    sendToGemini(prompt);
  }

  // chessboard options
  const chessboardOptions = {
    fen: fen, // Changed from position to fen
    onDrop: onDrop,
    orientation: orientation,
    draggable: true,
    // Removed custom styles/arrows as they are not supported by chessboard.js wrapper yet
  };

  // --- Render ---
  return (
    <div className="h-screen w-full bg-gray-900 text-gray-100 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-gray-800 flex items-center justify-between px-6 bg-gray-900 shrink-0">
        <div className="flex items-center gap-2 text-primary">
          <Cpu size={24} />
          <h1 className="text-xl font-bold tracking-tight">AI Chess Analyzer</h1>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-300 mr-4 cursor-pointer">
            <input
              type="checkbox"
              checked={showAnimations}
              onChange={() => setShowAnimations(!showAnimations)}
              className="rounded bg-gray-700 border-gray-600 text-primary focus:ring-primary"
            />
            Show Animations
          </label>
          <Button variant="ghost" onClick={() => setShowApiKeyInput(!showApiKeyInput)}>
            <Settings size={18} />
            {apiKey ? 'API Key Set' : 'Set API Key'}
          </Button>
        </div>
      </header>

      {/* API Key Modal */}
      {showApiKeyInput && (
        <div className="absolute top-16 right-6 z-50 bg-gray-800 p-4 rounded shadow-xl border border-gray-700 w-80">
          <label className="block text-sm font-medium mb-2">Gemini API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => saveApiKey(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm mb-3 focus:outline-none focus:border-primary"
            placeholder="Enter key..."
          />
        </div>
      )}

      {/* Analysis Summary Modal */}
      {showAnalysisSummary && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-[800px] flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Cpu className="text-primary" /> Analysis Report
              </h3>
              <button onClick={() => setShowAnalysisSummary(false)} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <div className="flex gap-6">
                {/* White Player Stats */}
                <div className="flex-1">
                  <h4 className="font-bold text-gray-200 mb-4 border-b border-gray-700 pb-2 text-center">White Player</h4>
                  <div className="grid grid-cols-1 gap-3 mb-6">
                    {[
                      { label: 'Good Moves', type: 'good', color: 'text-green-400', icon: CheckCircle },
                      { label: 'Mistakes', type: 'mistake', color: 'text-orange-400', icon: HelpCircle },
                      { label: 'Blunders', type: 'blunder', color: 'text-red-500', icon: AlertTriangle },
                    ].map((statType) => {
                      const count = Object.entries(moveAnalyses).filter(([idx, a]) =>
                        parseInt(idx) % 2 === 0 && a.classification === statType.type
                      ).length;

                      return (
                        <div key={statType.label} className="bg-gray-700/30 p-3 rounded flex items-center justify-between border border-gray-700 px-4">
                          <div className="flex items-center gap-2">
                            <statType.icon size={18} className={statType.color} />
                            <span className="text-sm text-gray-300">{statType.label}</span>
                          </div>
                          <span className="text-xl font-bold text-white">{count}</span>
                        </div>
                      )
                    })}
                  </div>

                  {/* White Key Moments */}
                  <h5 className="font-semibold text-gray-400 text-sm mb-2">Key Moments (White)</h5>
                  <div className="space-y-2">
                    {Object.entries(moveAnalyses)
                      .filter(([idx, a]) => parseInt(idx) % 2 === 0 && (a.classification === 'mistake' || a.classification === 'blunder'))
                      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                      .map(([idx, analysis]) => {
                        const moveNum = Math.floor(parseInt(idx) / 2) + 1;
                        const moveSan = history[parseInt(idx)]?.san || '???';
                        return (
                          <div key={idx} className="bg-gray-900/50 p-2 rounded border border-gray-700 flex flex-col gap-1 hover:bg-gray-900 transition-colors cursor-pointer" onClick={() => {
                            jumpToMove(parseInt(idx));
                            setShowAnalysisSummary(false);
                          }}>
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-gray-400 font-mono w-8">{moveNum}.</span>
                              <span className="font-bold text-gray-200">{moveSan}</span>
                              <span className={analysis.classification === 'blunder' ? "text-red-500 text-xs font-bold uppercase" : "text-orange-400 text-xs font-bold uppercase"}>
                                {analysis.classification}
                              </span>
                            </div>
                            {analysis.bestMove && (
                              <div className="text-xs text-gray-500 pl-10">
                                Best: <span className="text-primary">{analysis.bestMove}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    {Object.entries(moveAnalyses).filter(([idx, a]) => parseInt(idx) % 2 === 0 && (a.classification === 'mistake' || a.classification === 'blunder')).length === 0 && (
                      <div className="text-xs text-gray-500 italic text-center py-2">No significant errors</div>
                    )}
                  </div>
                </div>

                {/* Vertical Divider */}
                <div className="w-px bg-gray-700"></div>

                {/* Black Player Stats */}
                <div className="flex-1">
                  <h4 className="font-bold text-gray-200 mb-4 border-b border-gray-700 pb-2 text-center">Black Player</h4>
                  <div className="grid grid-cols-1 gap-3 mb-6">
                    {[
                      { label: 'Good Moves', type: 'good', color: 'text-green-400', icon: CheckCircle },
                      { label: 'Mistakes', type: 'mistake', color: 'text-orange-400', icon: HelpCircle },
                      { label: 'Blunders', type: 'blunder', color: 'text-red-500', icon: AlertTriangle },
                    ].map((statType) => {
                      const count = Object.entries(moveAnalyses).filter(([idx, a]) =>
                        parseInt(idx) % 2 !== 0 && a.classification === statType.type
                      ).length;

                      return (
                        <div key={statType.label} className="bg-gray-700/30 p-3 rounded flex items-center justify-between border border-gray-700 px-4">
                          <div className="flex items-center gap-2">
                            <statType.icon size={18} className={statType.color} />
                            <span className="text-sm text-gray-300">{statType.label}</span>
                          </div>
                          <span className="text-xl font-bold text-white">{count}</span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Black Key Moments */}
                  <h5 className="font-semibold text-gray-400 text-sm mb-2">Key Moments (Black)</h5>
                  <div className="space-y-2">
                    {Object.entries(moveAnalyses)
                      .filter(([idx, a]) => parseInt(idx) % 2 !== 0 && (a.classification === 'mistake' || a.classification === 'blunder'))
                      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                      .map(([idx, analysis]) => {
                        const moveNum = Math.floor(parseInt(idx) / 2) + 1;
                        const moveSan = history[parseInt(idx)]?.san || '???';
                        return (
                          <div key={idx} className="bg-gray-900/50 p-2 rounded border border-gray-700 flex flex-col gap-1 hover:bg-gray-900 transition-colors cursor-pointer" onClick={() => {
                            jumpToMove(parseInt(idx));
                            setShowAnalysisSummary(false);
                          }}>
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-gray-400 font-mono w-8">{moveNum}...</span>
                              <span className="font-bold text-gray-200">{moveSan}</span>
                              <span className={analysis.classification === 'blunder' ? "text-red-500 text-xs font-bold uppercase" : "text-orange-400 text-xs font-bold uppercase"}>
                                {analysis.classification}
                              </span>
                            </div>
                            {analysis.bestMove && (
                              <div className="text-xs text-gray-500 pl-10">
                                Best: <span className="text-primary">{analysis.bestMove}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    {Object.entries(moveAnalyses).filter(([idx, a]) => parseInt(idx) % 2 !== 0 && (a.classification === 'mistake' || a.classification === 'blunder')).length === 0 && (
                      <div className="text-xs text-gray-500 italic text-center py-2">No significant errors</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-700 bg-gray-800/50 flex justify-end">
              <Button onClick={() => setShowAnalysisSummary(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-800 p-6 rounded-lg shadow-2xl border border-gray-700 w-[600px] flex flex-col gap-4">
            <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2">
              <Upload size={20} className="text-primary" /> Import Puzzles
            </h3>
            <p className="text-sm text-gray-400">
              Paste your Excel/TSV data here. Columns: <code>PuzzleId | FEN | Moves | Rating ...</code>
            </p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="flex-1 bg-gray-900 border border-gray-700 p-3 rounded font-mono text-xs h-64 focus:ring-1 focus:ring-primary outline-none resize-none"
              placeholder={`0000D\t5rk1/1p3ppp...\td3d6...\t1501...`}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowImportModal(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleImport}>Import</Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">

        {/* Left Panel: Controls & History */}
        <div className="w-full md:w-80 border-r border-gray-800 flex flex-col bg-gray-900/50">
          <Card
            className="flex-1 border-0 rounded-none"
            title="Game History"
            icon={History}
            action={
              !playMode && appMode !== 'puzzle' && (
                <Button
                  variant="ghost"
                  className="text-xs px-2 py-1 h-auto text-primary hover:text-white"
                  onClick={() => setShowLoadGameTray(!showLoadGameTray)}
                >
                  {showLoadGameTray ? 'Hide' : 'Load Games'}
                </Button>
              )
            }
          >
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1 text-sm" onClick={resetGame}>
                  <RotateCcw size={16} /> Reset
                </Button>
                <Button variant="secondary" className="flex-1 text-sm" onClick={() => setOrientation(o => o === 'white' ? 'black' : 'white')}>
                  Flip
                </Button>
              </div>

              <div className="flex items-center justify-between bg-gray-800 p-2 rounded">
                <span className="text-sm text-gray-300">Play vs AI</span>
                <button
                  onClick={() => {
                    setPlayMode(!playMode);
                    if (appMode === 'puzzle') setAppMode('analysis');
                  }}
                  className={clsx(
                    "w-10 h-5 rounded-full transition-colors relative",
                    playMode ? "bg-primary" : "bg-gray-600"
                  )}
                >
                  <div className={clsx(
                    "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                    playMode ? "left-6" : "left-1"
                  )} />
                </button>
              </div>

              <div className="flex gap-2">
                <Button
                  variant={appMode === 'puzzle' ? 'primary' : 'secondary'}
                  className="flex-1 justify-center"
                  onClick={() => {
                    setAppMode('puzzle');
                    setPlayMode(false);
                    loadPuzzle(puzzleState.index);
                  }}
                >
                  <CheckCircle size={16} /> Puzzles
                </Button>
                <Button
                  variant={appMode === 'analysis' ? 'primary' : 'secondary'}
                  className="flex-1 justify-center"
                  onClick={() => setAppMode('analysis')}
                >
                  <Cpu size={16} /> Analysis
                </Button>
              </div>

              {playMode && (
                <div className="flex bg-gray-800 p-1 rounded gap-1">
                  <button
                    onClick={() => setUserColor('w')}
                    className={clsx(
                      "flex-1 text-xs py-1 rounded font-medium transition-colors border border-transparent",
                      userColor === 'w' ? "bg-[#b58863] text-white shadow-sm" : "hover:bg-gray-700 text-gray-400"
                    )}
                  >
                    Play as White
                  </button>
                  <button
                    onClick={() => setUserColor('b')}
                    className={clsx(
                      "flex-1 text-xs py-1 rounded font-medium transition-colors border border-transparent",
                      userColor === 'b' ? "bg-[#3C3B39] text-white shadow-sm" : "hover:bg-gray-700 text-gray-400"
                    )}
                  >
                    Play as Black
                  </button>
                </div>
              )}

              <div className="h-px bg-gray-800 my-2" />

              <div className="flex-1 overflow-auto bg-[#262421] scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                <div className="table w-full text-sm border-collapse">
                  <div className="table-row text-[#747474] text-xs font-semibold border-b border-[#3C3B39]">
                    <div className="table-cell p-2 w-8 text-center">#</div>
                    <div className="table-cell p-2 w-1/2">White</div>
                    <div className="table-cell p-2 w-1/2">Black</div>
                  </div>
                  {Array.from({ length: Math.ceil(history.length / 2) }).map((_, rowIdx) => {
                    const whiteMoveIdx = rowIdx * 2;
                    const blackMoveIdx = rowIdx * 2 + 1;
                    const whiteMove = history[whiteMoveIdx];
                    const blackMove = history[blackMoveIdx];
                    const whiteAnalysis = moveAnalyses[whiteMoveIdx];
                    const blackAnalysis = moveAnalyses[blackMoveIdx];

                    const renderMoveCell = (move, idx, analysis) => {
                      if (!move) return <div className="table-cell p-2"></div>;
                      const isSelected = currentMoveIndex === idx;
                      return (
                        <div
                          key={idx}
                          className={clsx(
                            "table-cell p-2 align-top border-b border-[#3C3B39] transition-colors cursor-pointer relative group",
                            isSelected ? "bg-[#363431]" : "hover:bg-[#2A2926]"
                          )}
                          onClick={() => jumpToMove(idx)}
                        >
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className={clsx("font-bold text-base", isSelected ? "text-white" : "text-[#C3C3C3]")}>
                                {move.san}
                              </span>
                              {analysis?.classification && (
                                <span className={clsx(
                                  "text-xs font-bold px-1 rounded",
                                  analysis.classification === 'brilliant' ? "text-cyan-400" :
                                    analysis.classification === 'good' ? "text-[#95b545]" :
                                      analysis.classification === 'inaccuracy' ? "text-[#e8ae05]" :
                                        analysis.classification === 'mistake' ? "text-[#f29f05]" :
                                          analysis.classification === 'blunder' ? "text-[#ca3431]" : ""
                                )}>
                                  {analysis.classification === 'good' && <CheckCircle size={12} />}
                                  {analysis.classification === 'inaccuracy' && '?!'}
                                  {analysis.classification === 'mistake' && '?'}
                                  {analysis.classification === 'blunder' && '??'}
                                </span>
                              )}
                            </div>
                            {/* Sub-info: Eval and Best Move */}
                            {(analysis?.post || analysis?.bestMove) && (
                              <div className="text-[10px] text-[#747474] font-medium mt-0.5 min-h-[1.2em]">
                                {analysis.post && (
                                  <span className="mr-2">
                                    {analysis.post.mate ? `M${analysis.post.mate}` : (analysis.post.cp / 100).toFixed(2)}
                                  </span>
                                )}
                                {analysis.bestMove && (['mistake', 'blunder'].includes(analysis.classification)) && (
                                  <span className="text-primary opacity-80">
                                    Best: {analysis.bestMove}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    };

                    return (
                      <div key={rowIdx} className="table-row">
                        <div className="table-cell p-2 text-center text-[#747474] font-mono bg-[#21201D] border-b border-[#3C3B39] align-text-top pt-3">
                          {rowIdx + 1}.
                        </div>
                        {renderMoveCell(whiteMove, whiteMoveIdx, whiteAnalysis)}
                        {renderMoveCell(blackMove, blackMoveIdx, blackAnalysis)}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Game Result Footer */}
              {(gameRef.current.isGameOver() || fen.includes(' w - - 0 1')) && ( // Just showing footer always for testing or only when over? Image shows 1-0.
                // Let's rely on game over state
                gameRef.current.isGameOver() && (
                  <div className="border-t border-[#3C3B39] bg-[#21201D] p-3 flex flex-col items-center justify-center gap-1 shrink-0">
                    <div className="text-[#C3C3C3] font-bold text-lg">
                      {gameRef.current.isDraw() ? "½-½" : (gameRef.current.turn() === 'b' ? "1-0" : "0-1")}
                    </div>
                    <div className="text-[#747474] text-xs uppercase font-semibold">
                      {gameRef.current.isCheckmate() ? "Checkmate" :
                        gameRef.current.isDraw() ? "Draw" :
                          gameRef.current.isStalemate() ? "Stalemate" : "Game Over"}
                      {/* Note: Resignation is not tracked by chess.js internally unless we add it manually */}
                    </div>
                    <div className="text-[#747474] text-[10px] italic">
                      {gameRef.current.isCheckmate() ? (gameRef.current.turn() === 'b' ? "White is victorious" : "Black is victorious") : ""}
                    </div>
                  </div>
                )
              )}
            </div>
          </Card>



          {appMode === 'puzzle' ? (
            <div className="p-4 border-t border-gray-800 space-y-4">
              <h3 className="text-lg font-bold text-gray-200">Puzzle Mode</h3>

              {/* Firebase Status Indicators */}
              {puzzlesLoading && (
                <div className="bg-blue-900/30 border border-blue-700 text-blue-400 px-3 py-2 rounded text-xs flex items-center gap-2">
                  <Cpu size={14} className="animate-spin" />
                  Loading puzzles from Firebase...
                </div>
              )}

              {puzzlesError && (
                <div className="bg-yellow-900/30 border border-yellow-700 text-yellow-400 px-3 py-2 rounded text-xs">
                  ⚠️ Using local puzzles ({puzzlesError})
                </div>
              )}

              {!puzzlesLoading && !puzzlesError && firebasePuzzles.length > 0 && (
                <div className="bg-green-900/30 border border-green-700 text-green-400 px-3 py-2 rounded text-xs">
                  ✅ {firebasePuzzles.length} puzzles loaded from Firebase
                </div>
              )}

              {/* Puzzle Selector */}
              <PuzzleSelector
                puzzles={puzzles}
                loading={puzzlesLoading}
                onPuzzleSelect={(puzzle) => {
                  // Find puzzle index and load it
                  const index = puzzles.findIndex(
                    p => (p.PuzzleId === puzzle.PuzzleId || p.PuzzleId === puzzle.id || p.id === puzzle.id)
                  );
                  if (index !== -1) {
                    loadPuzzle(index);
                  }
                }}
                onFilterChange={({ minRating, maxRating, theme }) => {
                  if (theme) {
                    filterByTheme(theme).then(filtered => {
                      if (filtered && filtered.length > 0) {
                        setPuzzles(filtered);
                      }
                    });
                  } else {
                    filterByRating(minRating, maxRating).then(filtered => {
                      if (filtered && filtered.length > 0) {
                        setPuzzles(filtered);
                      }
                    });
                  }
                }}
              />

              <div className="bg-gray-800 p-4 rounded text-center">
                <div className="text-2xl font-bold text-primary">{puzzleState.userRating}</div>
                <div className="text-xs text-gray-400 uppercase tracking-wider">Your Rating</div>
              </div>

              <div className={clsx(
                "p-3 rounded border text-center font-medium",
                puzzleState.status === 'solved' ? "bg-green-900/30 border-green-700 text-green-400" :
                  puzzleState.status === 'failed' ? "bg-red-900/30 border-red-700 text-red-400" :
                    "bg-gray-800 border-gray-700 text-gray-300"
              )}>
                {puzzleState.message}
              </div>

              {puzzleState.status === 'solving' && !puzzleState.showSolution && (
                <Button
                  variant="secondary"
                  className="w-full justify-center border border-yellow-700/50 text-yellow-500 hover:bg-yellow-900/20"
                  onClick={handleShowSolution}
                >
                  <HelpCircle size={16} /> Show Solution (-5 pts)
                </Button>
              )}

              {puzzleState.showSolution && (
                <div className="bg-gray-800 p-3 rounded text-xs font-mono text-gray-400 break-words border border-gray-700">
                  <div className="font-bold text-gray-300 mb-1">Solution:</div>
                  {puzzleState.currentPuzzle?.Moves}
                </div>
              )}

              {puzzleState.status === 'solved' && (
                <Button variant="primary" className="w-full justify-center" onClick={nextPuzzle}>
                  Next Puzzle <ChevronRight size={16} />
                </Button>
              )}

              <div className="text-xs text-gray-500 text-center mt-4">
                Puzzle {puzzleState.index + 1} / {puzzles.length}
              </div>

              <div className="border-t border-gray-700 pt-3">
                <Button variant="ghost" size="sm" className="w-full text-xs text-gray-400" onClick={() => setShowImportModal(true)}>
                  <Upload size={14} /> Import Puzzles (Excel)
                </Button>
              </div>
            </div>
          ) : (
            <>
              {showLoadGameTray && (
                <div className="p-4 border-t border-gray-800 space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase">Load Game</h3>
                    <Button variant="ghost" className="p-1 h-auto" onClick={() => setShowLoadGameTray(false)}>
                      <X size={14} />
                    </Button>
                  </div>


                  {/* PGN Load */}
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        id="lichess-username"
                        className="flex-1 bg-gray-800 border-none rounded px-3 py-2 text-sm focus:ring-1 focus:ring-primary"
                        placeholder="Lichess Username"
                        onKeyDown={(e) => e.key === 'Enter' && fetchLichessGames(e.target.value)}
                      />
                      <Button variant="secondary" className="px-3" onClick={() => fetchLichessGames(document.getElementById('lichess-username').value)}>
                        <Upload size={16} />
                      </Button>
                      <button onClick={generateRandomFen} className="bg-gray-700 hover:bg-gray-600 text-gray-200 p-2 rounded" title="Random FEN">
                        <RotateCcw size={16} />
                      </button>
                    </div>

                    <textarea
                      className="w-full bg-gray-800 border-none rounded p-3 text-xs font-mono h-24 resize-none focus:ring-1 focus:ring-primary"
                      placeholder="Paste PGN here..."
                      value={pgnInput}
                      onChange={(e) => setPgnInput(e.target.value)}
                    />
                    <Button size="sm" variant="secondary" className="w-full justify-center" onClick={() => loadPgn(pgnInput)}>
                      <Play size={16} /> Load PGN
                    </Button>
                  </div>

                  <div className="h-px bg-gray-800 my-2" />

                  {/* FEN Load */}
                  <div className="space-y-2">
                    <input
                      className="w-full bg-gray-800 border-none rounded px-3 py-2 text-xs font-mono focus:ring-1 focus:ring-primary"
                      placeholder="Paste FEN position..."
                      value={fenInput}
                      onChange={(e) => setFenInput(e.target.value)}
                    />
                    <Button size="sm" variant="secondary" className="w-full justify-center" onClick={() => loadFen(fenInput)}>
                      <CheckCircle size={16} /> Load FEN
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Center Panel: Board */}
        <div className="flex-1 bg-gray-950 flex flex-col items-center justify-center p-4 relative">
          <div className="w-full h-full flex flex-col items-center justify-center">
            <div
              className="w-full max-w-[500px] shadow-2xl shadow-black/50 rounded-lg bg-[#b58863] relative"
            >
              {/* Use Custom Wrapper */}
              <ChessboardJS
                fen={fen}
                orientation={orientation}
                draggable={true}
                onDrop={onDrop}
                width={500}
              />
              <ArrowOverlay
                arrows={[
                  ...(appMode !== 'puzzle' && !playMode && engineArrow ? [[engineArrow]] : []), // Wrap in extra array? No, engineArrow is object {from,to,color}, state logic for react-chessboard was different? 
                  // Let's check engineArrow structure.
                  // setEngineArrow({ from, to, color: 'rgba(0, 255, 0, 0.6)' });
                  // ArrowOverlay expects array of objects {from, to, color}
                  ...(appMode !== 'puzzle' && !playMode && engineArrow ? [engineArrow] : []),
                  ...manualArrows
                ]}
                orientation={orientation}
              />
            </div>

            {/* Evaluation Bar & Info */}
            {appMode !== 'puzzle' && !playMode && (
              <div className="mt-6 w-full max-w-[500px] flex flex-col gap-2">
                <div className="bg-gray-800 h-2 rounded-full overflow-hidden w-full">
                  <div
                    className="bg-white h-full transition-all duration-500"
                    style={{
                      width: `${Math.min(Math.max(50 + (evaluation?.cp || 0) / 10, 5), 95)}%`
                    }}
                  />
                </div>
                <div className="text-sm text-gray-300 font-mono space-y-1">
                  <div>
                    <span className="font-bold text-gray-500">Evaluation:</span>{' '}
                    {evaluation ? (evaluation.cp ? (evaluation.cp > 0 ? '+' : '') + (evaluation.cp / 100).toFixed(2) : `#${evaluation.mate}`) : '...'}
                    <span className="mx-2 text-gray-600">|</span>
                    <span className="font-bold text-gray-500">Depth:</span> 15
                  </div>
                  <div>
                    <span className="font-bold text-gray-500">Best line:</span>{' '}
                    <span className="text-primary italic">{bestLine.slice(0, 40)}{bestLine.length > 40 ? '...' : ''}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  The green arrow shows Stockfish's suggested best move.
                </p>
              </div>
            )}

            {/* Navigation Controls */}
            <div className="mt-4 flex gap-4">
              <Button
                variant="secondary"
                onClick={() => jumpToMove(currentMoveIndex - 1)}
                disabled={currentMoveIndex < -1}
              >
                <ChevronLeft size={20} />
              </Button>
              <Button
                variant="secondary"
                onClick={() => jumpToMove(currentMoveIndex + 1)}
                disabled={currentMoveIndex >= history.length - 1}
              >
                <ChevronRight size={20} />
              </Button>
            </div>
          </div>
        </div>

        {/* Right Panel: Analysis & Chat */}
        <div className="w-full md:w-96 border-l border-gray-800 flex flex-col bg-gray-900/50">
          <Card className="h-1/3 border-0 rounded-none border-b border-gray-800" title="Analysis" icon={AlertTriangle}>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-gray-300">Engine Ready</span>
              </div>
              <p className="text-gray-400">
                {history.length > 0 ? "Game in progress." : "Start a game to see analysis."}
              </p>
              {history.length > 0 && (
                <Button size="sm" variant="secondary" onClick={askCoachAboutMove} className="w-full justify-center">
                  <MessageSquare size={16} /> Ask Coach about this move
                </Button>
              )}
              {history.length > 0 && !isAnalyzing && (
                <Button size="sm" variant="primary" onClick={startBatchAnalysis} className="w-full justify-center mt-2">
                  <Cpu size={16} /> Computer Analysis
                </Button>
              )}
              {isAnalyzing && (
                <div className="text-xs text-center text-primary animate-pulse">
                  Analyzing... {Math.round((1 - analysisQueue.length / (history.length + 1)) * 100)}%
                </div>
              )}
            </div>
          </Card>

          <Card className="flex-1 border-0 rounded-none flex flex-col" title="AI Coach" icon={MessageSquare}>
            <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
              {chatHistory.map((msg, i) => (
                <div key={i} className={clsx("flex flex-col", msg.role === 'user' ? "items-end" : "items-start")}>
                  <div className={clsx(
                    "max-w-[85%] rounded-lg p-3 text-sm",
                    msg.role === 'user' ? "bg-primary text-white" : "bg-gray-700 text-gray-200"
                  )}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex items-center gap-2 text-gray-500 text-xs animate-pulse">
                  <Cpu size={12} /> Coach is thinking...
                </div>
              )}
            </div>
            <form onSubmit={handleChatSubmit} className="flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
                placeholder="Ask a question..."
              />
              <Button type="submit" variant="primary" className="px-3"><Send size={16} /></Button>
            </form>
          </Card>
        </div >

      </main >
    </div >
  );
}

export default App;
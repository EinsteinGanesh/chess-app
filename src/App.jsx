import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import ChessboardJS from './components/ChessboardJS'; // Import the new wrapper
import {
  History, Upload, Play, RotateCcw, ChevronLeft, ChevronRight,
  MessageSquare, Cpu, Settings, X, Send, AlertTriangle, CheckCircle, HelpCircle
} from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

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

function Card({ children, className, title, icon: Icon }) {
  return (
    <div className={twMerge("bg-gray-800 rounded-lg border border-gray-700 flex flex-col overflow-hidden", className)}>
      {(title || Icon) && (
        <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50 flex items-center gap-2">
          {Icon && <Icon size={18} className="text-primary" />}
          <h3 className="font-semibold text-gray-200">{title}</h3>
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
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg === 'uciok') {
        setIsEngineReady(true);
      }
      if (msg.startsWith('info depth')) {
        // Parse evaluation
        // Example: info depth 10 ... score cp 50 ... pv e2e4 e7e5
        const cpMatch = msg.match(/score cp (-?\d+)/);
        const mateMatch = msg.match(/score mate (-?\d+)/);
        const pvMatch = msg.match(/ pv (.+)/);

        if (cpMatch || mateMatch) {
          const newEval = {
            cp: cpMatch ? parseInt(cpMatch[1]) : null,
            mate: mateMatch ? parseInt(mateMatch[1]) : null,
          };
          setEvaluation(newEval);

          // Update analysis for current move if we are at the latest position or reviewing
          setCurrentMoveIndex(idx => {
            if (idx >= 0) {
              setMoveAnalyses(prev => {
                const currentAnalysis = prev[idx] || {};
                // If we already have a classification that is "final" maybe don't overwrite? 
                // But engine refines depth, so overwriting is good for accuracy.

                // Calculate Loss / Classification
                // Loss = PreCP + PostCP (since perspectives flip)
                let classification = null;
                let loss = null;

                if (currentAnalysis.pre && newEval) {
                  // Handle Checks/Mates complexities - simplified for CP
                  if (currentAnalysis.pre.cp !== null && newEval.cp !== null) {
                    loss = currentAnalysis.pre.cp + newEval.cp; // Sum because perspectives are opposite

                    // Classification logic
                    // Note: "Good" for user means LOSS is LOW.
                    // If loss is negative (we improved??), it's a blunder by opponent that we capitalized on? 
                    // Or engine changed its mind.
                    // Generally Loss > 0 means we lost advantage.

                    if (loss <= 50) classification = 'good';
                    else if (loss <= 150) classification = 'inaccuracy';
                    else if (loss <= 300) classification = 'mistake';
                    else classification = 'blunder';
                  }
                }

                return {
                  ...prev,
                  [idx]: {
                    ...currentAnalysis,
                    post: newEval,
                    loss,
                    classification
                  }
                };
              });
            }
            return idx;
          });
        }
        if (pvMatch) {
          setBestLine(pvMatch[1]);
        }
      }
    };
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
  useEffect(() => {
    if (!engine || !isEngineReady) return;

    setAnalyzing(true);
    engine.postMessage('stop');
    engine.postMessage(`position fen ${fen}`);
    engine.postMessage('go depth 15'); // Moderate depth for responsiveness

    return () => {
      // Cleanup if needed
    };
  }, [engine, isEngineReady, fen]);

  // Debug: Log FEN changes
  useEffect(() => {
    console.log("FEN changed to:", fen);
  }, [fen]);

  // --- Game Logic ---
  function makeMove(move) {
    try {
      const game = gameRef.current;
      const result = game.move(move);

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
            ? 'radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)' // larger circle for capturing
            : 'radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)', // smaller circle for moving
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
    if (!moveFrom) {
      const piece = game.get(square);
      if (!piece) return;

      const hasMoveOptions = getMoveOptions(square);
      if (hasMoveOptions) setMoveFrom(square);
      return;
    }

    const moves = game.moves({ square: moveFrom, verbose: true });
    const foundMove = moves.find(m => m.from === moveFrom && m.to === square);

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

  function onSquareRightClick(square) {
    const colour = 'rgba(0, 0, 255, 0.4)';
    setRightClickedSquares({
      ...rightClickedSquares,
      [square]:
        rightClickedSquares[square] && rightClickedSquares[square].backgroundColor === colour
          ? undefined
          : { backgroundColor: colour }
    });
  }

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
      }
    } catch (e) {
      alert("Error fetching Lichess games");
    }
  }

  // --- Play Mode Logic ---
  const [playMode, setPlayMode] = useState(false);
  const [aiColor, setAiColor] = useState('b'); // AI plays Black by default
  const [pgnInput, setPgnInput] = useState('');
  const [fenInput, setFenInput] = useState('');

  function loadPgn(pgn) {
    try {
      const game = gameRef.current;
      game.loadPgn(pgn);
      setFen(game.fen());
      setHistory(game.history({ verbose: true }));
      setCurrentMoveIndex(game.history().length - 1);
    } catch (e) {
      alert("Invalid PGN");
    }
  }

  function loadFen(fen) {
    try {
      const game = gameRef.current;
      // .load() usually returns true on success, but we can just call it 
      // and catch any throw. If it returns false (v0.x), checks below might fail or be implicit.
      game.load(fen);

      setFen(game.fen());
      setHistory([]);
      setCurrentMoveIndex(-1);
      setEvaluation(null);
      setBestLine('');
    } catch (e) {
      console.error("FEN Load Error:", e);
      alert("Invalid FEN string");
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
    setMoveAnalyses(prev => {
      const next = { ...prev };

      if (fenIndex < history.length) {
        const moveIdx = fenIndex;
        next[moveIdx] = { ...next[moveIdx], pre: newEval };
      }

      if (fenIndex > 0) {
        const moveIdx = fenIndex - 1;
        next[moveIdx] = { ...next[moveIdx], post: newEval };

        const analysis = next[moveIdx];
        if (analysis.pre && analysis.post && analysis.pre.cp !== null && analysis.post.cp !== null) {
          const loss = analysis.pre.cp + analysis.post.cp;

          let classification = 'good';
          if (loss > 300) classification = 'blunder';
          else if (loss > 100) classification = 'mistake';
          else if (loss > 50) classification = 'inaccuracy';

          next[moveIdx].classification = classification;
          next[moveIdx].loss = loss;
        }
      }
      return next;
    });
  };

  const startBatchAnalysis = () => {
    setMoveAnalyses({});
    const fens = [];
    const game = new Chess();
    fens.push({ index: 0, fen: game.fen() });

    for (let i = 0; i < history.length; i++) {
      game.move(history[i]);
      fens.push({ index: i + 1, fen: game.fen() });
    }

    setAnalysisQueue(fens);
    setIsAnalyzing(true);
  };

  useEffect(() => {
    if (playMode && gameRef.current.turn() === aiColor && !gameRef.current.isGameOver()) {
      // AI's turn
      if (!engine) return;

      const timeout = setTimeout(() => {
        engine.postMessage(`position fen ${fen}`);
        engine.postMessage('go depth 10');
      }, 500);

      return () => clearTimeout(timeout);
    }
  }, [playMode, fen, aiColor, engine]); // Removed 'game' dependency

  // Worker listener for moves
  useEffect(() => {
    if (!engine) return;

    const originalOnMessage = engine.onmessage;
    engine.onmessage = (e) => {
      const msg = e.data;
      if (msg.startsWith('info depth')) {
        const depth = parseInt(msg.split('depth ')[1].split(' ')[0]);
        let score = 0;
        let mate = null;
        if (msg.includes('mate')) {
          mate = parseInt(msg.split('mate ')[1].split(' ')[0]);
        } else if (msg.includes('cp')) {
          score = parseInt(msg.split('cp ')[1].split(' ')[0]);
        }

        const newEval = { cp: score, mate };
        setEvaluation(newEval); // Update UI bar always

        // Update Analysis Data
        // If we are batch analyzing, we need to know WHICH position this is.
        // We can track 'analyzingIndex' in state or ref.
        if (analyzingIndexRef.current !== null) {
          handleAnalysisResult(analyzingIndexRef.current, newEval);
        } else {
          // Live analysis (currentMoveIndex)
          // Existing logic...
          // Actually, let's unify.
          // If analyzingIndexRef is set, usage it. Else usage currentMoveIndex?
          // "Live" analysis happens on 'makeMove'.
          // The existing 'makeMove' logic stored 'pre' evaluation. 
          // It relies on 'evaluation' state being fresh.

          // To support batch, we need to explicitly link the eval to the index.
        }
      }

      if (msg.startsWith('bestmove')) {
        const move = msg.split(' ')[1];
        if (playMode && gameRef.current.turn() === aiColor && !isAnalyzing) {
          makeMove({ from: move.substring(0, 2), to: move.substring(2, 4), promotion: 'q' });
        }

        // Trigger next if batch
        if (isAnalyzing && analyzingIndexRef.current !== null) {
          const finishedIndex = analyzingIndexRef.current;
          analyzingIndexRef.current = null; // Clear
          setAnalysisQueue(q => q.slice(1)); // Remove task, triggering effect
        }
      }
      if (originalOnMessage) originalOnMessage(e);
    };

    return () => {
      engine.onmessage = originalOnMessage;
    };
  }, [engine, playMode, aiColor]);



  // Processor
  useEffect(() => {
    if (!isAnalyzing) return;
    if (analysisQueue.length === 0) {
      setIsAnalyzing(false);
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
          <Button size="sm" onClick={() => setShowApiKeyInput(false)}>Done</Button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">

        {/* Left Panel: Controls & History */}
        <div className="w-full md:w-80 border-r border-gray-800 flex flex-col bg-gray-900/50">
          <Card className="flex-1 border-0 rounded-none" title="Game History" icon={History}>
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
                  onClick={() => setPlayMode(!playMode)}
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

              <div className="h-px bg-gray-800 my-2" />

              <div className="grid grid-cols-2 gap-y-1 gap-x-4 text-sm">
                {history.map((move, i) => (
                  <React.Fragment key={i}>
                    {i % 2 === 0 && <div className="text-gray-500 text-right font-mono">{(i / 2 + 1)}.</div>}
                    <button
                      className={clsx(
                        "text-left px-2 rounded hover:bg-gray-800 transition-colors font-medium flex justify-between items-center group",
                        currentMoveIndex === i ? "bg-primary/20 text-primary" : "text-gray-300"
                      )}
                      onClick={() => jumpToMove(i)}
                    >
                      <span>{move.san}</span>
                      {moveAnalyses[i]?.classification && (
                        <span className={clsx(
                          "text-[10px] px-1 rounded uppercase font-bold",
                          moveAnalyses[i].classification === 'good' && "text-green-500",
                          moveAnalyses[i].classification === 'inaccuracy' && "text-yellow-500",
                          moveAnalyses[i].classification === 'mistake' && "text-orange-500",
                          moveAnalyses[i].classification === 'blunder' && "text-red-500",
                        )}>
                          {moveAnalyses[i].classification === 'good' && '★'}
                          {moveAnalyses[i].classification === 'inaccuracy' && '?!'}
                          {moveAnalyses[i].classification === 'mistake' && '?'}
                          {moveAnalyses[i].classification === 'blunder' && '??'}
                        </span>
                      )}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              {/* Legend Removed as requested */}
            </div>
          </Card>

          <div className="p-4 border-t border-gray-800 space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase">Load Game</h3>

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
        </div>

        {/* Center Panel: Board */}
        <div className="flex-1 bg-gray-950 flex flex-col items-center justify-center p-4 relative">
          <div className="w-full h-full flex flex-col items-center justify-center">
            <div className="w-full max-w-[500px] aspect-square shadow-2xl shadow-black/50 rounded-lg border-4 border-gray-800 bg-[#b58863]">
              {/* Use Custom Wrapper */}
              <ChessboardJS {...chessboardOptions} width={500} />
            </div>

            {/* Evaluation Bar & Info */}
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
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
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
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [history, setHistory] = useState([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1); // -1 = start
  const [orientation, setOrientation] = useState('white');

  // Engine State
  const [engine, setEngine] = useState(null);
  const [evaluation, setEvaluation] = useState(null); // { cp: 0, mate: null }
  const [bestLine, setBestLine] = useState('');
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // AI Coach State
  const [apiKey, setApiKey] = useState('');
  const [chatHistory, setChatHistory] = useState([{ role: 'model', text: "Hello! I'm your AI Chess Coach. Load a game or make a move, and I'll help you analyze it!" }]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  // UI State
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

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
          setEvaluation({
            cp: cpMatch ? parseInt(cpMatch[1]) : null,
            mate: mateMatch ? parseInt(mateMatch[1]) : null,
          });
        }
        if (pvMatch) {
          setBestLine(pvMatch[1]);
        }
      }
    };
    worker.postMessage('uci');
    setEngine(worker);
    return () => worker.terminate();
  }, []);

  // Click-to-move state
  const [selectedSquare, setSelectedSquare] = useState(null);

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
      console.log("Attempting move:", move);
      console.log("Current FEN:", game.fen());
      const gameCopy = new Chess(game.fen());
      const result = gameCopy.move(move);
      console.log("Move result:", result);
      if (result) {
        setGame(gameCopy);
        setFen(gameCopy.fen());
        setHistory(gameCopy.history({ verbose: true }));
        setCurrentMoveIndex(prev => prev + 1);
        setSelectedSquare(null); // Clear selection after move
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

  function onSquareClick(square) {
    console.log("Square clicked:", square);

    if (!selectedSquare) {
      // First click - select piece
      const piece = game.get(square);
      if (piece && piece.color === game.turn()) {
        console.log("Selected piece:", piece, "at", square);
        setSelectedSquare(square);
      }
    } else {
      // Second click - try to move
      console.log("Trying to move from", selectedSquare, "to", square);
      const success = makeMove({
        from: selectedSquare,
        to: square,
        promotion: 'q',
      });
      if (!success) {
        // If move failed, check if clicked on another piece of same color
        const piece = game.get(square);
        if (piece && piece.color === game.turn()) {
          console.log("Selected different piece:", piece, "at", square);
          setSelectedSquare(square);
        } else {
          setSelectedSquare(null);
        }
      }
    }
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

  function loadPgn(pgn) {
    try {
      const newGame = new Chess();
      newGame.loadPgn(pgn);
      setGame(newGame);
      setFen(newGame.fen()); // Set to end of game
      setHistory(newGame.history({ verbose: true }));
      setCurrentMoveIndex(newGame.history().length - 1);
    } catch (e) {
      alert("Invalid PGN");
    }
  }

  function resetGame() {
    const newGame = new Chess();
    setGame(newGame);
    setFen(newGame.fen());
    setHistory([]);
    setCurrentMoveIndex(-1);
    setEvaluation(null);
    setBestLine('');
  }

  function jumpToMove(index) {
    if (index < -1 || index >= history.length) return;

    const newGame = new Chess();
    // Replay moves up to index
    for (let i = 0; i <= index; i++) {
      // Use .san to ensure robust replay
      if (history[i] && history[i].san) {
        newGame.move(history[i].san);
      } else {
        // Fallback if history item is just a string or weird object
        newGame.move(history[i]);
      }
    }

    setGame(newGame);
    setFen(newGame.fen());
    setCurrentMoveIndex(index);

    // Clear evaluation when jumping (or could re-analyze)
    setEvaluation(null);
    setBestLine('');
  }

  useEffect(() => {
    if (playMode && game.turn() === aiColor && !game.isGameOver()) {
      // AI's turn
      if (!engine) return;

      // Small delay for realism
      const timeout = setTimeout(() => {
        engine.postMessage(`position fen ${game.fen()}`);
        engine.postMessage('go depth 10'); // Fast move
      }, 500);

      // We need to listen for the bestmove in the main worker listener
      // But the main listener updates 'bestLine'. We need a specific listener for the move.
      // Actually, let's just use the 'bestLine' or add a specific handler.
      // For simplicity, let's modify the worker listener to handle 'bestmove'.
      return () => clearTimeout(timeout);
    }
  }, [playMode, game, aiColor, engine]);

  // We need to update the worker listener to handle 'bestmove' for Play Mode
  useEffect(() => {
    if (!engine) return;

    const originalOnMessage = engine.onmessage;

    engine.onmessage = (e) => {
      const msg = e.data;
      if (msg.startsWith('bestmove')) {
        const move = msg.split(' ')[1];
        if (playMode && game.turn() === aiColor) {
          makeMove({ from: move.substring(0, 2), to: move.substring(2, 4), promotion: 'q' });
        }
      }
      // Call original listener for analysis updates
      if (originalOnMessage) originalOnMessage(e);
    };

    return () => {
      engine.onmessage = originalOnMessage;
    };
  }, [engine, playMode, game, aiColor]); // Re-bind when game state changes to ensure closure has latest game? No, 'game' in makeMove needs to be latest.
  // Actually, 'makeMove' uses 'game' from state, but inside the event listener closure, 'game' might be stale if we don't re-bind.
  // Better approach: Use a ref for 'game' or 'playMode' if we want to avoid re-binding the heavy worker listener constantly.
  // Or just rely on the fact that the effect re-runs.


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
            onChange={(e) => setApiKey(e.target.value)}
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
                        "text-left px-2 rounded hover:bg-gray-800 transition-colors font-medium",
                        currentMoveIndex === i ? "bg-primary/20 text-primary" : "text-gray-300"
                      )}
                      onClick={() => jumpToMove(i)}
                    >
                      {move.san}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </Card>

          <div className="p-4 border-t border-gray-800 space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase">Load Game</h3>
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
            </div>
            <textarea
              className="w-full bg-gray-800 border-none rounded p-3 text-xs font-mono h-24 resize-none focus:ring-1 focus:ring-primary"
              placeholder="Paste PGN here..."
              onBlur={(e) => e.target.value && loadPgn(e.target.value)}
            />
          </div>
        </div>

        {/* Center Panel: Board */}
        <div className="flex-1 bg-gray-950 flex flex-col items-center justify-center p-4 relative">
          <div className="w-full h-full flex flex-col items-center justify-center">
            <div className="w-full max-w-[500px] aspect-square shadow-2xl shadow-black/50 rounded-lg border-4 border-gray-800">
              <Chessboard
                position={fen}
                onPieceDrop={onDrop}
                onPieceDragBegin={(piece, sourceSquare) => console.log("Drag begin:", piece, sourceSquare)}
                boardOrientation={orientation}
                customDarkSquareStyle={{ backgroundColor: '#779556' }}
                customLightSquareStyle={{ backgroundColor: '#ebecd0' }}
                arePiecesDraggable={true}
              />
            </div>

            {/* Evaluation Bar (Simple) */}
            <div className="mt-6 w-full max-w-[600px] bg-gray-800 h-2 rounded-full overflow-hidden flex shrink-0">
              <div
                className="bg-white h-full transition-all duration-500"
                style={{
                  width: `${Math.min(Math.max(50 + (evaluation?.cp || 0) / 10, 5), 95)}%`
                }}
              />
            </div>
            <div className="mt-2 text-sm font-mono text-gray-400 flex justify-between w-full max-w-[600px] shrink-0">
              <span>Eval: {evaluation ? (evaluation.cp ? (evaluation.cp > 0 ? '+' : '') + (evaluation.cp / 100).toFixed(2) : `M${evaluation.mate}`) : '...'}</span>
              <span className="truncate max-w-[300px]">{bestLine}</span>
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
        </div>

      </main>
    </div>
  );
}

export default App;
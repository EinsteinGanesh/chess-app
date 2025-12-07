import React, { useEffect, useRef } from 'react';
// import $ from 'jquery';
// import '@chrisoakman/chessboardjs/dist/chessboard-1.0.0.min.js';

// Global $ is expected to be loaded via script tag now
// window.$ = $;

const ChessboardJS = ({
    fen,
    orientation = 'white',
    draggable = true,
    onDrop,
    onSnapEnd,
    width = 400
}) => {
    const boardId = useRef(`board-${Math.random().toString(36).substr(2, 9)}`);
    const boardRef = useRef(null);

    // Initialize Board
    useEffect(() => {
        // Config
        const config = {
            position: fen || 'start',
            orientation: orientation,
            draggable: draggable,
            pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
            onDrop: (source, target, piece, newPos, oldPos, orientation) => {
                if (onDrop) {
                    // chessboard.js expects 'snapback' string return if move is invalid.
                    // Our App.jsx makeMove returns boolean (true=valid, false=invalid).
                    const success = onDrop(source, target, piece);
                    if (!success) return 'snapback';
                }
            },
            onSnapEnd: () => {
                // This is often needed to update position for castling etc.
                if (onSnapEnd) onSnapEnd();
            }
        };

        boardRef.current = window.Chessboard(boardId.current, config);

        // Cleanup
        return () => {
            boardRef.current && boardRef.current.destroy();
        };
    }, []);

    // Watch for updates
    useEffect(() => {
        if (boardRef.current) {
            boardRef.current.position(fen);
        }
    }, [fen]);

    useEffect(() => {
        if (boardRef.current) {
            boardRef.current.orientation(orientation);
        }
    }, [orientation]);

    return (
        <div
            id={boardId.current}
            style={{ width: '100%', height: '100%', maxWidth: width + 'px' }}
            className="chessboard-js-container"
        />
    );
};

export default ChessboardJS;

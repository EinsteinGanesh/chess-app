import React from 'react';

const ArrowOverlay = ({ arrows = [], orientation = 'white' }) => {
    if (!arrows || arrows.length === 0) return null;

    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];

    const getCoords = (square) => {
        if (!square) return { x: 0, y: 0 };

        const file = square[0];
        const rank = square[1];
        let col = files.indexOf(file);
        let row = ranks.indexOf(rank);

        // Coordinate system:
        // x: 0 (left) to 100 (right)
        // y: 0 (top) to 100 (bottom)

        if (orientation === 'white') {
            // White bottom:
            // Rank 1 -> y ~ 87.5-100 (Index 0 in ranks array, but should be at bottom)
            // Rank 8 -> y ~ 0-12.5
            // So row index 0 (Rank 1) should map to 7. 
            row = 7 - row;
        } else {
            // Black bottom:
            // Rank 1 -> y ~ 0-12.5 (Top)
            // Rank 8 -> y ~ 87.5-100 (Bottom)
            // So row index 0 (Rank 1) maps to 0. 
            // col index 0 (a) maps to 7 (Right)
            col = 7 - col;
        }

        const x = (col + 0.5) * 12.5;
        const y = (row + 0.5) * 12.5;
        return { x, y };
    };

    return (
        <svg
            viewBox="0 0 100 100"
            className="absolute top-0 left-0 w-full h-full pointer-events-none z-10"
            style={{ pointerEvents: 'none' }}
        >
            {arrows.map((arrow, i) => {
                const start = getCoords(arrow.from);
                const end = getCoords(arrow.to);
                const color = arrow.color || 'auto'; // 'auto' logic can be handled or default
                const actualColor = color === 'auto' ? 'rgba(255,170,0,0.8)' : color;

                // Unique ID for marker to handle colors
                const markerId = `arrowhead-${i}-${actualColor.replace(/[^\w]/g, '')}`;

                return (
                    <g key={i}>
                        <defs>
                            <marker
                                id={markerId}
                                markerWidth="4"
                                markerHeight="4"
                                refX="3.5"
                                refY="2"
                                orient="auto"
                            >
                                <polygon points="0 0, 4 2, 0 4" fill={actualColor} />
                            </marker>
                        </defs>
                        <line
                            x1={start.x}
                            y1={start.y}
                            x2={end.x}
                            y2={end.y}
                            stroke={actualColor}
                            strokeWidth="2.0"
                            strokeLinecap="round"
                            markerEnd={`url(#${markerId})`}
                            opacity="0.9"
                        />
                    </g>
                );
            })}
        </svg>
    );
};

export default ArrowOverlay;

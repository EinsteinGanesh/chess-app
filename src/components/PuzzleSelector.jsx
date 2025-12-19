import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react'; // Assuming lucide-react is available since it's used in App.jsx


/**
 * PuzzleSelector Component
 * Allows users to filter and select chess puzzles by rating and theme
 */
export default function PuzzleSelector({
    onPuzzleSelect,
    onFilterChange,
    puzzles = [],
    loading = false
}) {
    const [minRating, setMinRating] = useState(800);
    const [maxRating, setMaxRating] = useState(2000);
    const [selectedTheme, setSelectedTheme] = useState('all');
    const [availableThemes, setAvailableThemes] = useState([]);
    const [isExpanded, setIsExpanded] = useState(false); // Default collapsed for compactness

    // Extract unique themes from puzzles
    useEffect(() => {
        if (puzzles.length > 0) {
            const themesSet = new Set();
            puzzles.forEach(puzzle => {
                if (Array.isArray(puzzle.Themes)) {
                    puzzle.Themes.forEach(theme => themesSet.add(theme));
                } else if (typeof puzzle.Themes === 'string') {
                    puzzle.Themes.split(/[\s,]+/).forEach(theme => {
                        if (theme) themesSet.add(theme);
                    });
                }
            });
            setAvailableThemes(['all', ...Array.from(themesSet).sort()]);
        }
    }, [puzzles]);

    // Handle filter changes
    const handleFilterChange = () => {
        if (onFilterChange) {
            onFilterChange({
                minRating,
                maxRating,
                theme: selectedTheme === 'all' ? null : selectedTheme
            });
        }
    };

    // Handle random puzzle selection
    const handleRandomPuzzle = () => {
        if (puzzles.length === 0) return;

        let filteredPuzzles = puzzles.filter(
            p => p.Rating >= minRating && p.Rating <= maxRating
        );

        if (selectedTheme !== 'all') {
            filteredPuzzles = filteredPuzzles.filter(p => {
                if (Array.isArray(p.Themes)) {
                    return p.Themes.includes(selectedTheme);
                }
                if (typeof p.Themes === 'string') {
                    return p.Themes.toLowerCase().includes(selectedTheme.toLowerCase());
                }
                return false;
            });
        }

        if (filteredPuzzles.length > 0) {
            const randomPuzzle = filteredPuzzles[Math.floor(Math.random() * filteredPuzzles.length)];
            if (onPuzzleSelect) {
                onPuzzleSelect(randomPuzzle);
            }
        }
    };

    return (
        <div className="puzzle-selector bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-2 mb-2">
            <div
                className="flex items-center justify-between cursor-pointer p-1"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <h3 className="text-sm font-semibold text-gray-200">Puzzle Filters</h3>
                {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
            </div>

            {isExpanded && (
                <div className="mt-2 space-y-3">
                    {/* Rating Range */}
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">
                            Rating: {minRating} - {maxRating}
                        </label>
                        <div className="flex gap-2 items-center">
                            <div className="flex-1">
                                <input
                                    type="range"
                                    min="400"
                                    max="2800"
                                    step="100"
                                    value={minRating}
                                    onChange={(e) => setMinRating(parseInt(e.target.value))}
                                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                            <div className="flex-1">
                                <input
                                    type="range"
                                    min="400"
                                    max="2800"
                                    step="100"
                                    value={maxRating}
                                    onChange={(e) => setMaxRating(parseInt(e.target.value))}
                                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Theme Selection */}
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">
                            Theme
                        </label>
                        <select
                            value={selectedTheme}
                            onChange={(e) => setSelectedTheme(e.target.value)}
                            className="w-full px-2 py-1 text-xs bg-gray-900 border border-gray-700 rounded text-gray-200 focus:outline-none focus:border-blue-500"
                        >
                            {availableThemes.map(theme => (
                                <option key={theme} value={theme}>
                                    {theme === 'all' ? 'All Themes' : theme}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                        <button
                            onClick={handleFilterChange}
                            disabled={loading}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-1 px-2 rounded text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? '...' : 'Apply'}
                        </button>
                        <button
                            onClick={handleRandomPuzzle}
                            disabled={loading || puzzles.length === 0}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-1 px-2 rounded text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Random
                        </button>
                    </div>

                    {/* Statistics */}
                    {puzzles.length > 0 && (
                        <div className="pt-2 border-t border-gray-700">
                            <p className="text-[10px] text-gray-500 text-center">
                                {puzzles.length} puzzles available
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

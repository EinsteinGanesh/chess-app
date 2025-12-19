import { useState, useEffect, useCallback } from 'react';
import { getAllPuzzles, getPuzzlesByRating, getPuzzlesByTheme, getRandomPuzzle } from '../config/firebase';

/**
 * Custom hook for managing chess puzzles from Firebase
 * Includes caching, filtering, and loading states
 */
export function usePuzzles() {
    const [puzzles, setPuzzles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [cachedPuzzles, setCachedPuzzles] = useState(null);

    // Load puzzles from cache or Firebase
    const loadPuzzles = useCallback(async (forceRefresh = false) => {
        // Check cache first
        if (!forceRefresh && cachedPuzzles) {
            setPuzzles(cachedPuzzles);
            return cachedPuzzles;
        }

        // Check localStorage cache
        if (!forceRefresh) {
            const cached = localStorage.getItem('chess_puzzles_cache');
            const cacheTime = localStorage.getItem('chess_puzzles_cache_time');

            // Cache valid for 24 hours
            if (cached && cacheTime) {
                const age = Date.now() - parseInt(cacheTime);
                if (age < 24 * 60 * 60 * 1000) {
                    const parsedPuzzles = JSON.parse(cached);
                    setPuzzles(parsedPuzzles);
                    setCachedPuzzles(parsedPuzzles);
                    console.log('✅ Loaded puzzles from cache');
                    return parsedPuzzles;
                }
            }
        }

        // Fetch from Firebase
        setLoading(true);
        setError(null);

        try {
            console.log('📥 Fetching puzzles from Firebase...');
            const fetchedPuzzles = await getAllPuzzles();

            // Cache in state and localStorage
            setPuzzles(fetchedPuzzles);
            setCachedPuzzles(fetchedPuzzles);
            localStorage.setItem('chess_puzzles_cache', JSON.stringify(fetchedPuzzles));
            localStorage.setItem('chess_puzzles_cache_time', Date.now().toString());

            console.log(`✅ Loaded ${fetchedPuzzles.length} puzzles from Firebase`);
            setLoading(false);
            return fetchedPuzzles;
        } catch (err) {
            console.error('❌ Error loading puzzles:', err);
            setError(err.message);
            setLoading(false);

            // Fallback to local puzzles.json if Firebase fails
            try {
                const response = await fetch('/src/data/puzzles.json');
                const localPuzzles = await response.json();
                setPuzzles(localPuzzles);
                console.log('⚠️  Loaded fallback local puzzles');
                return localPuzzles;
            } catch (fallbackErr) {
                console.error('❌ Fallback also failed:', fallbackErr);
                return [];
            }
        }
    }, [cachedPuzzles]);

    // Filter puzzles by rating range
    const filterByRating = useCallback(async (minRating, maxRating) => {
        setLoading(true);
        setError(null);

        try {
            // Try to filter from cache first
            if (cachedPuzzles && cachedPuzzles.length > 0) {
                const filtered = cachedPuzzles.filter(
                    p => p.Rating >= minRating && p.Rating <= maxRating
                );
                setPuzzles(filtered);
                setLoading(false);
                return filtered;
            }

            // Otherwise fetch from Firebase
            const filtered = await getPuzzlesByRating(minRating, maxRating, 100);
            setPuzzles(filtered);
            setLoading(false);
            return filtered;
        } catch (err) {
            setError(err.message);
            setLoading(false);
            return [];
        }
    }, [cachedPuzzles]);

    // Filter puzzles by theme
    const filterByTheme = useCallback(async (theme) => {
        setLoading(true);
        setError(null);

        try {
            // Try to filter from cache first
            if (cachedPuzzles && cachedPuzzles.length > 0) {
                const filtered = cachedPuzzles.filter(p => {
                    if (Array.isArray(p.Themes)) {
                        return p.Themes.includes(theme);
                    }
                    if (typeof p.Themes === 'string') {
                        return p.Themes.toLowerCase().includes(theme.toLowerCase());
                    }
                    return false;
                });
                setPuzzles(filtered);
                setLoading(false);
                return filtered;
            }

            // Otherwise fetch from Firebase
            const filtered = await getPuzzlesByTheme(theme, 100);
            setPuzzles(filtered);
            setLoading(false);
            return filtered;
        } catch (err) {
            setError(err.message);
            setLoading(false);
            return [];
        }
    }, [cachedPuzzles]);

    // Get a random puzzle
    const getRandomPuzzleFromSet = useCallback(async (minRating = 0, maxRating = 3000) => {
        try {
            // Use cached puzzles if available
            if (cachedPuzzles && cachedPuzzles.length > 0) {
                const filtered = cachedPuzzles.filter(
                    p => p.Rating >= minRating && p.Rating <= maxRating
                );
                if (filtered.length > 0) {
                    return filtered[Math.floor(Math.random() * filtered.length)];
                }
            }

            // Otherwise fetch from Firebase
            return await getRandomPuzzle(minRating, maxRating);
        } catch (err) {
            setError(err.message);
            return null;
        }
    }, [cachedPuzzles]);

    // Clear cache
    const clearCache = useCallback(() => {
        localStorage.removeItem('chess_puzzles_cache');
        localStorage.removeItem('chess_puzzles_cache_time');
        setCachedPuzzles(null);
        console.log('🗑️  Cache cleared');
    }, []);

    // Auto-load on mount
    useEffect(() => {
        loadPuzzles();
    }, []);

    return {
        puzzles,
        loading,
        error,
        loadPuzzles,
        filterByRating,
        filterByTheme,
        getRandomPuzzle: getRandomPuzzleFromSet,
        clearCache,
        hasCachedData: !!cachedPuzzles
    };
}

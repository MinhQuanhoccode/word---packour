import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, collection } from 'firebase/firestore';
import { Users, Copy, Play, Loader, Trophy, AlertTriangle, KeySquare, HelpCircle, LogOut } from 'lucide-react';

// --- FIREBASE INITIALIZATION ---
// MUST BE OUTSIDE COMPONENT TO PREVENT RE-INITIALIZATION
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
    // Fallback dummy config for local testing if needed, though it will fail without real credentials
    apiKey: "dummy", authDomain: "dummy", projectId: "dummy"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'word-runner-app';

// Helper to get the correct collection path
const getRoomsRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'game_rooms');
const getRoomDoc = (roomId) => doc(db, 'artifacts', appId, 'public', 'data', 'game_rooms', roomId);

// --- GAME CONSTANTS ---
const MAP_WIDTH = 15;
const MAP_HEIGHT = 15;
const MAP_TEMPLATE = [
    "WWWWWWWWWWWWWWW",
    "W.T.......T...W",
    "W.WWWWW.WWWWW.W",
    "W...W.....W...W",
    "W.W.W.T.T.W.W.W",
    "W.W.WWWWWWW.W.W",
    "W.............W",
    "W.WWWW.T.WWWW.W",
    "W.............W",
    "W.W.WWWWWWW.W.W",
    "W.W.W.....W.W.W",
    "W...W.T.T.W...W",
    "W.WWWWW.WWWWW.W",
    "W...T.....T...W",
    "WWWWWWWWWWWWWWW"
];

const SYSTEM_WORDS = [
    { word: "REACT", theme: "Programming" },
    { word: "OCEAN", theme: "Nature" },
    { word: "TIGER", theme: "Animals" },
    { word: "PIZZA", theme: "Food" },
    { word: "ROBOT", theme: "Technology" },
    { word: "MAGIC", theme: "Fantasy" },
    { word: "SPACE", theme: "Science" },
    { word: "GUITAR", theme: "Music" }
];

const MAX_GUESSES = 3;

// --- UTILITY FUNCTIONS ---
const generateId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

const isWall = (x, y) => {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return true;
    return MAP_TEMPLATE[y][x] === 'W';
};

const isTrap = (x, y) => {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return false;
    return MAP_TEMPLATE[y][x] === 'T';
};

const getEmptyTiles = () => {
    const tiles = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
            if (MAP_TEMPLATE[y][x] === '.') tiles.push({ x, y });
        }
    }
    return tiles;
};

export default function App() {
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [roomId, setRoomId] = useState('');
    const [room, setRoom] = useState(null);
    const [joinInput, setJoinInput] = useState('');
    const [setupWord, setSetupWord] = useState('');
    const [guessInput, setGuessInput] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [playerName, setPlayerName] = useState('Player ' + Math.floor(Math.random() * 1000));

    // --- AUTHENTICATION ---
    useEffect(() => {
        const initAuth = async () => {
            try {
                if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                    await signInWithCustomToken(auth, __initial_auth_token);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (err) {
                console.error("Auth error:", err);
                setErrorMsg("Failed to authenticate.");
            } finally {
                setAuthLoading(false);
            }
        };
        initAuth();

        const unsubscribe = onAuthStateChanged(auth, (u) => {
            setUser(u);
        });
        return () => unsubscribe();
    }, []);

    // --- ROOM LISTENER ---
    useEffect(() => {
        if (!user || !roomId) {
            setRoom(null);
            return;
        }

        const roomRef = getRoomDoc(roomId);
        const unsubscribe = onSnapshot(roomRef, (docSnap) => {
            if (docSnap.exists()) {
                setRoom(docSnap.data());
            } else {
                setErrorMsg("Room closed or does not exist.");
                setRoomId('');
            }
        }, (err) => {
            console.error("Room listener error:", err);
            setErrorMsg("Failed to sync room data.");
        });

        return () => unsubscribe();
    }, [user, roomId]);

    // --- GAME ACTIONS ---
    const createRoom = async (mode) => {
        if (!user) return;
        const newRoomId = generateId();
        const roomRef = getRoomDoc(newRoomId);

        const initialRoomState = {
            id: newRoomId,
            status: 'lobby',
            mode: mode,
            hostId: user.uid,
            guestId: null,
            word: '',
            theme: '',
            letters: [],
            players: {
                [user.uid]: {
                    id: user.uid,
                    name: playerName,
                    x: 1, y: 1,
                    startX: 1, startY: 1,
                    color: 'blue',
                    guesses: MAX_GUESSES,
                    isReady: true
                }
            },
            winnerId: null,
            log: ['Room created. Waiting for opponent...']
        };

        try {
            await setDoc(roomRef, initialRoomState);
            setRoomId(newRoomId);
            setErrorMsg('');
        } catch (err) {
            console.error(err);
            setErrorMsg("Failed to create room.");
        }
    };

    const joinRoom = async (e) => {
        e?.preventDefault();
        if (!user || !joinInput.trim()) return;

        const roomRef = getRoomDoc(joinInput.toUpperCase());
        try {
            const docSnap = await getDoc(roomRef);
            if (docSnap.exists()) {
                const roomData = docSnap.data();
                if (roomData.status !== 'lobby') {
                    setErrorMsg("Game already started or finished.");
                    return;
                }
                if (roomData.guestId && roomData.guestId !== user.uid) {
                    setErrorMsg("Room is full.");
                    return;
                }

                // Add self to room
                await updateDoc(roomRef, {
                    guestId: user.uid,
                    status: 'setup', // Move to setup phase once guest joins
                    [`players.${user.uid}`]: {
                        id: user.uid,
                        name: playerName,
                        x: MAP_WIDTH - 2, y: MAP_HEIGHT - 2,
                        startX: MAP_WIDTH - 2, startY: MAP_HEIGHT - 2,
                        color: 'green',
                        guesses: MAX_GUESSES,
                        isReady: true
                    },
                    log: [...roomData.log, `${playerName} joined.`]
                });
                setRoomId(joinInput.toUpperCase());
                setErrorMsg('');
            } else {
                setErrorMsg("Room not found.");
            }
        } catch (err) {
            console.error(err);
            setErrorMsg("Failed to join room.");
        }
    };

    const leaveRoom = async () => {
        setRoomId('');
        setRoom(null);
    };

    const startGameWithWord = async (selectedWord, selectedTheme = "Custom") => {
        if (!user || !room) return;
        if (selectedWord.length < 3 || selectedWord.length > 8) {
            setErrorMsg("Word must be 3-8 characters long.");
            return;
        }

        const emptyTiles = getEmptyTiles();
        // Shuffle tiles
        for (let i = emptyTiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [emptyTiles[i], emptyTiles[j]] = [emptyTiles[j], emptyTiles[i]];
        }

        const wordUpper = selectedWord.toUpperCase();
        const newLetters = wordUpper.split('').map((char, index) => ({
            id: `letter_${index}`,
            char: char,
            x: emptyTiles[index].x,
            y: emptyTiles[index].y,
            collectedBy: null
        }));

        const roomRef = getRoomDoc(room.id);
        try {
            await updateDoc(roomRef, {
                status: 'playing',
                word: wordUpper,
                theme: selectedTheme,
                letters: newLetters,
                log: [...room.log, "Game started! Find the letters and guess the word."]
            });
            setErrorMsg('');
        } catch (err) {
            console.error(err);
            setErrorMsg("Failed to start game.");
        }
    };

    const handleSystemWordStart = async () => {
        const randomChoice = SYSTEM_WORDS[Math.floor(Math.random() * SYSTEM_WORDS.length)];
        startGameWithWord(randomChoice.word, randomChoice.theme);
    };

    const movePlayer = async (dx, dy) => {
        if (!user || !room || room.status !== 'playing') return;

        // In Mode 1 (Player Word), Host does not move.
        if (room.mode === 'playerWord' && user.uid === room.hostId) return;

        const me = room.players[user.uid];
        if (!me || me.guesses <= 0) return; // Can't move if dead

        const nx = me.x + dx;
        const ny = me.y + dy;

        if (isWall(nx, ny)) return;

        const roomRef = getRoomDoc(room.id);
        let updates = {};
        let newLog = [...room.log];
        let remainingGuesses = me.guesses;
        let finalX = nx;
        let finalY = ny;

        if (isTrap(nx, ny)) {
            remainingGuesses -= 1;
            finalX = me.startX;
            finalY = me.startY;
            newLog.push(`${me.name} hit a trap! Guesses left: ${remainingGuesses}`);
            if (remainingGuesses <= 0) {
                newLog.push(`${me.name} has been eliminated!`);
            }
        }

        updates[`players.${user.uid}.x`] = finalX;
        updates[`players.${user.uid}.y`] = finalY;
        updates[`players.${user.uid}.guesses`] = remainingGuesses;

        // Check letter collection
        const updatedLetters = [...room.letters];
        let collectedAny = false;
        updatedLetters.forEach(letter => {
            if (letter.x === finalX && letter.y === finalY && !letter.collectedBy) {
                letter.collectedBy = user.uid;
                collectedAny = true;
                // Don't spam log for every letter, maybe just visual
            }
        });

        if (collectedAny) {
            updates.letters = updatedLetters;
        }

        // Check if both players eliminated
        const otherPlayerId = user.uid === room.hostId ? room.guestId : room.hostId;
        const otherPlayer = room.players[otherPlayerId];
        if (remainingGuesses <= 0 && (!otherPlayer || otherPlayer.guesses <= 0 || (room.mode === 'playerWord' && user.uid !== room.hostId))) {
             updates.status = 'finished';
             newLog.push("Game Over! No one guessed the word.");
        }

        if (newLog.length > room.log.length) {
            updates.log = newLog.slice(-5); // Keep last 5 logs
        }

        try {
            await updateDoc(roomRef, updates);
        } catch (err) {
            console.error("Move error:", err);
        }
    };

    // Keyboard handling
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (document.activeElement.tagName === 'INPUT') return; // Don't move if typing
            switch (e.key) {
                case 'ArrowUp':
                case 'w':
                case 'W': movePlayer(0, -1); break;
                case 'ArrowDown':
                case 's':
                case 'S': movePlayer(0, 1); break;
                case 'ArrowLeft':
                case 'a':
                case 'A': movePlayer(-1, 0); break;
                case 'ArrowRight':
                case 'd':
                case 'D': movePlayer(1, 0); break;
                default: break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [user, room]);

    const submitGuess = async (e) => {
        e.preventDefault();
        if (!user || !room || room.status !== 'playing' || !guessInput.trim()) return;
        const me = room.players[user.uid];
        if (!me || me.guesses <= 0) return;

        const guess = guessInput.trim().toUpperCase();
        setGuessInput('');
        const roomRef = getRoomDoc(room.id);
        
        let updates = {};
        let newLog = [...room.log];
        let remainingGuesses = me.guesses - 1;

        if (guess === room.word) {
            updates.status = 'finished';
            updates.winnerId = user.uid;
            newLog.push(`${me.name} guessed correctly! The word was ${room.word}.`);
        } else {
            updates[`players.${user.uid}.guesses`] = remainingGuesses;
            newLog.push(`${me.name} guessed incorrectly. Guesses left: ${remainingGuesses}`);
            
            // Check elimination
            if (remainingGuesses <= 0) {
                 newLog.push(`${me.name} is out of guesses!`);
                 const otherPlayerId = user.uid === room.hostId ? room.guestId : room.hostId;
                 const otherPlayer = room.players[otherPlayerId];
                 
                 if (room.mode === 'playerWord') {
                     // In mode 1, if guest loses, game over.
                     updates.status = 'finished';
                     updates.winnerId = room.hostId; // Host wins if guest fails
                     newLog.push(`Host ${room.players[room.hostId].name} wins!`);
                 } else if (room.mode === 'systemWord') {
                     if (!otherPlayer || otherPlayer.guesses <= 0) {
                         updates.status = 'finished';
                         newLog.push("Game Over! Both players failed.");
                     }
                 }
            }
        }
        
        updates.log = newLog.slice(-5);
        try {
            await updateDoc(roomRef, updates);
        } catch (err) {
            console.error("Guess error:", err);
        }
    };


    // --- RENDERING ---

    if (authLoading) {
        return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white font-mono"><Loader className="animate-spin mr-2" /> Connecting...</div>;
    }

    if (!room) {
        // LOBBY VIEW
        return (
            <div className="min-h-screen bg-slate-900 text-slate-100 font-mono p-4 sm:p-8 flex flex-col items-center">
                <div className="w-full max-w-md bg-slate-800 rounded-xl shadow-2xl overflow-hidden border border-slate-700">
                    <div className="bg-indigo-600 p-6 text-center">
                        <h1 className="text-3xl font-black tracking-wider text-white mb-2 shadow-black/50 drop-shadow-md">MAZE WORD RUNNER</h1>
                        <p className="text-indigo-200 text-sm">Collect letters, dodge traps, guess the word.</p>
                    </div>

                    <div className="p-6 space-y-6">
                        {errorMsg && <div className="bg-red-900/50 border border-red-500 text-red-200 p-3 rounded-lg text-sm flex items-center"><AlertTriangle size={16} className="mr-2"/> {errorMsg}</div>}
                        
                        <div>
                            <label className="block text-xs text-slate-400 mb-1 uppercase tracking-wider">Your Name</label>
                            <input 
                                type="text" 
                                value={playerName} 
                                onChange={(e) => setPlayerName(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                                maxLength={12}
                            />
                        </div>

                        <div className="pt-4 border-t border-slate-700 space-y-3">
                            <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-2">Create New Game</h3>
                            <button onClick={() => createRoom('playerWord')} className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-3 font-bold transition-all transform active:scale-95 flex items-center justify-center">
                                <Users size={18} className="mr-2" /> Host: Custom Word Mode
                            </button>
                            <button onClick={() => createRoom('systemWord')} className="w-full bg-purple-600 hover:bg-purple-500 text-white rounded-lg px-4 py-3 font-bold transition-all transform active:scale-95 flex items-center justify-center">
                                <Play size={18} className="mr-2" /> Host: System Word Mode
                            </button>
                        </div>

                        <div className="pt-4 border-t border-slate-700">
                            <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-2">Join Existing Game</h3>
                            <form onSubmit={joinRoom} className="flex gap-2">
                                <input 
                                    type="text" 
                                    placeholder="ENTER ROOM ID" 
                                    value={joinInput}
                                    onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                                    className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-bold tracking-widest uppercase"
                                    maxLength={6}
                                />
                                <button type="submit" className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-4 py-2 font-bold transition-colors">
                                    Join
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // GAME VIEWS
    const isHost = user.uid === room.hostId;
    const me = room.players[user.uid];
    const opponent = Object.values(room.players).find(p => p.id !== user.uid);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 font-mono flex flex-col items-center p-2 sm:p-4">
            
            {/* Header */}
            <div className="w-full max-w-4xl flex justify-between items-center mb-4 bg-slate-900 p-3 rounded-lg border border-slate-800">
                <div className="flex items-center gap-3">
                    <div className="text-xs text-slate-400">ROOM ID</div>
                    <div className="bg-slate-950 px-3 py-1 rounded border border-slate-700 font-bold tracking-widest flex items-center gap-2">
                        {room.id}
                        <button onClick={() => navigator.clipboard.writeText(room.id)} className="text-slate-400 hover:text-white" title="Copy Room ID">
                            <Copy size={14} />
                        </button>
                    </div>
                </div>
                <button onClick={leaveRoom} className="text-slate-400 hover:text-red-400 flex items-center gap-1 text-sm">
                    <LogOut size={16} /> Leave
                </button>
            </div>

            {errorMsg && <div className="mb-4 bg-red-900/50 border border-red-500 text-red-200 p-2 rounded w-full max-w-4xl text-center text-sm">{errorMsg}</div>}

            {/* Content Area based on Status */}
            <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1">
                
                {/* Left/Main Column - Game Board or Setup */}
                <div className="lg:col-span-2 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden flex flex-col items-center justify-center relative shadow-2xl p-4">
                    
                    {room.status === 'lobby' && (
                        <div className="text-center space-y-6">
                            <Loader className="animate-spin mx-auto text-indigo-500" size={48} />
                            <div>
                                <h2 className="text-2xl font-bold mb-2">Waiting for opponent...</h2>
                                <p className="text-slate-400">Share your Room ID to invite a friend.</p>
                            </div>
                        </div>
                    )}

                    {room.status === 'setup' && (
                        <div className="text-center w-full max-w-sm">
                            {room.mode === 'playerWord' && isHost ? (
                                <div className="space-y-4">
                                    <KeySquare size={48} className="mx-auto text-blue-500 mb-4" />
                                    <h2 className="text-xl font-bold text-white">Enter a Secret Word</h2>
                                    <p className="text-sm text-slate-400">Your opponent will try to guess it.</p>
                                    <input 
                                        type="text" 
                                        value={setupWord}
                                        onChange={(e) => setSetupWord(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                                        maxLength={8}
                                        className="w-full bg-slate-950 border-2 border-blue-500/50 focus:border-blue-500 rounded-lg px-4 py-3 text-center text-2xl font-black tracking-widest text-white outline-none"
                                        placeholder="3-8 LETTERS"
                                    />
                                    <button 
                                        onClick={() => startGameWithWord(setupWord)}
                                        disabled={setupWord.length < 3}
                                        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors"
                                    >
                                        Start Game
                                    </button>
                                </div>
                            ) : room.mode === 'systemWord' && isHost ? (
                                <div className="space-y-6">
                                    <Play size={48} className="mx-auto text-purple-500 mb-4" />
                                    <h2 className="text-xl font-bold text-white">System Word Mode</h2>
                                    <p className="text-sm text-slate-400">Both players will navigate and guess.</p>
                                    <button 
                                        onClick={handleSystemWordStart}
                                        className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-lg transition-colors"
                                    >
                                        Start Game
                                    </button>
                                </div>
                            ) : (
                                <div>
                                    <Loader className="animate-spin mx-auto text-indigo-500 mb-4" size={32} />
                                    <h2 className="text-xl font-bold">Host is setting up...</h2>
                                </div>
                            )}
                        </div>
                    )}

                    {(room.status === 'playing' || room.status === 'finished') && (
                        <div className="w-full flex flex-col items-center">
                            {/* Game Grid */}
                            <div className="relative bg-slate-950 p-2 rounded border border-slate-700 shadow-inner" style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(${MAP_WIDTH}, minmax(15px, 1fr))`,
                                gap: '2px',
                                maxWidth: '100%',
                                aspectRatio: '1/1'
                            }}>
                                {MAP_TEMPLATE.map((row, y) => 
                                    row.split('').map((cell, x) => {
                                        const isW = cell === 'W';
                                        const isT = cell === 'T';
                                        return (
                                            <div key={`${x}-${y}`} className={`
                                                relative w-full h-full aspect-square rounded-[2px]
                                                ${isW ? 'bg-slate-700 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]' : 
                                                  isT ? 'bg-red-950/80 border border-red-900 shadow-[inset_0_0_8px_rgba(255,0,0,0.2)]' : 
                                                  'bg-slate-900 border border-slate-800/50'}
                                            `}>
                                                {/* Trap Icon */}
                                                {isT && <AlertTriangle size="50%" className="absolute top-1/4 left-1/4 text-red-700/50" />}
                                                
                                                {/* Letters */}
                                                {room.letters.map(l => (
                                                    l.x === x && l.y === y && !l.collectedBy && (
                                                        <div key={l.id} className="absolute inset-0 flex items-center justify-center">
                                                            <div className="text-yellow-400 font-bold drop-shadow-[0_0_5px_rgba(234,179,8,0.8)] text-sm sm:text-base animate-pulse">
                                                                {l.char}
                                                            </div>
                                                        </div>
                                                    )
                                                ))}

                                                {/* Players */}
                                                {Object.values(room.players).map(p => (
                                                    p.x === x && p.y === y && p.guesses > 0 && (
                                                        <div key={p.id} className="absolute inset-[15%] rounded-full shadow-[0_0_10px_currentColor] flex items-center justify-center"
                                                             style={{ 
                                                                 backgroundColor: p.color === 'blue' ? '#3b82f6' : '#10b981',
                                                                 color: p.color === 'blue' ? '#93c5fd' : '#6ee7b7',
                                                                 zIndex: 10
                                                             }}>
                                                        </div>
                                                    )
                                                ))}
                                            </div>
                                        )
                                    })
                                )}
                                
                                {/* Game Over Overlay */}
                                {room.status === 'finished' && (
                                    <div className="absolute inset-0 z-20 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center border border-slate-700 rounded">
                                        <Trophy size={64} className={`mb-4 ${room.winnerId ? 'text-yellow-400' : 'text-slate-500'}`} />
                                        <h2 className="text-3xl font-black text-white mb-2">GAME OVER</h2>
                                        <p className="text-xl mb-4 text-slate-300">
                                            {room.winnerId ? `${room.players[room.winnerId]?.name} won!` : 'Nobody won.'}
                                        </p>
                                        <p className="text-lg text-indigo-300 mb-6">The word was: <span className="font-bold text-white tracking-widest">{room.word}</span></p>
                                        <button onClick={leaveRoom} className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded-lg font-bold">
                                            Back to Lobby
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Mobile Controls (Visible mostly on small screens, functional everywhere) */}
                            {room.status === 'playing' && !(room.mode === 'playerWord' && isHost) && me?.guesses > 0 && (
                                <div className="mt-6 grid grid-cols-3 gap-2 w-48 sm:hidden">
                                    <div />
                                    <button onClick={(e)=>{e.target.blur(); movePlayer(0, -1)}} className="bg-slate-800 p-3 rounded shadow active:bg-slate-700 flex justify-center border border-slate-700">▲</button>
                                    <div />
                                    <button onClick={(e)=>{e.target.blur(); movePlayer(-1, 0)}} className="bg-slate-800 p-3 rounded shadow active:bg-slate-700 flex justify-center border border-slate-700">◀</button>
                                    <button onClick={(e)=>{e.target.blur(); movePlayer(0, 1)}} className="bg-slate-800 p-3 rounded shadow active:bg-slate-700 flex justify-center border border-slate-700">▼</button>
                                    <button onClick={(e)=>{e.target.blur(); movePlayer(1, 0)}} className="bg-slate-800 p-3 rounded shadow active:bg-slate-700 flex justify-center border border-slate-700">▶</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right Column - Stats & Interaction */}
                <div className="lg:col-span-1 space-y-4 flex flex-col">
                    
                    {/* Game Info Panel */}
                    {(room.status === 'playing' || room.status === 'finished') && (
                        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex-1">
                            <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">Game Status</h3>
                            
                            {room.theme && (
                                <div className="mb-4 bg-slate-950 p-2 rounded text-center border border-slate-800">
                                    <span className="text-xs text-slate-500 block uppercase">Theme</span>
                                    <span className="text-indigo-400 font-bold">{room.theme}</span>
                                </div>
                            )}

                            {/* Players List */}
                            <div className="space-y-3 mb-6">
                                {Object.values(room.players).map(p => (
                                    <div key={p.id} className={`flex items-center justify-between p-2 rounded border ${p.id === user.uid ? 'border-slate-600 bg-slate-800' : 'border-slate-800 bg-slate-900/50'} ${p.guesses <= 0 ? 'opacity-50' : ''}`}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color === 'blue' ? '#3b82f6' : '#10b981' }}></div>
                                            <span className="font-bold truncate max-w-[100px]">{p.name} {p.id === user.uid && '(You)'}</span>
                                        </div>
                                        <div className="text-sm">
                                            <span className={p.guesses > 0 ? 'text-green-400' : 'text-red-500'}>
                                                {p.guesses} lives
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* My Collected Letters */}
                            <div className="mb-6">
                                <h4 className="text-xs text-slate-400 uppercase tracking-wider mb-2">My Letters</h4>
                                <div className="flex flex-wrap gap-2 min-h-[40px] p-2 bg-slate-950 rounded border border-slate-800">
                                    {room.letters.filter(l => l.collectedBy === user.uid).length === 0 && <span className="text-slate-600 text-sm italic my-auto">None yet...</span>}
                                    {room.letters.filter(l => l.collectedBy === user.uid).map(l => (
                                        <div key={l.id} className="w-8 h-8 bg-yellow-900/50 border border-yellow-600 rounded flex items-center justify-center text-yellow-400 font-bold shadow-inner">
                                            {l.char}
                                        </div>
                                    ))}
                                </div>
                                <div className="text-xs text-slate-500 mt-1 text-right">
                                    Word length: {room.word.length} letters
                                </div>
                            </div>

                            {/* Guess Input */}
                            {room.status === 'playing' && me?.guesses > 0 && !(room.mode === 'playerWord' && isHost) && (
                                <form onSubmit={submitGuess} className="mt-auto">
                                    <h4 className="text-xs text-slate-400 uppercase tracking-wider mb-2">Make a Guess</h4>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text"
                                            value={guessInput}
                                            onChange={(e) => setGuessInput(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                                            className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-bold tracking-widest outline-none focus:border-indigo-500"
                                            placeholder="WORD..."
                                            maxLength={room.word.length}
                                        />
                                        <button type="submit" disabled={!guessInput || guessInput.length !== room.word.length} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 rounded font-bold transition-colors">
                                            Guess
                                        </button>
                                    </div>
                                    {guessInput.length > 0 && guessInput.length !== room.word.length && (
                                        <p className="text-xs text-orange-400 mt-1">Must be exactly {room.word.length} letters.</p>
                                    )}
                                </form>
                            )}

                            {/* Host waiting view */}
                            {room.status === 'playing' && room.mode === 'playerWord' && isHost && (
                                <div className="mt-auto bg-blue-900/30 border border-blue-800 p-4 rounded text-center">
                                    <HelpCircle className="mx-auto text-blue-400 mb-2" />
                                    <p className="text-sm text-blue-200">You are the Host. Watch your opponent try to guess your word!</p>
                                    <p className="text-lg font-bold tracking-widest text-white mt-2">{room.word}</p>
                                </div>
                            )}

                        </div>
                    )}

                    {/* Activity Log */}
                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 h-48 flex flex-col">
                        <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-2 border-b border-slate-800 pb-2">Activity Log</h3>
                        <div className="flex-1 overflow-y-auto space-y-2 text-sm font-sans flex flex-col-reverse">
                            {[...room.log].reverse().map((msg, idx) => (
                                <div key={idx} className="text-slate-300 border-l-2 border-indigo-500 pl-2">
                                    {msg}
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
            
            {/* Instructions */}
            <div className="w-full max-w-4xl mt-4 text-center text-xs text-slate-500">
                Use WASD or Arrow Keys to move. Desktop recommended. Stepping on red traps resets position and costs 1 life.
            </div>
        </div>
    );
}
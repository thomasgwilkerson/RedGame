import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';

const socket = io("https://red-game-production.up.railway.app");

export default function App() {
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [inGame, setInGame] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [myRole, setMyRole] = useState(null);
  const [revealedCard, setRevealedCard] = useState(null);
  const [revealedPair, setRevealedPair] = useState(null); 
  const [discardStealing, setDiscardStealing] = useState(false);
  const [selectedCards, setSelectedCards] = useState([]);
  const [isUsingPower, setIsUsingPower] = useState(false);
  const [mismatchTrigger, setMismatchTrigger] = useState(false);

  useEffect(() => {
    socket.on('playerAssigned', (data) => {
        setMyRole(data.role);
    });

    socket.on('startGame', (data) => {
        setGameState(data);
        setInGame(true);
    });

    socket.on('gameStateUpdate', (data) => { 
        // Trigger shake if hand size increased (the punishment trigger)
        if (gameState && myRole && data.hands[myRole]?.length > gameState.hands[myRole]?.length) {
            setMismatchTrigger(true);
            setTimeout(() => setMismatchTrigger(false), 600);
        }
        setGameState(data);
        if (!data.drawnCard) {
            setIsUsingPower(false); 
            setSelectedCards([]);
        }
    });

    socket.on('revealCard', (data) => {
      setRevealedCard(data.card);
      setTimeout(() => setRevealedCard(null), 4000); 
    });

    return () => {
      socket.off('playerAssigned');
      socket.off('startGame');
      socket.off('gameStateUpdate');
      socket.off('revealCard');
    };
  }, [gameState, myRole]);

  const handleJoin = () => {
    const trimmedName = playerName.trim();
    const trimmedCode = roomCode.trim();
    if (trimmedName !== '' && trimmedCode !== '') {
        socket.emit('joinRoom', { 
            roomCode: trimmedCode, 
            playerName: trimmedName, 
            options: { discardStealing } 
        });
    } else {
        alert("Enter your name and a room code!");
    }
  };

  const handleCardClick = (targetRole, index) => {
    if (!gameState || gameState.currentPlayer !== myRole || gameState.gameState === 'FINISHED') return;
    
    const ability = gameState.pendingAbility;

    if (isUsingPower && ability) {
        if ((ability === 'PEEK_SELF' && targetRole === myRole) || (ability === 'PEEK_OPPONENT' && targetRole !== myRole)) {
            socket.emit('useAbility', { roomCode, targetRole, cardIndex: index });
        } else if (ability === 'BLIND_SWAP' || ability === 'SPY_SWAP') {
            if (selectedCards.length === 1 && selectedCards[0].role === targetRole) {
                return; // Can't pick two from same hand
            }
            const newSelection = [...selectedCards, { role: targetRole, index }];
            if (newSelection.length === 2) {
                if (ability === 'SPY_SWAP') {
                    setRevealedPair([
                        gameState.hands[newSelection[0].role][newSelection[0].index],
                        gameState.hands[newSelection[1].role][newSelection[1].index]
                    ]);
                } else {
                    socket.emit('useAbility', { 
                        roomCode, 
                        targetRole: newSelection[0].role, cardIndex: newSelection[0].index,
                        secondTargetRole: newSelection[1].role, secondCardIndex: newSelection[1].index 
                    });
                }
                setSelectedCards(newSelection);
            } else {
                setSelectedCards(newSelection);
            }
        }
    } 
    else if (gameState.drawnCard && targetRole === myRole) {
      socket.emit('swapCard', { roomCode, cardIndex: index, role: myRole });
    }
  };

  const finalizeSpySwap = (confirm) => {
    socket.emit('useAbility', { 
        roomCode, 
        confirmSwap: confirm, 
        targetRole: selectedCards[0].role, cardIndex: selectedCards[0].index,
        secondTargetRole: selectedCards[1].role, secondCardIndex: selectedCards[1].index 
    });
    setRevealedPair(null);
    setSelectedCards([]);
  };

  const getCardImg = (card) => {
    if (!card) return '';
    const r = card.rank === '10' ? '0' : card.rank[0];
    const s = card.suit[0].toUpperCase();
    return `https://deckofcardsapi.com/static/img/${r}${s}.png`;
  };

  // --- LOBBY ---
  if (!inGame) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#121212', color: 'white', fontFamily: 'monospace' }}>
        <div style={{ padding: '50px', background: '#1e1e1e', borderRadius: '20px', border: '3px solid #873e23', textAlign: 'center', boxShadow: '0 0 30px rgba(0,0,0,0.5)' }}>
          <h1 style={{ color: '#873e23', letterSpacing: '4px', fontSize: '2.5rem' }}>RED GAME</h1>
          <div style={{ margin: '30px 0' }}>
            <input 
              placeholder="YOUR NAME" 
              value={playerName} 
              onChange={e => setPlayerName(e.target.value)} 
              style={{ display: 'block', margin: '10px auto', padding: '15px', background: '#2a2a2a', border: '1px solid #444', color: 'white', borderRadius: '8px', width: '250px', outline: 'none' }} 
            />
            <input 
              placeholder="ROOM CODE" 
              value={roomCode} 
              onChange={e => setRoomCode(e.target.value)} 
              style={{ display: 'block', margin: '10px auto', padding: '15px', background: '#2a2a2a', border: '1px solid #444', color: 'white', borderRadius: '8px', width: '250px', outline: 'none' }} 
            />
          </div>
          <div style={{ marginBottom: '30px' }}>
            <label style={{ color: '#888', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <input 
                type="checkbox" 
                checked={discardStealing} 
                onChange={e => setDiscardStealing(e.target.checked)} 
              />
              Enable Discard Stealing
            </label>
          </div>
          <button 
            onClick={handleJoin} 
            style={{ padding: '15px 40px', background: '#873e23', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold', borderRadius: '8px', fontSize: '1.1rem', transition: '0.3s' }}
          >
            {myRole ? "WAITING FOR PLAYER 2..." : "ENTER ROOM"}
          </button>
        </div>
      </div>
    );
  }

  // --- GAMEPLAY ---
  const oppRole = myRole === 'p1' ? 'p2' : 'p1';
  const isMyTurn = gameState.currentPlayer === myRole;
  const currentAbility = gameState.pendingAbility;
  const canSteal = isMyTurn && !gameState.drawnCard && gameState.options.discardStealing;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0a0a0a', color: 'white', fontFamily: 'sans-serif' }}>
      
      {/* SPY SWAP OVERLAY */}
      <AnimatePresence>
        {revealedPair && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 300, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <h2 style={{ color: 'gold', fontSize: '2rem', marginBottom: '30px' }}>SPY SWAP</h2>
            <div style={{ display: 'flex', gap: '50px', marginBottom: '40px' }}>
              {selectedCards.map((sel, idx) => (
                <div key={idx} style={{ textAlign: 'center' }}>
                  <p style={{ fontWeight: 'bold', color: sel.role === myRole ? '#4db8ff' : '#ff4d4d', marginBottom: '10px' }}>
                    {sel.role === myRole ? "YOUR CARD" : "OPPONENT'S CARD"}
                  </p>
                  <img src={getCardImg(revealedPair[idx])} style={{ width: '180px', border: '5px solid gold', borderRadius: '12px' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '30px' }}>
                <button onClick={() => finalizeSpySwap(true)} style={{ background: '#28a745', color: 'white', padding: '15px 40px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.2rem' }}>SWAP</button>
                <button onClick={() => finalizeSpySwap(false)} style={{ background: '#dc3545', color: 'white', padding: '15px 40px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.2rem' }}>CANCEL TURN</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SIDEBAR */}
      <div style={{ width: '280px', background: '#161616', padding: '25px', borderRight: '2px solid #333', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ color: '#873e23', textAlign: 'center', borderBottom: '1px solid #333', paddingBottom: '15px' }}>GAME STATUS</h2>
        
        <div style={{ marginTop: '20px', padding: '20px', background: '#222', borderRadius: '12px', borderLeft: `6px solid ${isMyTurn ? '#4db8ff' : '#444'}` }}>
            <p style={{ margin: 0, fontSize: '1.2rem', fontWeight: 'bold' }}>{playerName}</p>
            <p style={{ margin: '8px 0 0', color: isMyTurn ? '#4db8ff' : '#ff4d4d', fontWeight: 'bold', letterSpacing: '1px' }}>
                {isMyTurn ? "▶ YOUR ACTION" : "⌛ WAITING..."}
            </p>
        </div>
        
        {isMyTurn && gameState.drawnCard && (
            <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button onClick={() => socket.emit('discardDrawnCard', roomCode)} style={{ width: '100%', padding: '14px', background: '#333', color: 'white', border: '1px solid #555', cursor: 'pointer', borderRadius: '8px', fontWeight: 'bold' }}>
                    DISCARD DRAWN
                </button>
                {currentAbility && (
                    <button 
                        onClick={() => { setIsUsingPower(!isUsingPower); setSelectedCards([]); }} 
                        style={{ width: '100%', padding: '14px', background: isUsingPower ? 'gold' : '#873e23', color: isUsingPower ? 'black' : 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold', borderRadius: '8px' }}
                    >
                        {isUsingPower ? "STOP POWER" : `USE POWER: ${currentAbility.split('_')[0]}`}
                    </button>
                )}
            </div>
        )}

        <div style={{ marginTop: 'auto' }}>
            {isMyTurn && !gameState.drawnCard && !gameState.redCalledBy && (
              <button onClick={() => socket.emit('callRed', roomCode)} style={{ width: '100%', padding: '15px', background: '#ff4d4d', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold', borderRadius: '8px', fontSize: '1.1rem' }}>
                CALL RED
              </button>
            )}
            {gameState.redCalledBy && (
                <div style={{ padding: '15px', background: 'rgba(255, 215, 0, 0.1)', border: '2px solid gold', color: 'gold', textAlign: 'center', borderRadius: '8px', fontWeight: 'bold' }}>
                    ⚠️ FINAL ROUND
                </div>
            )}
        </div>
      </div>

      {/* GAME BOARD */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-around', background: 'radial-gradient(circle, #1a1a1a 0%, #000 100%)', padding: '30px' }}>
        
        {/* OPPONENT */}
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {gameState.hands[oppRole].map((c, i) => {
            const isSelected = selectedCards.some(s => s.role === oppRole && s.index === i);
            const isSelectable = isUsingPower && (currentAbility === 'PEEK_OPPONENT' || currentAbility === 'BLIND_SWAP' || currentAbility === 'SPY_SWAP');
            return (
              <motion.img layout key={c.id} onClick={() => handleCardClick(oppRole, i)} src="https://deckofcardsapi.com/static/img/back.png" 
                style={{ 
                    width: '95px', 
                    borderRadius: '10px', 
                    border: isSelected ? '4px solid #ff4d4d' : (isSelectable ? '3px solid gold' : '1px solid #333'),
                    cursor: 'pointer'
                }}
                animate={{ y: isSelected ? -15 : 0, boxShadow: isSelected ? '0 0 20px #ff4d4d' : 'none' }}
              />
            );
          })}
        </div>

        {/* PILES */}
        <div style={{ display: 'flex', gap: '80px', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <motion.img 
                whileHover={{ scale: 1.05 }} 
                onClick={() => isMyTurn && !gameState.drawnCard && socket.emit('drawCard', { roomCode, source: 'deck' })} 
                src="https://deckofcardsapi.com/static/img/back.png" 
                style={{ width: '120px', cursor: 'pointer', borderRadius: '8px', border: '1px solid #444' }} 
            />
            <p style={{ fontSize: '0.8rem', color: '#555', marginTop: '10px', letterSpacing: '2px' }}>DECK</p>
          </div>
          
          <AnimatePresence>
            {gameState.drawnCard && (
                <motion.div initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} style={{ textAlign: 'center' }}>
                    <img src={getCardImg(gameState.drawnCard)} style={{ width: '130px', border: '4px solid #4db8ff', borderRadius: '12px', boxShadow: '0 0 30px rgba(77, 184, 255, 0.4)' }} />
                    <p style={{ fontSize: '0.8rem', color: '#4db8ff', fontWeight: 'bold', marginTop: '10px' }}>DRAWN</p>
                </motion.div>
            )}
          </AnimatePresence>

          <div style={{ textAlign: 'center' }}>
            <motion.img 
                onClick={() => canSteal && socket.emit('drawCard', { roomCode, source: 'discard' })} 
                src={getCardImg(gameState.discardPile[gameState.discardPile.length - 1])} 
                style={{ 
                    width: '120px', 
                    border: canSteal ? '4px solid gold' : '1px solid #333', 
                    boxShadow: canSteal ? '0 0 20px gold' : 'none', 
                    cursor: canSteal ? 'pointer' : 'default', 
                    borderRadius: '8px' 
                }} 
            />
            <p style={{ fontSize: '0.8rem', color: canSteal ? 'gold' : '#555', marginTop: '10px', letterSpacing: '2px' }}>DISCARD</p>
          </div>
        </div>

        {/* PLAYER */}
        <motion.div 
            style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }} 
            animate={mismatchTrigger ? { x: [-12, 12, -12, 12, 0] } : {}}
            transition={{ duration: 0.5 }}
        >
          {gameState.hands[myRole].map((c, i) => {
            const isSelected = selectedCards.some(s => s.role === myRole && s.index === i);
            const isSelectable = (isMyTurn && gameState.drawnCard && !isUsingPower) || (isUsingPower && (currentAbility === 'PEEK_SELF' || currentAbility === 'BLIND_SWAP' || currentAbility === 'SPY_SWAP'));
            return (
              <motion.img layout key={c.id} onClick={() => handleCardClick(myRole, i)} src={c.faceUp ? getCardImg(c) : "https://deckofcardsapi.com/static/img/back.png"} 
                style={{ 
                    width: '140px', 
                    borderRadius: '12px', 
                    border: isSelected ? '5px solid #4db8ff' : (isSelectable ? '4px solid gold' : '2px solid #333'),
                    cursor: 'pointer'
                }}
                animate={{ y: isSelected ? -25 : 0, boxShadow: isSelected ? '0 0 30px #4db8ff' : 'none' }}
              />
            );
          })}
        </motion.div>
      </div>

      {/* PEEK VIEW */}
      <AnimatePresence>
        {revealedCard && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 400, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
                <img src={getCardImg(revealedCard)} style={{ width: '280px', border: '8px solid gold', borderRadius: '20px', boxShadow: '0 0 50px gold' }} />
                <h2 style={{ color: 'gold', marginTop: '30px', fontSize: '2rem', letterSpacing: '3px' }}>PEEKING...</h2>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
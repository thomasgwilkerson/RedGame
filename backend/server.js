import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

let rooms = {};

const createDeck = () => {
    const suits = ['hearts', 'diamonds', 'spades', 'clubs'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    let deck = [];
    suits.forEach(suit => {
        ranks.forEach(rank => {
            let value = (rank === 'A') ? 1 : (['J', 'Q', 'K'].includes(rank)) ? 10 : parseInt(rank);
            if (rank === 'K' && (suit === 'hearts' || suit === 'diamonds')) value = -2;
            if (rank === 'K' && (suit === 'spades' || suit === 'clubs')) value = 0;
            // Robust ID generation to prevent React key collisions
            const uniqueId = Math.random().toString(36).substr(2, 9) + '-' + Date.now();
            deck.push({ rank, suit, value, id: uniqueId });
        });
    });
    return deck.sort(() => Math.random() - 0.5);
};

const calculateScore = (hand) => hand.reduce((acc, card) => acc + card.value, 0);

io.on('connection', (socket) => {
    console.log('User Connected:', socket.id);

    socket.on('joinRoom', ({ roomCode, playerName, options }) => {
        if (!rooms[roomCode]) {
            rooms[roomCode] = {
                players: [],
                deck: createDeck(),
                hands: { p1: [], p2: [] },
                discardPile: [],
                drawnCard: null,
                currentPlayer: 'p1',
                pendingAbility: null,
                gameState: 'WAITING',
                redCalledBy: null,
                scores: null,
                options: { discardStealing: options?.discardStealing || false }
            };
        }
        
        const room = rooms[roomCode];
        if (room.players.length >= 2) return;

        const role = room.players.length === 0 ? 'p1' : 'p2';
        room.players.push({ id: socket.id, name: playerName, role });
        socket.join(roomCode);
        socket.emit('playerAssigned', { role });

        if (room.players.length === 2) {
            room.hands.p1 = room.deck.splice(0, 4).map(c => ({ ...c, faceUp: false }));
            room.hands.p2 = room.deck.splice(0, 4).map(c => ({ ...c, faceUp: false }));
            room.discardPile = [room.deck.pop()];
            room.gameState = 'IN_PROGRESS';
            io.to(roomCode).emit('startGame', room);
        }
    });

    socket.on('drawCard', ({ roomCode, source }) => {
        const room = rooms[roomCode];
        if (!room || room.drawnCard || room.gameState !== 'IN_PROGRESS') return;

        if (source === 'deck') {
            room.drawnCard = room.deck.pop();
            const r = room.drawnCard.rank;
            if (r === '7') room.pendingAbility = 'PEEK_SELF';
            else if (r === '8') room.pendingAbility = 'PEEK_OPPONENT';
            else if (r === '9') room.pendingAbility = 'BLIND_SWAP';
            else if (r === '10') room.pendingAbility = 'SPY_SWAP';
        } else if (source === 'discard' && room.options.discardStealing) {
            room.drawnCard = room.discardPile.pop();
            room.pendingAbility = null;
        }
        io.to(roomCode).emit('gameStateUpdate', room);
    });

    socket.on('discardDrawnCard', (roomCode) => {
        const room = rooms[roomCode];
        if (!room || !room.drawnCard) return;
        room.discardPile.push(room.drawnCard);
        room.drawnCard = null;
        room.pendingAbility = null;
        room.currentPlayer = room.currentPlayer === 'p1' ? 'p2' : 'p1';
        
        if (room.redCalledBy && room.currentPlayer === room.redCalledBy) {
            room.gameState = 'FINISHED';
            room.scores = { p1: calculateScore(room.hands.p1), p2: calculateScore(room.hands.p2) };
        }
        io.to(roomCode).emit('gameStateUpdate', room);
    });

    socket.on('useAbility', ({ roomCode, targetRole, cardIndex, secondTargetRole, secondCardIndex, confirmSwap }) => {
        const room = rooms[roomCode];
        if (!room || !room.pendingAbility) return;

        if (room.pendingAbility === 'PEEK_SELF' || room.pendingAbility === 'PEEK_OPPONENT') {
            socket.emit('revealCard', { card: room.hands[targetRole][cardIndex] });
        } else if (room.pendingAbility === 'BLIND_SWAP' || (room.pendingAbility === 'SPY_SWAP' && confirmSwap === true)) {
            const c1 = room.hands[targetRole][cardIndex];
            const c2 = room.hands[secondTargetRole][secondCardIndex];
            room.hands[targetRole][cardIndex] = c2;
            room.hands[secondTargetRole][secondCardIndex] = c1;
        }

        room.discardPile.push(room.drawnCard);
        room.drawnCard = null;
        room.pendingAbility = null;
        room.currentPlayer = room.currentPlayer === 'p1' ? 'p2' : 'p1';
        
        if (room.redCalledBy && room.currentPlayer === room.redCalledBy) {
            room.gameState = 'FINISHED';
            room.scores = { p1: calculateScore(room.hands.p1), p2: calculateScore(room.hands.p2) };
        }
        io.to(roomCode).emit('gameStateUpdate', room);
    });

    socket.on('swapCard', ({ roomCode, cardIndex, role }) => {
        const room = rooms[roomCode];
        if (!room || !room.drawnCard || room.currentPlayer !== role) return;

        const oldCard = room.hands[role][cardIndex];
        
        if (oldCard.rank === room.drawnCard.rank) {
            // Success: Remove both
            room.discardPile.push(oldCard, room.drawnCard);
            room.hands[role].splice(cardIndex, 1);
        } else {
            // Penalty: Keep existing and add drawn card to end of hand
            const penaltyCard = { 
                ...room.drawnCard, 
                faceUp: false, 
                id: 'penalty-' + Math.random().toString(36).substr(2, 9) 
            };
            room.hands[role].push(penaltyCard);
        }

        room.drawnCard = null;
        room.pendingAbility = null;
        room.currentPlayer = room.currentPlayer === 'p1' ? 'p2' : 'p1';

        if (room.redCalledBy && room.currentPlayer === room.redCalledBy) {
            room.gameState = 'FINISHED';
            room.scores = { p1: calculateScore(room.hands.p1), p2: calculateScore(room.hands.p2) };
        }
        io.to(roomCode).emit('gameStateUpdate', room);
    });

    socket.on('callRed', (roomCode) => {
        const room = rooms[roomCode];
        if (room && !room.redCalledBy) {
            room.redCalledBy = room.currentPlayer;
            room.currentPlayer = room.currentPlayer === 'p1' ? 'p2' : 'p1';
            io.to(roomCode).emit('gameStateUpdate', room);
        }
    });

    socket.on('disconnect', () => {
        for (const code in rooms) {
            rooms[code].players = rooms[code].players.filter(p => p.id !== socket.id);
            if (rooms[code].players.length === 0) delete rooms[code];
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
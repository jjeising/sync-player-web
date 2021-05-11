import {randomBytes} from 'crypto';
import express from 'express';
import {createServer} from 'http';
import {Server} from 'socket.io';
import path from 'path';
import {fileURLToPath} from 'url';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/public');
const allowedRoomNames = /^[\w\-_]+$/;

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer);

const rooms = {};

function updateRoom(room) {
	if (!rooms[room]) {
		return;
	}
	
	io.to(room).emit('room', rooms[room]);
}

function leaveRoom(socket) {
	if (rooms[socket.data.room]) {
		delete rooms[socket.data.room].participants[socket.id];
		rooms[socket.data.room].participantCount--;
		console.log(socket.id, 'left room', socket.data.room);
	
		updateRoom(socket.data.room);
	
		if (rooms[socket.data.room].participantCount <= 0) {
			delete rooms[socket.data.room];
			console.log('Removed room', socket.data.room, 'all participants left');
		}
	}
	
	socket.data.room = null;
}

io.on('connection', (socket) => {
	console.log(socket.id, 'connected.');
	
	socket.on('join', (room) => {
		if (!allowedRoomNames.test(room)) {
			return;
		}
		
		if (!rooms[room]) {
			rooms[room] = {
				media: {
					type: null,
					src: null
				},
				state: {
					playbackStarted: null,
					version: 0
				},
				participants: {},
				participantCount: 0
			};
			
			console.log('Room', room, 'created.');
		}
		
		if (socket.data.room) {
			socket.leave(socket.data.room);
			leaveRoom(socket.data.room);
		}
		
		socket.join(room);
		socket.data.room = room;
		
		if (!rooms[room].participants[socket.id]) {
			rooms[room].participants[socket.id] = {
				name: null,
				playbackReady: false,
				ready: false
			};
			rooms[room].participantCount++;
		}
		
		console.log(socket.id, 'joined room', room);
		
		updateRoom(room);
	});
	
	socket.on('setMedia', (type, src) => {
		if (!socket.data.room || !rooms[socket.data.room]) {
			return;
		}
		
		// TODO: check if playback is not started
		
		switch (type) {
			case 'video':
				rooms[socket.data.room].media.type = type;
				rooms[socket.data.room].media.src = src;
				break;
			default:
				break;
		}
		
		console.log(socket.id, 'set media for', socket.data.room, src);
		
		updateRoom(socket.data.room);
	});
	
	socket.on('play', (version, time) => {
		if (!socket.data.room || !rooms[socket.data.room]) {
			return;
		}
		
		console.log(socket.id, 'tries to play', socket.data.room, version, time);
		
		// TODO: validate time against media length?
		if (
			version !== rooms[socket.data.room].state.version ||
			time <= 0
		) {
			return;
		}
		
		rooms[socket.data.room].state.playbackStarted = time;
		rooms[socket.data.room].state.version++;
		
		console.log(socket.id, 'started playback for', socket.data.room, time);
		
		updateRoom(socket.data.room);
	});
	
	socket.on('pause', (version) => {
		if (!socket.data.room || !rooms[socket.data.room]) {
			return;
		}
		
		console.log(socket.id, 'tries to pause', socket.data.room, version);
		
		if (version !== rooms[socket.data.room].state.version) {
			return;
		}
		
		rooms[socket.data.room].state.playbackStarted = null;
		rooms[socket.data.room].state.version++;
		
		console.log(socket.id, 'paused playback for', socket.data.room);
		
		updateRoom(socket.data.room);
	});
	
	socket.on('seek', (version, time) => {
		if (!socket.data.room || !rooms[socket.data.room]) {
			return;
		}
		
		updateRoom(socket.data.room);
	});
	
	socket.on('setName', (name) => {
		if (
			!socket.data.room ||
			!rooms[socket.data.room] ||
			!rooms[socket.data.room].participants[socket.id] ||
			typeof name !== 'string'
		) {
			return;
		}
		
		rooms[socket.data.room].participants[socket.id].name = name;
		
		console.log(socket.id, 'set name', name);
		
		updateRoom(socket.data.room);
	});
	
	socket.on('setPlaybackReady', (playbackReady) => {
		if (
			!socket.data.room ||
			!rooms[socket.data.room] ||
			!rooms[socket.data.room].participants[socket.id]
		) {
			return;
		}
		
		rooms[socket.data.room].participants[socket.id].playbackReady = playbackReady;
		
		console.log(socket.id, 'set playback ready', playbackReady);
		
		updateRoom(socket.data.room);
	});
	
	socket.on('setReady', (ready) => {
		if (
			!socket.data.room ||
			!rooms[socket.data.room] ||
			!rooms[socket.data.room].participants[socket.id] ||
			typeof ready !== 'boolean'
		) {
			return;
		}
		
		rooms[socket.data.room].participants[socket.id].ready = ready;
		
		console.log(socket.id, 'set viewer ready', ready);
		
		updateRoom(socket.data.room);
	});
	
	socket.on('disconnecting', () => {
		if (!socket.data.room) {
			return;
		}
		
		leaveRoom(socket);
	});
	
	socket.on('disconnect', () => {
		console.log(socket.id, 'disconnected.');
	});
	
	socket.on('timesync', (data) => {
		socket.emit('timesync', {
			id: data && 'id' in data ? data.id : null,
			result: Date.now()
		});
	});
});

app.get('/', (request, response) => {
	randomBytes(8, (err, buffer) => {
		if (err) {
			throw err;
		}
		
		response.redirect(buffer.toString('base64url'));
	});
});

app.get(/^\/[\w\-_]+$/, (request, response) => {
	response.sendFile(path.join(publicDir, 'index.html'));
});

app.use(express.static(publicDir, {
	index: false
}));

httpServer.listen(8080);

import {io} from 'socket.io-client';
import Hls from 'hls.js';
import React, {useEffect, useRef, useState} from 'react';
import ReactDom from 'react-dom';
import {create as createTimeSync} from 'timesync';

let localStorageSupported = false;

try {
    localStorage.setItem('_', '_');
    localStorage.removeItem('_');
	localStorageSupported = true;
} catch(e) { }

const Player = ({}) => {
	const [connected, setConnected] = useState(false);
	const [mediaInput, setMediaInput] = useState('https://wdradaptiv-vh.akamaihd.net/i/medp/ondemand/weltweit/fsk0/242/2424815/,2424815_34867771,2424815_34867772,2424815_34867770,2424815_34867773,2424815_34867769,.mp4.csmil/master.m3u8');
	const [mediaSrc, setMediaSrc] = useState(null);
	const [name, setName] = useState((localStorageSupported && window.localStorage.getItem('name')) || 'Viewer');
	const [playbackReady, setPlaybackReady] = useState(false);
	const [playbackStateVersion, setPlaybackStateVersion] = useState(-1);
	const [ready, setReady] = useState(false);
	const [room, setRoom] = useState(null);
	const [timeOffset, setTimeOffset] = useState(0);
	
	const video = useRef(null);
	
	const socket = useRef(null);
	const timeSync = useRef(null);
	
	const setMedia = (media) => {
		socket.current.emit('setMedia', 'video', media);
	};
	
	const onVideoPlay = (event) => {
		console.log('Video play');
		
		if (room.state.playbackStarted === null) {
			console.log('Trying to play at ', timeSync.current.now() - (video.current.currentTime * 1000));
			socket.current.emit('play', room.state.version, timeSync.current.now() - (video.current.currentTime * 1000));
		}
	};
	
	const onVideoPause = (event) => {
		console.log('Video pause');
		
		if (room.state.playbackStarted !== null) {
			console.log('Trying to pause…');
			socket.current.emit('pause', room.state.version);
		}
	};
	
	const onVideoSeeked = (event) => {
		console.log('Video seeked:', video.current.currentTime);
		
		// TODO: is video playing?
	};
	
	const onVideoPlaybackStateChanged = (event) => {
		setPlaybackReady(video.current.readyState > 2);
		
		if (video.current.readyState > 2 && room.state.playbackStarted) {
			const diff = Math.abs(video.current.currentTime - ((timeSync.current.now() - room.state.playbackStarted) / 1000));
			
			if (diff > 0.5) {
				video.current.currentTime = (timeSync.current.now() - room.state.playbackStarted) / 1000;
			}
		}
	};
	
	useEffect(() => {
		console.log('Connecting…');
		
		socket.current = io({
			transports: ['websocket']
		});
		
		socket.current.on('connect', () => {
			console.log('Connected.');
			setConnected(true);
			
			const pathComponents = window.location.pathname.split('/');
			
			if (pathComponents && pathComponents[1]) {
				console.log('Joining room…', pathComponents[1]);
				socket.current.emit('join', pathComponents[1]);
			}
		});
		
		socket.current.on('disconnect', () => {
			console.log('Disconnected.');
			setConnected(false);
		});
		
		socket.current.on('room', (room) => {
			setRoom(room);
		});
		
		return () => {
			socket.current && socket.current.disconnect();
			socket.current = null;
		};
	}, [socket]);
	
	useEffect(() => {
		if (socket.current && connected) {
			console.log('Setting name…', name);
			socket.current.emit('setName', name);
		}
		
		if (localStorageSupported) {
			window.localStorage.setItem('name', name);
		}
	}, [socket, connected, name]);
	
	useEffect(() => {
		if (socket.current && connected) {
			console.log('Setting playback ready…', playbackReady);
			socket.current.emit('setPlaybackReady', playbackReady);
		}
	}, [socket, connected, playbackReady]);
	
	useEffect(() => {
		if (socket.current && connected) {
			console.log('Setting viewer ready…', ready);
			socket.current.emit('setReady', ready);
		}
	}, [socket, connected, ready]);
	
	useEffect(() => {
		if (!video.current) {
			return;
		}
		
		if (mediaSrc !== room.media.src) {
			setMediaSrc(room.media.src);
			
			// Check for native HLS support
			if (video.current.canPlayType('application/vnd.apple.mpegurl')) {
				video.current.src = room.media.src;
			} else {
				const hls = new Hls();
				hls.loadSource(room.media.src);
				hls.attachMedia(video.current);
			}
		}
		
		if (room.state.version !== playbackStateVersion) {
			console.log('Playback state differs, updating…');
			
			if (room.state.playbackStarted === null) {
				console.log('Playback was paused, pausing…');
				video.current.pause();
			} else {
				console.log('Playback was started at', room.state.playbackStarted, 'playing…');
				
				video.current.currentTime = (timeSync.current.now() - room.state.playbackStarted) / 1000;
				video.current.play();
			}
			
			setPlaybackStateVersion(room.state.version);
		}
	}, [room]);
	
	useEffect(() => {
		console.log('Initializing time sync…');
		
		timeSync.current = createTimeSync({
			server: socket.current,
			interval: 10000
		});
		
		/*
		timeSync.current.on('sync', (state) => {
			console.log('sync ' + state + '');
		});
		*/
		
		timeSync.current.on('change', (offset) => {
			setTimeOffset(offset);
		});
		
		timeSync.current.send = (server, data, timeout) => {
			return new Promise((resolve, reject) => {
				const timeoutFn = setTimeout(reject, timeout || timesync.current.options.timeout);
				
				if (!socket.current) {
					reject();
					return;
				}
				
				socket.current.emit('timesync', data, () => {
					clearTimeout(timeoutFn);
					resolve();
				});
			});
		};
		
		socket.current.on('timesync', function (data) {
			timeSync.current.receive(null, data);
		});
	}, [socket]);
	
	return (
		<div>
			<div>{(connected) ? 'Connected.' : 'Connecting…'}</div>
			<div>Server Time Offset: {Math.round(timeOffset)} ms</div>
			<form>
				<fieldset>
					<label>
						Name:
						<input type="text" value={name} onChange={(event) => setName(event.target.value)} />
					</label>
					<br />
					<label>
						Ready to start:
						<input type="checkbox" value={ready} onChange={(event) => setReady(event.target.checked)} />
					</label>
					<br />
					<label>
						Media:
						<input value={mediaInput} onChange={(event) => setMediaInput(event.target.value)} />
						<button type="button" onClick={() => setMedia(mediaInput)}>Set Media</button>
					</label>
				</fieldset>
			</form>
			<ul>
				{room && Object.keys(room.participants).map((id) =>
					room.participants[id].name &&
						<li key={id}>
							{room.participants[id].name}
							{room.participants[id].ready ? ' (Ready)' : ' (Not ready)'}
							{room.participants[id].playbackReady && ' (Video loaded.)'}
						</li>
				)}
			</ul>
			<div style={{width: '500px'}}>
				{room && room.media.type === 'video' && room.media.src && (
					<video
						controls
						muted
						ref={video}
						
						onLoadedData={onVideoPlaybackStateChanged}
						onCanPlay={onVideoPlaybackStateChanged}
						onCanPlayThrough={onVideoPlaybackStateChanged}
						
						onPause={onVideoPause}
						onPlay={onVideoPlay}
						onSeeked={onVideoSeeked}
						
						onPlaying={onVideoPlaybackStateChanged}
						onTimeUpdate={onVideoPlaybackStateChanged}
						
						style={{maxWidth: '100%'}}
					/>
				)}
			</div>
		</div>
	);
};

ReactDom.render(<Player />, document.getElementById('player'));

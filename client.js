/*
 * client.js: Client and connection with PS
 *
 * This file handles connecting to PS, loading plugins, parsing incoming messages and running commands.
 */

const WebSocketClient = require('websocket').client;

const config = require('./config.js');
const utils = require('./utils.js');

const BASE_RECONNECT_TIME = 2;
const ACTION_URL = 'http://play.pokemonshowdown.com/action.php';

class Client {
	constructor(url) {
		this.url = url;
		this.client = new WebSocketClient();

		this.reconnects = 0;

		this.userlists = {};
		this.commands = new Map();

		this.client.on('connectFailed', error => {
			this.reconnects++;
			console.log(`Connection failed with error: ${error}. Retrying in ${BASE_RECONNECT_TIME ** this.reconnects} seconds.`);
			setTimeout(this.connect, (BASE_RECONNECT_TIME ** this.reconnects) * 1000);
		});

		this.client.on('connect', connection => {
			this.connection = connection;
			this.reconnects = 0;
			console.log('WebSocket Client Connected successfully.');
			connection.on('close', () => {
				this.reconnects++;
				console.log(`Connection closed. Reconnecting in ${BASE_RECONNECT_TIME ** this.reconnects} seconds.`);
				setTimeout(this.connect, (BASE_RECONNECT_TIME ** this.reconnects) * 1000);
			});
			connection.on('message', message => {
				this.parse(message.utf8Data);
			});
		});


		this.connect();
	}

	connect() {
		console.log(`Attempting to connect to ${this.url}...`);
		this.client.connect(this.url);
	}

	parse(message) {
		if (!message) return;
		let split = message.split('|');
		let roomid = utils.toId(split[0]);
		switch (split[1]) {
		case 'challstr':
			let challstr = split.slice(2).join('|');

			request.post(ACTION_URL, {
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: `act=login&name=${config.username}&pass=${config.password}&challstr=${challstr}`,
			}, (error, response, body) => {
				if (!error && response.statusCode === 200) {
					if (body[0] === ']') {
						try {
							body = JSON.parse(body.substr(1));
						} catch (e) {
							console.log(`Invalid JSON response from server: ${body}. Exiting.`);
							process.exit(1);
						}
						if (body.assertion && body.assertion[0] !== ';') {
							this.init();

							this.send('', `/trn ${config.username},0,${body.assertion}`);
						} else {
							console.log(`Something went wrong logging in. Assertion: ${body.assertion}. Exiting.`);
							process.exit(1);
						}
					} else {
						console.log(`Something went wrong with a request (status code ${response.statusCode})${error ? `: ${error}` : ''}. Exiting.`);
						process.exit(1);
					}
				}
			});
			break;
		case 'updateuser':
			if (split[2] !== config.username) return false;

			console.log(`Successfully set up and logged in as ${split[2]}`);
			break;
		case 'J':
		case 'j':
			if (!this.userlists[roomid]) this.userlists[roomid] = {}; // failsafe, is this even needed? im paranoid and shit
			this.userlists[roomid][utils.toId(split[2])] = [split[2][0], split[2].slice(1)];
			break;
		case 'L':
		case 'l':
			delete this.userlists[roomid][utils.toId(split[2])];
			break;
		case 'N':
		case 'n':
			if (this.userlists[roomid]) {
				delete this.userlists[roomid][utils.toId(split[3])];
			} else {
				this.userlists[roomid] = {}; // paranoia again.
			}
			this.userlists[roomid][utils.toId(split[2])] = [split[2][0], split[2].slice(1)];			
			break;
		case 'noinit':
		case 'deinit':
			console.log(`Attempted to join the room '${roomid}', but failed to do so.`);
			break;
		case 'init':
			let list = {};
			for (let username of split[6].trim().split(',').slice(1)) {
				list[utils.toId(username)] = [username[0], username.slice(1)];
			}
			this.userlists[roomid] = list;
			break;
		case 'pm':
			if (split[2] === config.username) return false;

			// TODO: parse commands
			break;
		case 'c':
			if (split[2] === config.username) return false;
		
			// TODO: parse commands
			break;
		case 'c:':
			if (split[3] === config.username) return false;

			// TODO: parse commands
			break;
		}
	}

	init() {
		this.send('', `/avatar ${config.avatar}`);
		this.send('', `/autojoin ${config.rooms.join(',')}`);

		let core = require('./core-commands.js');

		for (let c in core) {
			this.commands.set(c, core[c]);
		}

		fs.readdirSync('./plugins')
		.filter((file) => file.endsWith('.js'))
		.forEach((file) => {
			let plugin = require(`./plugins/${file}`);
			
			if (plugin.commands) {
				for (let c in plugin.commands) {
					this.commands.set(c, plugin.commands[c]);
				}
			}
		});
	}

	send(room, message) {
		return this.connection.send(`${room}|${message}`);
	}
}

module.exports = new Client(`ws://${config.host}:${config.port}/showdown/websocket`);
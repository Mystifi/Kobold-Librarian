/*
 * client.js: Client and connection with PS
 *
 * This file handles connecting to PS, loading plugins, parsing incoming messages and running commands.
 */

const WebSocketClient = require('websocket').client;
const fs = require('fs');
const request = require('request');

const config = require('./config');
const utils = require('./utils');

const BASE_RECONNECT_TIME = 2;
const ACTION_URL = 'http://play.pokemonshowdown.com/action.php';
const RANKS = ['+', '%', '@', '*', '#', '&', '~'];

class CommandWrapper {
	constructor(send, commands, userlists, gameRooms, gameClasses) {
		this.send = send;
		this.commands = commands;
		this.userlists = userlists;
		this.gameRooms = gameRooms;
		this.gameClasses = gameClasses;
	}

	hasPerms(rank) {
		return RANKS.indexOf(this.rank) >= RANKS.indexOf(rank);
	}

	sendPM(userid, message) {
		this.send(`/pm ${userid}, ${message}`);
	}

	// Checks `roomid` to see if the current game within it is `gameId`. You should use
	// this if you only need to check whether or not a game exists; use CommandWrapper#findCurrentGame
	// if you need verification AND the game object.
	currentGame(roomid, gameId) {
		return this.gameRooms[roomid] && this.gameRooms[roomid].nameId === gameId;
	}

	// This allows games to have PM commands by returning the game object (which is
	// already set to the roomid itself) and the roomid in which the game is occurring
	// if the game's ID is the same as specified.
	findCurrentGame(gameId) {
		if (!this.gameClasses.has(gameId)) return []; // Prevent needless searching
		for (const roomid in this.gameRooms) {
			if (this.gameRooms[roomid].nameId === gameId) {
				return [this.gameRooms[roomid], roomid];
			}
		}
		return [];
	}

	newGame(roomid, gameId, options) {
		// Can't use `this.currentGame` here since that will return false if there is a game that isn't `gameId`,
		// and we don't want multiple games running at the same time in the same room.
		if (this.gameRooms[roomid]) return this.send(`There is already an active game of ${this.gameRooms[roomid].name}.`);
		if (!this.gameClasses.has(gameId)) return this.send(`Invalid game. Use \`\`${config.commandToken}game\`\` to see the list of games.`);
		if (!options.send) options.send = (message, isAnnouncement) => this.send(`${isAnnouncement ? "/wall " : ""}${message}`);
		if (!options.sendPM) options.sendPM = this.sendPM;
		this.gameRooms[roomid] = new (this.gameClasses.get(gameId))(roomid, options);
		this.gameRooms[roomid].signups();
	}

	async run(commandName, rank, userid, roomid, message) {
		// Get highest auth if used in PM.
		if (!roomid) {
			for (const room of config.rooms) {
				if (this.userlists[room] && this.userlists[room][userid]) {
					const roomrank = this.userlists[room][userid][0];
					if (RANKS.indexOf(roomrank) > RANKS.indexOf(rank)) rank = roomrank;
				}
			}
		}
		this.rank = config.owners.includes(userid) ? '~' : rank;
		this.command = commandName;
		let command = this.commands.get(commandName);
		command.apply(this, [userid, roomid, message]).catch(e => {
			utils.errorMsg(`An error occurred within the ${commandName} command: ${e.stack}`);
		});
	}
}

class Client {
	constructor(url) {
		this.url = url;
		this.client = new WebSocketClient();

		this.reconnects = 0;

		this.userlists = {};
		this.joinHandlers = [];
		this.leaveHandlers = [];

		this.commands = new Map();

		this.gameRooms = {};
		this.gameClasses = new Map();

		this.client.on('connectFailed', error => {
			this.reconnects++;
			utils.errorMsg(`Connection failed with error: ${error}. Retrying in ${BASE_RECONNECT_TIME ** this.reconnects} seconds.`);
			setTimeout(this.connect, (BASE_RECONNECT_TIME ** this.reconnects) * 1000);
		});

		this.client.on('connect', connection => {
			this.connection = connection;
			this.reconnects = 0;
			utils.statusMsg('WebSocket Client connected successfully.');
			connection.on('close', () => {
				this.reconnects++;
				utils.errorMsg(`Connection closed. Reconnecting in ${BASE_RECONNECT_TIME ** this.reconnects} seconds.`);
				setTimeout(this.connect, (BASE_RECONNECT_TIME ** this.reconnects) * 1000);
			});
			connection.on('message', message => {
				this.parse(message.utf8Data);
			});
		});


		this.connect();
	}

	connect() {
		utils.statusMsg(`Attempting to connect to ${this.url}...`);
		this.client.connect(this.url);
	}

	parse(message) {
		if (!message) return;
		let split = message.split('|');
		let roomid = utils.toRoomId(split[0]);

		let userid = utils.toId(config.username);

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
							utils.errorMsg(`Invalid JSON response from server: ${body}. Exiting.`);
							process.exit(1);
						}
						if (body.assertion && body.assertion[0] !== ';') {
							this.init();

							this.send('', `/trn ${config.username},0,${body.assertion}`);
						} else {
							utils.errorMsg(`Something went wrong logging in. Assertion: ${body.assertion.slice(2)} Exiting.`);
							process.exit(1);
						}
					} else {
						utils.errorMsg(`Something went wrong with a request (status code ${response.statusCode})${error ? `: ${error}` : ''}. Exiting.`);
						process.exit(1);
					}
				}
			});
			break;
		case 'updateuser':
			if (utils.toId(split[2]) !== userid) return false;

			utils.statusMsg(`Successfully set up and logged in as ${split[2]}.`);
			break;
		case 'J':
		case 'j':
			if (!this.userlists[roomid]) this.userlists[roomid] = {}; // failsafe, is this even needed? im paranoid and shit
			this.userlists[roomid][utils.toId(split[2])] = [split[2][0], split[2].slice(1)];

			Promise.all(this.joinHandlers.map(handler => handler.apply(this, [utils.toId(split[2]), roomid]))).catch(e => utils.errorMsg(e));
			break;
		case 'L':
		case 'l':
			delete this.userlists[roomid][utils.toId(split[2])];

			if (this.gameRooms[roomid]) {
				let game = this.gameRooms[roomid];
				if (game.players.includes(utils.toId(split[2]))) game.userLeave(utils.toId(split[2]));
			}

			Promise.all(this.leaveHandlers.map(handler => handler.apply(this, [utils.toId(split[2]), roomid]))).catch(e => utils.errorMsg(e));
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
			utils.errorMsg(`Attempted to join the room '${roomid}', but failed to do so.`);
			break;
		case 'init':
			let list = {};
			for (let username of split[6].trim().split(',').slice(1)) {
				list[utils.toId(username)] = [username[0], username.slice(1)];
			}
			this.userlists[roomid] = list;
			break;
		case 'pm':
			if (utils.toId(split[2]) === userid) return false;

			this.parseMessage(split[2], null, split.slice(4).join('|').trim()).catch(e => utils.errorMsg(e));

			break;
		case 'c':
			if (utils.toId(split[2]) === userid) return false;

			this.parseMessage(split[2], roomid, split.slice(3).join('|').trim()).catch(e => utils.errorMsg(e));

			break;
		case 'c:':
			if (utils.toId(split[3]) === userid) return false;

			this.parseMessage(split[3], roomid, split.slice(4).join('|').trim()).catch(e => utils.errorMsg(e));

			break;
		}
	}

	init() {
		this.send('', `/avatar ${config.avatar}`);
		this.send('', `/autojoin ${config.rooms.join(',')}`);

		let core = require('./core-commands');

		for (let c in core.commands) {
			this.commands.set(c, core.commands[c]);
		}

		for (let a in core.aliases) {
			this.commands.set(a, core.commands[core.aliases[a]]);
		}

		fs.readdirSync('./plugins')
			.filter(file => file.endsWith('.js'))
			.forEach(file => {
				let plugin = require(`./plugins/${file}`);

				if (plugin.onJoin) {
					this.joinHandlers.push(plugin.onJoin);
				}
				if (plugin.onLeave) {
					this.leaveHandlers.push(plugin.onLeave);
				}
				if (plugin.commands) {
					for (let c in plugin.commands) {
						this.commands.set(c, plugin.commands[c]);
					}
					if (plugin.aliases) {
						for (let a in plugin.aliases) {
							this.commands.set(a, plugin.commands[plugin.aliases[a]]);
						}
					}
				}
				if (plugin.games) {
					for (let id in plugin.games) {
						this.gameClasses.set(id, plugin.games[id]);
					}
				}
			});
	}

	send(room, message) {
		return this.connection.send(`${room}|${message}`);
	}

	sendPM(userid, message) {
		return this.connection.send(`|/pm ${userid}, ${message}`);
	}

	async parseMessage(user, roomid, message) {
		let userid = utils.toId(user);
		if (!message.startsWith(config.commandToken)) {
			if (roomid && this.gameRooms[roomid]) {
				let game = this.gameRooms[roomid];
				if (message.trim().toLowerCase() === "/me in") game.userJoin(userid);
				return;
			}
			this.sendPM(userid, "Hi, I'm only a bot. Please PM another staff member for assistance.");
			utils.pmMsg(`PM received from ${userid}: ${message}`);
			return;
		}
		let [commandName, ...words] = message.slice(config.commandToken.length).split(' ');
		commandName = utils.toId(commandName);

		if (!this.commands.has(commandName)) {
			if (!roomid) {
				let matches = Array.from(this.commands).map(([name]) => name).sort((a, b) => utils.levenshtein(commandName, a) - utils.levenshtein(commandName, b));
				this.sendPM(userid, `Invalid command. Did you mean ${utils.arrayToPhrase(matches.slice(0, 3), 'or')}?`);
			}
			return;
		}

		// The closure allows us to optionally specify an alternate room
		// to send to. If we only specify a message, then it will either
		// default to either the room it was sent to or the sender's PMs.
		let send = (message, room = roomid) => {
			if (room) {
				this.send(room, message);
			} else {
				this.sendPM(userid, message);
			}
		};
		let wrapper = new CommandWrapper(send, this.commands, this.userlists, this.gameRooms, this.gameClasses);

		await wrapper.run(commandName, user[0], userid, roomid, words.join(' '));
	}
}

module.exports = new Client(`ws://${config.host}:${config.port}/showdown/websocket`);

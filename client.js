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
	constructor(rank, send, commands, userlists) {
		this.rank = rank;
		this.send = send;
		this.commands = commands;
		this.userlists = userlists;
	}

	hasPerms(rank) {
		return RANKS.indexOf(this.rank) >= RANKS.indexOf(rank);
	}

	sendPM(userid, message) {
		this.send(`/pm ${userid}, ${message}`);
	}

	async run(commandName, userid, roomid, message) {
		if (config.owners.includes(userid)) this.rank = '~'; // There might be a more elegant way to do it. Can't think of it rn however.
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
		this.commands = new Map();

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

		for (let c in core) {
			this.commands.set(c, core[c]);
		}


		fs.readdirSync('./plugins')
			.filter(file => file.endsWith('.js'))
			.forEach(file => {
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

	sendPM(userid, message) {
		return this.connection.send(`|/pm ${userid}, ${message}`);
	}

	// For the moment, this only handles parsing incoming command messages.
	async parseMessage(user, roomid, message) {
		let rank = user[0];
		let userid = utils.toId(user);
		if (!message.startsWith(config.commandToken)) {
			if (!roomid) {
				this.sendPM(userid, "Hi, I'm only a bot. Please PM another staff member for assistance.");
				utils.pmMsg(`PM received from ${userid}: ${message}`);
			}
			return;
		}
		let [commandName, ...words] = message.slice(config.commandToken.length).split(' ');

		if (!this.commands.has(commandName)) {
			if (!roomid) this.sendPM(userid, "Invalid command.");
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
		let wrapper = new CommandWrapper(rank, send, this.commands, this.userlists);

		await wrapper.run(commandName, userid, roomid, words.join(' '));
	}
}

module.exports = new Client(`ws://${config.host}:${config.port}/showdown/websocket`);

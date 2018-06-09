/*
 * game.js: Core functionality of scripted games.
 *
 * Provides an extensible class for created scripted games that can be played
 * within any room the bot is in.
 */

const config = require('./config');
const utils = require('./utils');

class GameBase {
	constructor(room, options = {}) {
		this.room = room;
		this.players = [];
		this.roundNumber = 0;
		this.freeJoin = true;
		this.currentState = 'signups';

		// I can't really import client here because the client
		// would know about which games are loaded (Client#init),
		// and it doesn't make sense for this module to keep track
		// of which rooms have games when the client's job is to
		// keep track of room states, so I'll just have a predefined
		// send/sendPM function that can be overwritten in Client#newGame
		// by an extended class.
		// GameBase, by default, assumes `this.send` has a second parameter,
		// `isAnnouncement`, that would cause messages to be prefixed
		// with "/wall " so that it's easier for the room to see.
		this.send = options.send;
		this.sendPM = options.sendPM;

		// Some games require a user to host because they aren't fully
		// automated, so this just keeps track of that user.
		this.host = options.host || utils.toId(config.username);
	}

	get started() {
		return this.currentState === 'started';
	}

	signups() {
		this.send(`Starting a new game of ${this.name}! ${this.freeJoin ? "You can join at any time." : `If you would like to join, either type \`\`${config.commandToken}join\`\` or \`\`/me in\`\`.`}`, true);
		if (this.description) this.send(this.description, true);
		if (this.onSignups) this.onSignups();
		if (this.freeJoin) this.currentState = 'started';
	}

	userJoin(userid) {
		if (!this.freeJoin && this.started) return this.sendPM(userid, `Sorry, you can't join the game of ${this.name}.`);
		if (this.players.includes(userid)) return this.sendPM(userid, `You're already a player in the game of ${this.name}.`);
		this.players.push(userid);
		this.sendPM(userid, `Successfully joined the game of ${this.name}.`);
		if (this.onJoin) this.onJoin(userid);
		if (this.maxPlayers && this.players.length >= this.maxPlayers) this.start();
	}

	userLeave(userid) {
		if (this.freeJoin) return this.sendPM(userid, `You can leave a free-join game at any time; you don't have to use \`\`${config.commandToken}leave\`\`.`);
		let playerIndex = this.players.findIndex(curUserid => curUserid === userid);
		if (playerIndex <= 0) return this.sendPM(userid, `You're not playing the game of ${this.name}.`);
		this.players.splice(playerIndex, 1);
		this.sendPM(userid, `Successfully left the game of ${this.name}.`);
		if (this.onLeave) this.onLeave(userid);
	}

	start() {
		if (this.started) return; // The user should already know it started...
		this.currentState = 'started';
		this.send(`The game of ${this.name} has started!`, true);
		if (this.onStart) this.onStart();
	}

	end(forced = false) {
		if (forced) this.send(`The game of ${this.name} was forcibly ended.`, true);
		// If you have any timers, for the love of God, clear them here
		if (this.onEnd) this.onEnd();
	}
}

module.exports = GameBase;

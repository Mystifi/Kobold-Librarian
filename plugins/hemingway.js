/*
 * hemingway.js: Scripted game of Ernest Hemingway
 *
 * This is a bot-hosted version of a game that originated from Writing, where
 * participants post three-to-six word entries for a specific writing prompt.
 */

const {commandToken} = require('../config');
const GameBase = require('../game');
const quills = require('../quills');
const utils = require('../utils');

const name = "Ernest Hemingway";
const nameId = 'hemingway';

class Hemingway extends GameBase {
	constructor(...args) {
		super(...args);
		this.name = name;
		this.nameId = nameId;
		this.description = "Write a three-to-six word description about the given topic!";
		this.pmCommands = ['submit', 'vote'];
		this.overwriteWarnings = new Map();
		this.submissionsOpen = false;
		this.submissions = new Map();
		this.votesOpen = false;
		this.votes = new Map();
		// makes sure users are accounted for after using commands
		this.accountability = new Set();
		this.ties = null;
		this.passed = new Set();
		this.timer = null;
	}

	onSignups() {
		let announcement = `/addhtmlbox <center><b><u>General rundown of ${name}</u></b></center><ul>\
			<li>You can join the game via typing <code>/me in</code> into the chat.${this.freeJoin ? ` Since this game is free-join, you are able to join at any time!` : ``}</li>\
			<li>When the host, <b>${this.host}</b>, posts the topic for the first round via <code>;topic [topic]</code>, you will have roughly <b>2-3</b> minutes to write your submission.</li>\
			<li>You can pass the round by PMing Kobold Librarian <code>;pass</code>. Not that this means you will <b>NOT</b> be able to submit or vote for the round.</li>\
			<li>After the host says "Time's up!", you will PM me your submissions via <code>${commandToken}submit [entry]</code>. All submissions will be automatically posted in the chat when all players have submitted.</li>\
			<li>When the host announces that it's time to submit your vote, you will PM me with <code>${commandToken}vote [user]</code>.</li>\
			<li>The winner will earn 10 quills for the round, and they will be able to PM the host the topic for the next round.</li>\
			<li>If a tie occurs between votes, then a "sudden death" will happen between the tied players. They will have less time to write about a new topic, and only they can submit an entry. The rest of the players will vote on who the winner should be, and the winner will earn 20 quills rather than 10.</li></ul>`;
		this.send(announcement);
		this.setupRound();
	}

	onStart() {
		this.setupRound();
	}

	setupRound(tieRound = false) {
		if (!tieRound && this.ties) this.ties = null;
		this.submissionsOpen = true;
		this.votingOpen = false;
		this.submissions.clear();
		this.accountability.clear();
		this.passed.clear();
		this.roundTopic = '';
	}

	submit(userid, message) {
		if (!this.submissionsOpen) return this.sendPM(userid, "I'm not accepting any submissions right now.");
		let success = this.canParticipate('submit', userid);
		if (!success) return;
		let words = message.split(' ').length;
		if (words < 3 || words > 6) return this.sendPM(userid, "Your submission must contain anywhere from 3-6 words.");
		this.submissions.set(userid, message);
		this.accountability.add(userid);
		this.sendPM(userid, `Your submission (${message}) has been recorded.`);
		// If everyone has submitted, go ahead and open voting
		if (this.allHaveSubmitted) this.openVoting();
	}

	pass(userid) {
		let success = this.canParticipate('pass', userid);
		if (!success) return;
		this.passed.add(userid);
		this.sendPM(userid, `Successfully passed for this round. You will be unable to submit and vote for this round.`);
		// ideally this shouldn't happen but just in case...
		if (this.submissions.has(userid)) this.submissions.delete(userid);
	}

	openVoting(fromCommand = false) {
		let submissionsTable = `<b><u>Topic: ${this.roundTopic}</u></b><br/><table border=1 cellspacing=0 cellpadding=3><tr><td><b>User:</b></td><td><b>Submission:</b></td></tr>`;
		this.submissions.forEach((submission, userid) => {
			submissionsTable += `<tr><td><b>${userid}</b></td><td>${submission}</td></tr>`;
		});
		submissionsTable += `</table><br/><b>Users who have passed for this round:</b> ${[...this.passed.entries()].map(p => `<i>${p}</i>`).join(', ')}`;
		this.send(`/addhtmlbox ${submissionsTable}`);
		if (fromCommand) return; // don't do anything else
		if (this.timer) clearTimeout(this.timer);
		this.accountability.clear();
		this.send(`PM me your votes with the command \`\`${commandToken}vote userid\`\`!`);
		this.submissionsOpen = false;
		this.votingOpen = true;
	}

	vote(userid, message) {
		if (!this.votingOpen) return this.sendPM(userid, "I'm not accepting any votes right now.");
		let success = this.canParticipate('vote', userid);
		if (!success) return;
		message = utils.toId(message);
		if (!this.players.includes(message)) return this.sendPM(userid, "Please vote for an active participant.");
		if (!this.submissions.has(message)) return this.sendPM(userid, "Please vote for someone who has submitted an entry for this round.");
		if (message === userid) return this.sendPM(userid, "You can't vote for yourself.");
		let currentVotes = this.votes.get(message) || 0;
		this.votes.set(message, currentVotes + 1);
		this.accountability.add(userid);
		this.sendPM(userid, `Your vote (${message}) has been recorded.`);
		// If everyone has voted, tally the results
		if (this.allHaveSubmitted) this.parseVotes();
	}

	parseVotes() {
		if (this.timer) clearTimeout(this.timer);
		let votes = [...this.votes.entries()].sort((a, b) => b[1] - a[1]);
		// Account for any possible ties:
		votes = votes.filter(([, voteNumber]) => voteNumber === votes[0][1]);
		if (votes.length > 1) {
			this.ties = votes.map(([userid]) => userid);
			this.send(`There is a tie between the following users: ${this.ties.join(', ')}. The host (${this.host}) will open up a sudden death round.`, true);
			return this.setupRound(true);
		}
		let [winner, number] = votes[0];
		this.send(`**${winner}** won the ${this.ties ? 'sudden death' : ''} round with a total of **${number}** votes!`, true);
		let amount = this.tie ? 20 : 10;
		let newBalance = quills.addQuills(winner, amount);
		this.send(`${winner}, ${amount} quills have been added to your account! You now have ${newBalance} quills.`);
		this.setupRound();
	}

	get allHaveSubmitted() {
		let comparator = this.ties && this.submissionsOpen ? this.ties : this.players.filter(player => !this.passed.has(player));
		return [...this.accountability.keys()].length === comparator.length;
	}

	// this entire thing feels needlessly complex and I hate it, but it works
	canParticipate(type, userid) {
		if (!this.players.includes(userid)) {
			if (!this.freeJoin) {
				this.sendPM(userid, `You cannot join the game of ${name} as it has already started.`);
				return false;
			}
			this.userJoin(userid);
		}
		if (this.ties) {
			let response = '';
			if (!this.ties.includes(userid)) {
				if (type !== 'vote') response = "Only tied players can participate right now.";
			} else {
				switch (type) {
				case 'pass':
					response = "You can't pass on a tied round.";
					break;
				case 'vote':
					if (this.ties.length === 2) response = "You can't vote with only two ties; since you would only vote for each other, they would essentially cancel out.";
					break;
				}
			}
			if (response) {
				this.sendPM(userid, response);
				return false;
			}
		}
		return true;
	}
}

module.exports = {
	games: {[nameId]: Hemingway},
	aliases: {
		eh: 'hemingway',
		// These are aliases because the functionality of both commands
		// is the exact same; I'm just blocking people from stricly using
		// ";ehcommand". Extra commands should only alias to ehcommand if
		// they're supposed to be used in PMS only
		submit: 'ehcommand',
		pass: 'ehcommand',
		vote: 'ehcommand',

		timer: 'starttimer',
		submissions: 'openvoting',
	},
	commands: {
		async hemingway(userid, roomid) {
			await this.run('game', this.rank, userid, roomid, nameId);
		},
		async ehcommand(userid, roomid, message) {
			if (this.command === 'ehcommand') return;
			// Basic pre-requisites before we let the game itself handle the command
			let [game, gameRoom] = this.findCurrentGame(nameId);
			if (!(game && gameRoom)) return this.sendPM(userid, `There is no current game of ${name}.`);
			if (game.pmCommands.includes(this.command) && roomid) return this.sendPM(userid, "Please use this command in PMs only.");
			// now the game can do its job
			game[this.command](userid, message);
		},
		async topic(userid, roomid, message) {
			let [game, gameRoom] = this.findCurrentGame(nameId);
			if (!(game && gameRoom)) return this.send(`There is no current game of ${name}`);
			if (userid !== game.host) return this.sendPM(userid, `Only the host, ${game.host}, can set the topic.`);
			game.roundTopic = message;
			game.send(`The topic for the round is **${message}**! PM your submissions to me using \`\`${commandToken}submit\`\`!`, true);
		},
		async starttimer(userid) {
			let [game, gameRoom] = this.findCurrentGame(nameId);
			if (!(game && gameRoom)) return this.sendPM(userid, `There is no current game of ${name}.`);
			if (userid !== game.host && !this.hasPerms('%')) return this.sendPM(userid, "Permission denied.");
			game.send(`A timer for two and a half minutes has started.`);
			game.timer = setTimeout(() => {
				let inactive = game.players.filter(player => !game.accountability.has(player));
				if (game.submissionsOpen) {
					for (let player of inactive) game.passed.add(player);
					game.send(`The following players have been marked inactive: ${inactive.join(', ')}.`, true);
					game.openVoting();
				} else {
					game.send(`The following players need to submit their votes: ${inactive.join(', ')}`);
				}
			}, 2.5 * 60 * 1000);
		},
		async openvoting(userid, roomid) {
			let [game, gameRoom] = this.findCurrentGame(nameId);
			if (!(game && gameRoom)) return this.send(`There is no current game of ${name}.`);
			if (!this.hasPerms(this.command === 'submissions' ? '+' : '%')) return this.sendPM(userid, "Please ask a staff member to do this for you.");
			// if it's going to be used in chat, make sure it's used in the proper room
			if (roomid && roomid !== gameRoom) return this.sendPM(userid, `If you're going to use this command in a room, please use it in <<${gameRoom}>>.`);
			game.openVoting(this.command === 'submissions' ? true : false);
		},
	},
};

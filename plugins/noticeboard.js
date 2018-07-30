/*
 * noticeboard.js: Repeated noticeboard.
 *
 * This plugin contains the noticeboard feature, which puts a noticeboard in chat every INTERVAL.
 */

const storage = require('../storage');
const server = require('../server');
const client = require('../client');

const md = require('markdown').markdown;

const ROOM = 'thelibrary';
const INTERVAL = 3 * 60 * 60 * 1000;

server.addRoute('/noticeboard.html', () => {
	let current = storage.getJSON('noticeboard');

	return [`Library Noticeboard`, `<form method="POST"><h3>Noticeboard:</h3><textarea name="noticeboard" rows="5" cols="75">${current.content || ''}</textarea><br/><input type="submit" value="Submit"></form>`];
}, {permission: 'noticeboard', onPost: (body, tokenData) => {
	let current = storage.getJSON('noticeboard');

	if (!body.noticeboard || current.content === body.noticeboard) return;

	current.content = body.noticeboard;

	storage.exportJSON('noticeboard');
	client.send(ROOM, `/modnote ${tokenData.user} updated the noticeboard.`);
	sendNoticeboard();
}});

let timer = null;

function sendNoticeboard() {
	if (timer) clearTimeout(timer);
	timer = setInterval(() => {
		let noticeboard = md.toHTML(storage.getJSON('noticeboard').content);
		if (!noticeboard) return;
		client.send(ROOM, `/adduhtml noticeboard, ${noticeboard}`);
	}, INTERVAL);
}

module.exports = {
	onInit() {
		sendNoticeboard();
	},
	commands: {
		async noticeboard(userid, roomid) {
			if (!roomid) roomid = ROOM;
			if (!this.hasPerms('@')) return this.send(`Permission denied.`);

			return this.sendPM(userid, `${server.url}noticeboard.html?token=${server.createAccessToken('noticeboard', roomid, userid)}`);
		},
	},
};

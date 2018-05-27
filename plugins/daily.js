/*
 * daily.js: Daily (and weekly) informational commands
 *
 * This plugin handles the various 'otd' and 'otw' commands in the writing room(s). It provides a webpage for setting and editing them,
 * which allows bypassing of the character limit for chat messages on PS. To add new dailies, just add the necessary fields to the dailies object.
 */

const utils = require('../utils');
const storage = require('../storage');
const server = require('../server');
const client = require('../client');

const md = require('markdown').markdown;

const ROOM = 'thelibrary';

// All the specific configuration options for each of the daily (or weekly) commands.
const dailies = {
	totw: {
		name: "Theme of the Week",
		room: ROOM,
		params: ['title', 'image', 'description'],
		async renderEntry(entry, pm) {
			let imgHTML = '';
			if (!pm) {
				const [width, height] = await utils.fitImage(entry.image, 120, 180).catch(() => {});
				if (width && height) {
					imgHTML = `<td>\
						<img src="${entry.image}" width=${width} height=${height}>\
					</td>`;
				}
			}
			return `<table style="padding-top: 5px;">\
				<tr>\
					${imgHTML}\
					<td style="padding-left:8px; vertical-align:baseline;">\
						<div style="font-size: 22pt; margin-top: 5px; color: black;">${entry.title}</div>\
						<div style="font-size: 10pt; font-family: Verdana, Geneva, sans-serif; margin-top: 5px ; display: block ; color: rgba(0, 0, 0 , 0.8)">${md.toHTML(entry.description)}</div>\
					</td>\
				</tr>\
			</table>`;
		},
	},
	wotd: {
		name: "Word of the Day",
		room: ROOM,
		params: ['word', 'pronunciation', 'class', 'definition', 'etymology'],
		async renderEntry(entry) {
			return `<span style="font-size: 30pt; color: black; display: block">${entry.word}</span>\
			<span style="font-family: sans-serif; font-size: 12pt; display: block; color: rgba(0,0,0,0.7); letter-spacing: 2px">${entry.pronunciation} / <strong style="letter-spacing: 0">${entry.class}</strong></span>\
			<span style="font-size: 10pt; font-family: sans-serif; margin-top: 10px; display: block; color: rgba(0,0,0,0.8)">\
				<strong style="font-family: serif; margin-right: 10px; color: rgba(0,0,0,0.5)">1.</strong>${entry.definition}\
			</span>\
			<span style="font-family: sans-serif ; margin-top: 10px ; display: block ; color: rgba(0, 0, 0, 0.7)">${entry.etymology}</span>`;
		},
	},
	hotd: {
		name: "History of the Day",
		room: ROOM,
		params: ['title', 'date', 'location', 'description'],
		async renderEntry(entry) {
			return `<span style="font-size: 22pt ; display: inline-block; color: black">${entry.title}</span>\
			<span style="font-family: Verdana, Geneva, sans-serif ; font-size: 12pt ; display: block ; color: rgba(0, 0, 0 , 0.7) ; letter-spacing: 0px">\
			${entry.date} - <strong style="letter-spacing: 0">${entry.location}</strong>\
			</span>\
			<span style="font-size: 10pt ; font-family: Verdana, Geneva, sans-serif; margin-top: 5px ; display: block ; color: rgba(0, 0, 0 , 0.8)">\
				${entry.description}\
			</span>`;
		},
	},
};

async function getHTML(key, pm) {
	if (!storage.getJSON('dailies')[key]) return `<b>No ${key} has been set yet.</b>`;

	const entryHTML = await dailies[key].renderEntry(storage.getJSON('dailies')[key], pm);

	return `<div style="background: url(https://i.imgur.com/EQh19sO.png) center ; margin: -2px -4px ; box-shadow: inset 0 0 50px rgba(0 , 0 , 0 , 0.15);">\
		<div style="font-family: Georgia, serif ; max-width: 550px ; margin: auto ; padding: 8px 8px 12px 8px; text-align: left; background: rgba(250, 250, 250, 0.8)">\
			<span style="display: block ; font-family: Verdana, Geneva, sans-serif ; font-size: 16pt ; font-weight: bold ; background: #6d6d6d ; padding: 3px 0 ; text-align: center ; border-radius: 2px ; color: rgba(255 , 255 , 255 , 1) ; margin-bottom: 2px">\
				<i class="fa fa-fire" aria-hidden="true"></i> ${dailies[key].name} <i class="fa fa-fire" aria-hidden="true"></i>\
			</span>\
			${entryHTML.replace(/\n/g, '<br/>')}\
		</div>\
	</div>`;
}

server.addRoute('/daily.html', (url, queryData, tokenData) => {
	let entryHTML = '';
	let current = storage.getJSON('dailies');

	for (const id in dailies) {
		const daily = dailies[id];
		if (daily.room !== tokenData.room) continue;

		const inputs = [];
		const curEntry = current[id] || {};

		for (const param of daily.params) {
			inputs.push(`${param}:<br/>${param === 'description' ? `<textarea name="${id}|${param}" rows="5" cols="75">${curEntry[param] || ''}</textarea>` : `<input type="text" name="${id}|${param}" size="50" value="${curEntry[param] || ''}">`}`);
		}

		entryHTML += `<h3>${daily.name}:</h3>\
			${inputs.join('<br/>')}`;
	}

	return [`Daily commands for ${tokenData.room}`, `<form method="POST">${entryHTML}<br/><input type="submit" value="Submit"></form>`];
}, {permission: 'daily', onPost: (body, tokenData) => {
	let store = storage.getJSON('dailies');

	const changes = new Set();

	for (const key in body) {
		const [daily, param] = key.split('|');
		if (!(daily && param) || !dailies[daily] || !dailies[daily].params.includes(param)) continue; // Just in case someone tech-savvy decides to mess with the POST data.

		let val = body[key].trim();
		if (param === 'image' && !/^https?:\/\//.test(val)) val = `http://${val}`;

		if (!store[daily]) store[daily] = {};
		if (!val || val === store[daily][param]) continue;
		if (store[daily][param] !== val) changes.add(daily);
		store[daily][param] = val;
	}

	storage.exportJSON('dailies');
	if (changes.size) client.send(tokenData.room, `/modnote ${tokenData.user} updated ${Array.from(changes).join(', ')}.`);
}});

const aliases = {};
for (const key in dailies) aliases[key] = 'daily';

module.exports = {
	aliases: aliases,
	commands: {
		async daily(userid, roomid, message) {
			if (this.command !== 'daily') {
				if (!dailies[this.command]) return; // Should never happen, but just in case.

				const pm = !(roomid && this.hasPerms('+'));
				const html = await getHTML(this.command, pm);
				if (pm) return this.send(`/pminfobox ${userid}, ${html}`, dailies[this.command].room);
				return this.send(`/addhtmlbox ${html}`);
			}

			if (!roomid) roomid = ROOM;
			if (!this.hasPerms('%')) return this.send(`Permission denied.`);

			return this.sendPM(userid, `${server.url}daily.html?token=${server.createAccessToken('daily', roomid, userid)}`);
		},
	},
};

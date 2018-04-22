/*
 * personal.js: Personal bios and pages.
 *
 * Also provides the commands and logic for the RO-set public pages (anything in the /pages/ directory on the website)
 */

const md = require('markdown').markdown;

const config = require('../config');
const quills = require('../quills');
const server = require('../server');
const storage = require('../storage');
const utils = require('../utils');

quills.addShopItem('bio', "Personalized Bio", 500, `A personalized bio <a href="bios.html">on The ${config.username}'s website</a>. Use <code>${config.commandToken}setbio text</code> to set your bio. Bios use Markdown formatting. Inappropriate bios will get your bio removed and purchase revoked.`, null, true);

quills.addShopItem('page', "Personal Webpage", 2500, `A personal webpage on ${config.username}'s site you can use for <em>anything</em>*! Personal pages use Markdown formatting.<br>* Abuse of the personal pages will lead to deletion of the page and having your purchase revoked.`, null, true);

server.addRoute(`/bios.html`, () => {
	let output = '';
	for (let userid in storage.getJSON('bios')) {
		output += `<h2>${userid}</h2><p>${md.toHTML(storage.getJSON('bios')[userid])}</p>`;
	}
	return ['Personalized Bios', output];
});

const pubResolver = (url) => {
	const pageid = url.split('/')[2].slice(0, -5);
	return [`${pageid[0].toUpperCase()}${pageid.slice(1)}`, md.toHTML(storage.getJSON('public-pages')[pageid])];
};

server.addRoute(`/public-page.html`, (url, queryData, tokenData, res) => {
	let pageid = queryData.pageid;
	if (!pageid) return res.end(`Please provide a page name`);

	return [pageid, `<form method="post"><textarea style=width:100%;" rows=50 name="content">${storage.getJSON('public-pages')[pageid] || ''}</textarea><input type="submit" value="Submit changes"/></form>`];
}, {permission: 'publicpage', onPost: (body, tokenData, queryData, res) => {
	let pageid = queryData.pageid;
	if (!pageid) return res.end(`Please provide a page name`);

	if (!storage.getJSON('public-pages')[pageid]) server.addRoute(`/pages/${pageid}.html`, pubResolver);
	const today = new Date();
	storage.getJSON('public-pages')[pageid] = `${body.content}\n###### Last edited by: ${tokenData.user} on ${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`;
	storage.exportJSON('public-pages');
	res.writeHead(301,
		{Location: `${server.url}pages/${pageid}.html`}
	);
	return res.end();
}});

server.addRoute(`/page.html`, (url, queryData, tokenData, res) => {
	let userid = queryData.user;
	if (!userid) return res.end(`Please provide a username.`);

	let output = '';
	if (tokenData) {
		if (tokenData.user !== queryData.user) return res.end(`Mismatching username in token.`);
		output = `<form method="post"><textarea style=width:100%;" rows=50 name="content">${storage.getJSON('personal-pages')[userid] || ''}</textarea><input type="submit" value="Submit changes"/></form>`;
	} else {
		if (!storage.getJSON('personal-pages')[queryData.user]) return res.end(`This user does not have a page.`);
		output = md.toHTML(storage.getJSON('personal-pages')[userid] || '');
	}

	return [`${userid}'s personal page`, output];
}, {permission: 'publicpage', optionalToken: true, onPost: (body, tokenData, queryData, res) => {
	let userid = queryData.user;
	if (!userid) return res.end(`Please provide a username.`);

	storage.getJSON('personal-pages')[userid] = body.content;
	storage.exportJSON('personal-pages');
	res.writeHead(301,
		{Location: `${server.url}page.html?user=${userid}`}
	);
	return res.end();
}});

for (let key in storage.getJSON('public-pages')) {
	server.addRoute(`/pages/${key}.html`, pubResolver);
}

module.exports = {
	commands: {
		async setbio(userid, roomid, message) {
			if (!quills.getAccount(userid).inventory.bio) return this.sendPM(userid, `In order to set a personal bio, you need to purchase it in the [[Scribe Shop <${server.url}shop.html>]].`);
			message = message.trim();
			if (!message) return this.sendPM(userid, `Syntax: \`\`${config.commandToken}setbio message\`\``);

			storage.getJSON('bios')[userid] = message;
			storage.exportJSON('bios');
			return this.sendPM(userid, `Bio successfully set.`);
		},
		async deletebio(userid, roomid, message) {
			if (!this.hasPerms('%')) return this.send(`Permission denied.`);
			message = utils.toId(message);
			if (!(quills.getAccount(message).inventory.bio && storage.getJSON('bios')[userid])) return this.send(`This user does not have a bio set.`);

			delete storage.getJSON('bios')[userid];
			quills.useItem(userid, 'bio');
			storage.exportJSON('bios');
			this.send(`/modnote ${message} had their bio forcibly removed.`);
			return this.send(`Bio removed.`);
		},
		async page(userid, roomid, message) {
			let target = utils.toId(message) || userid;
			if (!quills.getAccount(target).inventory.page) return this.send(`${userid === target ? `You don't have` : `This user doesn't have`} a personal page.`);
		},
		async editpage(userid, roomid, message) {
			message = utils.toId(message);
			if (message) {
				if (!this.hasPerms('@')) return this.sendPM(userid, `Editing public pages requires #. If you meant to update your own personal page, use the command without any arguments.`);

				return this.sendPM(userid, `Edit link for /pages/${message}.html (DO NOT SHARE THIS LINK): ${server.url}public-page.html?pageid=${message}&token=${server.createAccessToken('publicpage', roomid, userid, 180)}`); // Token lasts 3 hours because people might work on their page for a while
			}
			if (!quills.getAccount(userid).inventory.page) return this.sendPM(userid, `In order to get a personal page, you need to purchase it in the [[Scribe Shop <${server.url}shop.html>]].`);

			return this.sendPM(userid, `Edit link for your personal webpage (DO NOT SHARE THIS LINK): ${server.url}page.html?user=${userid}&token=${server.createAccessToken('page', roomid, userid, 180)}`); // Token lasts 3 hours because people might work on their page for a while
		},
		async deletepage(userid, roomid, message) {
			if (!this.hasPerms('%')) return this.send(`Permission denied.`);
			message = utils.toId(message);
			if (!(quills.getAccount(message).inventory.page && storage.getJSON('personal-pages')[userid])) return this.send(`This user does not have a personal page.`);

			delete storage.getJSON('personal-pages')[userid];
			quills.useItem(userid, 'page');
			storage.exportJSON('personal-pages');
			this.send(`/modnote ${message} had their personal page forcibly removed.`);
			return this.send(`Page removed.`);
		},
	},
};

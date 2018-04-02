/*
 * quills.js: Core functionality of the Scribe Shop
 *
 * Handles creating the webserver routes for the Scribe Shop, as well as managing quills, the virtual
 * currency used by the bot.
 */

const config = require('./config');
const utils = require('./utils');

const server = require('./server');
const storage = require('./storage');

const pages = {
	shop: {
		title: "Shop",
		header: "Scribe Shop",
		resolver(context, user, showForm) {
			let ret = `<p>Got some spare quills? This is where you can spend them!</p>\
				<p>Use <code>${config.commandToken}buy [item], [quantity = 1]</code> to purchase something from the shop. Alternatively, you can use <code>${config.commandToken}purchase</code> instead.</p>\
				<p><code>item</code> is the name of the item, and <code>quantity</code> is the amount of the item to purchase (which defaults to 1). For example: <code>${config.commandToken}buy cookie</code></p>\
				<p>If an item has a "Uses" tag, then the item can be redeemed a limited number of times before you run out. Purchasing more of the item will replenish your number of uses.</p>\
				<p><strong>DISCLAIMER:</strong> Purchased items will not be refunded, so please think before you purchase.</p>\
				<br/>\
				<p>Hello, <strong>${user}</strong>! ${context.data[user] ? `You currently have <strong>${context.data[user].balance}</strong> quills to spend.` : "You don't currently have any quills."}</p>`;
			let count = 0;
			context.shop.forEach((item, itemId) => {
				ret += `${count++}. <u>${item.name}</u><br/>\
					Item ID: ${itemId}<br/>\
					Cost: ${item.price} quills<br/>\
					Description: <em>${item.description}</em><br/>\
					${item.uses > 0 ? `Number of uses: ${item.uses}`: ''}`;
					// TODO: Add the form tags if `showForm` is true (called if a token is provided)
			});
			return ret;
		},
	},
	leaderboard: {
		title: "Leaderboard",
		header: "Quills Leaderboard",
		resolver(context, user) {
			let ret = `<p>Here is a list of the users with the highest total amount of quills earned:</p>`;
			let top = Object.entries(context.data).sort((a, b) => b[1].totalEarned - a[1].totalEarned);
			for (let i = 0, len = top.length < 50 ? top.length : 50; i < len; i++) {
				let [userid, account] = top[i];
				ret += `${i + 1}. ${userid === user ? `<strong>${userid}</strong>` : userid} (${account.totalEarned})${i !== len - 1 ? '<br/>' : ''}`;
			}
			return ret;
		},
	},
};

class Quills {
	constructor() {
		this.data = storage.getJSON('quills');
		this.shop = new Map();

		// Add the routes to the webpages.
		for (let [page, pageData] of Object.entries(pages)) {
			server.addRoute(`/${page}.html`, (req, res) => {
				let queryData = utils.parseQueryString(req.url);
				/**
				 * - Leaderboard doesn't need a token; if we still want a userid passed, we can
				 *   possibly append `?userid=NAME` to the end of `req.url` (which would show up)
				 *   in `queryData.userid`.
				 * - Shop doesn't need a token, so we can resort to the method above to still greet
				 *   the user.
				 * - If `req.method` is POST, then pull `item` and `amount` from `req.data`. This is
				 *   where I had the issues, because I wasn't sure if I should have `<input name="item|ITEM ID">`,
				 *   which would allow for the purchasing of multiple items. Same for the amounts, except for `<input name="amount|ITEM ID|AMOUNT">`?
				 * - Otherwise, find `tokenData.user` and still call `pageData.resolver(this, tokenData.user)`.
				 */
			});
		}
	}

	addShopItem(id, name, price, description, uses) {
		if (id in this.shop) {/* do something */}
		this.shop.set(id, {name, price, description, uses});
	}

	getAccount(userid) {
		if (!(userid in this.data)) this.data[userid] = {balance: 0, totalEarned: 0, inventory: {}};
		return this.data[userid];
	}

	addQuills(userid, amount) {
		let account = this.getAccount(userid);
		let balance = account.balance += amount;
		account.totalEarned += amount;
		return balance;
	}

	removeQuills(userid, amount) {
		let account = this.getAccount(userid);
		if (account.balance - amount < 0) amount = account.balance;
		let balance = account.balance -= amount;
		return balance;
	}

	purchase(userid, itemId, amount = 1) {
		if (!(itemId in this.shop)) return `The item "${itemId}" doesn't exist.`;
		let account = this.getAccount(userid);
		let item = this.shop.get(itemId);
		let limited = ('uses' in item);
		if (limited) {
			// Count how many more copies a user needs. If the user already has the item, then find
			// the number of copies they need to return to the maximum number of uses; otherwise, just
			// default to the max number of uses.
			amount = itemId in account.inventory ? (item.uses - account.inventory[itemId].uses) : item.uses;
		}
		if (amount <= 0) return (limited ? `You have the maximum amount of usages for a ${item.name} (${item.uses}).` : "You can't purchase zero (or less) of something...");
		// If the item has a limited number of uses, then we don't multiply the price by the number
		// of copies of the item.
		let price = item.price * (limited ? 1 : amount);
		let exceeding = price > account.balance;
		if (exceeding) {
			// See if we can purchase a fewer amount of the item by decrementing the amount
			// by one each pass. We don't do this if the item is limited because a person,
			// when purchasing an item with uses, cannot end up purchasing less than the maximum
			// number of usages. (That would be scamming them.)
			while (!limited && exceeding && amount > 0) {
				amount--;
				price = item.price * amount;
				exceeding = price > account.balance;
			}
			if (exceeding) {
				return `You don't have enough money to purchase any ${item.name}s.`;
			} else {
				return `You only have enough money to purchase ${amount} ${item.name}${utils.plural(amount)} for ${price} quills.`;
			}
		}
		let balance = this.removeQuills(userid, price);
		if (!(itemId in account.inventory)) account.inventory[itemId] = {};
		let purchased = account.inventory[itemId];
		let itemMessage = '';
		if (!limited) {
			// If an item does not have a limited amount of uses, then a user can purchase
			// more than one of the item.
			if (!('amount' in purchased)) purchased.amount = 0;
			purchased.amount += amount;
			itemMessage = `You now have ${purchased.amount} ${item.name}${utils.plural(purchased.amount)}.`;
		} else {
			purchased.uses = item.uses;
			itemMessage = `You have ${item.uses} available use${utils.plural(item.uses)} for your ${item.name}.`;
		}
		return `Successfully purchased ${amount} ${item.name}${utils.plural(amount)} for ${price} quills. ${itemMessage} New balance: ${balance}`;
	}
}

module.exports = new Quills();

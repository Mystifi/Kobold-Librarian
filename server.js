/*
 * server.js: Webserver for use in plugins
 *
 * Mostly taken from Kid A's webserver (written by bumbadadabum and Morfent), with some tweaks to better suit this bot's usecase.
 */

const path = require('path');
const crypto = require('crypto');

const connect = require('connect');
const serveStatic = require('serve-static');
const bodyParser = require('body-parser');

const config = require('./config');
const utils = require('./utils');

// Init here so eslint doesn't complain.
let server;

class Page {
	constructor(resolver, options = {}) {
		this.resolver = resolver;
		this.permission = options.permission;
		this.onPost = options.onPost;
		this.tokenRequired = this.permission && !options.optionalToken;
	}

	resolve(req, res) {
		let queryData = utils.parseQueryString(req.url);
		let tokenData;
		if (queryData.token) {
			tokenData = server.getAccessToken(queryData.token);
			if (!(tokenData && tokenData.permission === this.permission)) return res.end(`Invalid or expired token provided. Please re-use the command to get a new, valid token.`);
			if (req.method === "POST" && req.body) {
				this.onPost(req.body, tokenData, queryData, res);
			}
		} else if (this.tokenRequired) {
			return res.end(`Usage of this webpage requires a token. Please (re-)enter the command to get a token.`);
		}

		const [title, content] = this.resolver(req.originalUrl, queryData, tokenData, res);

		return res.end(utils.wrapHTML(title, content));
	}
}

class Server {
	constructor(host, port) {
		let protocol = (port === 443) ? 'https' : 'http';
		this.protocol = protocol;
		this.host = host;
		this.port = port;
		this.url = `${protocol}://${host}${protocol === 'http' && port !== 80 ? `:${port}` : ''}/`;

		this.index = path.resolve(__dirname, './public');

		this.isRestarting = false;
		this.restartPending = false;

		this.pages = new Map();
		this.accessTokens = new Map();

		this.init();

		utils.statusMsg(`Webserver started successfully using ${this.protocol} on port ${port}.`);
	}

	// Returns either the HTTP or the HTTPS module depending on whether or not
	// the server is hosted using SSL.
	get nativeProtocolModule() {
		return require(this.protocol);
	}

	// Bootstraps the HTTP/HTTPS server.
	init() {
		// Init the server
		this.site = connect();

		this.addMiddleware(bodyParser.urlencoded({extended: false, type: 'application/x-www-form-urlencoded'}));

		this.site.use(serveStatic(this.index));
		this._server = null;

		// Load all saved pages.
		this.pages.forEach((value, key) => this.site.use(key, value.resolve.bind(value)));

		// Add the middleware for redirecting any unknown requests to a 404
		// error page here, so it can always be the last one added.
		this.site.use((req, res) => {
			let buffer = '<h1>404 Not Found</h1>';
			res.end(buffer);
		});

		let opts = {};

		if (this.protocol === 'https') {
			opts = {
				key: config.sslKey,
				cert: config.sslCert,
				ca: config.sslCa,
			};
			if (!(opts.key && opts.cert && opts.ca)) return utils.errorMsg(`In order to use https, valid SSL information must be provided in the config. The webserver couldn't be started.`);

			if (!this.httpApp) {
				this.httpApp = connect();
				this.httpApp.use((req, res) => {
					res.writeHead(301,
						{Location: this.url + req.url.slice(1)}
					);
					res.end();
				});
				let httpServer = require('http').createServer(this.httpApp);
				httpServer.listen(80);
			}
		}

		if (Object.keys(opts).length) {
			this._server = this.nativeProtocolModule.createServer(opts, this.site);
		} else {
			this._server = this.nativeProtocolModule.createServer(this.site);
		}
		this._server.listen(this.port);
	}

	// configures the routing for the given path using the given function,
	// which dynamically generates the HTML to display on that path.
	addRoute(path, resolver, options) {
		const page = new Page(resolver, options);
		this.pages.set(path, page);
		this.site.use(path, page.resolve.bind(page));
		this.restart();
	}

	removeRoute(path) {
		this.pages.delete(path);
		this.restart();
	}

	// Adds other sorts of middleware to the router.
	addMiddleware(middleware) {
		this.site.use(middleware);
	}

	// Restarts the server.
	restart() {
		if (this.isRestarting) {
			this.restartPending = true;
			return false;
		}
		if (!this._server) return false;

		this.isRestarting = true;
		this._server.close(() => {
			this.init();
			this.isRestarting = false;
			if (this.restartPending) {
				this.restartPending = false;
				this.restart();
			}
		});
	}

	createAccessToken(permission, roomid, userid, mins = 60) {
		const token = crypto.randomBytes(5).toString('hex');
		const tokenData = {
			expiration: mins * 1000 * 60,
			permission: permission,
			room: roomid,
			user: userid,
		};
		tokenData.timeout = setTimeout(() => this.removeAccessToken(token), tokenData.expiration);
		this.accessTokens.set(token, tokenData);
		return token;
	}

	getAccessToken(token) {
		let data = this.accessTokens.get(token);
		if (data) {
			clearTimeout(data.timeout);
			setTimeout(() => this.removeAccessToken(token), data.expiration);
			return data;
		}
		return false;
	}

	removeAccessToken(token) {
		let data = this.accessTokens.get(token);
		if (data) {
			clearTimeout(data.timeout);
			return this.accessTokens.delete(token);
		}
		return false;
	}
}

server = new Server(config.serverhost, config.serverport);
module.exports = server;

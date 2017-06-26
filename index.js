'use strict';
const _ = require('lodash');
const request = require('request-promise-native');
const crypto = require('crypto');
const debug = require('debug');
const d = debug('cexio');
const querystring = require('querystring');

const defaultOptions = {
    baseUrl: 'https://cex.io/api/',
    headers: {
        'User-Agent': 'Mozilla/4.0 (Node.js CEXIO client)',
        'Content-Type': 'application/x-www-form-urlencoded'
    }
};

class CEXIO {

    constructor({ ccy1, ccy2, clientId, key, secret } = {}) {
        this.clientId = clientId || process.env.CEXIO_CLIENT_ID;
        this.key      = key      || process.env.CEXIO_KEY;
        this.secret   = secret   || process.env.CEXIO_SECRET;
        this.ccy1     = ccy1     || process.env.CEXIO_CCY_1;
        this.ccy2     = ccy2     || process.env.CEXIO_CCY_2;
    }

    _get (url, qs) {
        const requestParams = Object.assign({}, defaultOptions, {
            qs,
            url,
            json: true
        });
        d('GET: ');
        d(requestParams);

        return request(requestParams);
    }

    _getPair (url, qs, ccy1 = this.ccy1, ccy2 = this.ccy2) {
        return this._get([url, ccy1, ccy2].join('/') + '/', qs);
    }

    _post (url, body) {
        const requestParams = Object.assign({}, defaultOptions, {
            body,
            url,
            json: true
        });
        requestParams.headers = Object.assign({},
            requestParams.headers,
            { 'Content-Length': body.length }
        );

        d(requestParams);

        try {
            return request.post(requestParams);
        } catch(e) {
            console.error(e);
        }
    }

    _postPair (url, body, ccy1 = this.ccy1, ccy2 = this.ccy2) {
        return this._postAuth([url, ccy1, ccy2].join('/'), body);
    }

    // PUBLIC API
    currencyLimits() {
        return this._get('currency_limits');
    }

    ticker() {
        return this._getPair('ticker');
    }

    lastPrice() {
        return this._getPair('last_price');
    }

    convert(amnt, ccy1, ccy2) {
        return this._postPair('convert', { amnt }, ccy1, ccy2);
    }

    priceStats(lastHours = 24, maxItems = 200, ccy1, ccy2) {
        return this._postPair('price_stats', { lastHours, maxRespArrSize: maxItems }, ccy1, ccy2);
    }

    ohlcv(dateString, ccy1, ccy2) {
        return this._getPair(`ohlcv/hd/${ dateString }`, ccy1, ccy2);
    }

    orderBook(depth, ccy1, ccy2) {
        return this._getPair('order_book', { depth }, ccy1, ccy2);
    }

    // PRIVATE API
    _postAuth (path, params) {
        d(path);
        d(params);

        const nonce = Date.now();

        params = Object.assign({ nonce, key: this.key }, params);

        const message = nonce.toString() + this.clientId + this.key;
        const hmac = crypto.createHmac('sha256', new Buffer(this.secret));
        hmac.update(message);

        params.signature = hmac.digest("hex").toUpperCase();
        return this._post(path, querystring.stringify(params));
    }

    _postAuthPair (path, params, ccy1 = this.ccy1, ccy2 = this.ccy2) {
        return this._postAuth([path, ccy1, ccy2].join('/'), params);
    }

    balance() {
        return this._postAuth('balance/');
    }

    openOrders(ccy1, ccy2) {
        if (ccy1 && ccy2) {
            return this._postAuthPair('open_orders', undefined, ccy1, ccy2);
        }
        return this._postAuth('open_orders');
    }

    activeOrdersStatus(orderList) {
        return this._postAuth('active_orders_status', orderList);
    }

    async openPositions(ccy1 = this.ccy1, ccy2 = this.ccy2) {
        const result = await this._postAuthPair('open_positions', undefined, ccy1, ccy2);

        if (!result || result.ok !== 'ok') {
            const err = new Error('Could not get open positions');
            err.data = result;
            throw err;
        }

        return parseObjectStrings(result.data);
    }

    closePosition(id, ccy1 = this.ccy1, ccy2 = this.ccy2) {
        return this._postAuthPair('close_position', { id }, ccy1, ccy2);
    }

    async openPosition(args) {
        const {
            amount,
            symbol = this.ccy1,
            msymbol = this.ccy1,
            ptype = 'long',
            anySlippage = true,
            leverage = 3,
            eoprice,
            stopLossPrice
        } = args;

        const params = {
            amount: maxDpStr(String(amount)),
            symbol,
            msymbol,
            ptype: ptype.toLowerCase(),
            anySlippage: anySlippage ? 'true' : 'false',
            leverage: String(leverage),
            eoprice: maxDpStr(String(eoprice)),
            stopLossPrice: maxDpStr(stopLossPrice ? String(stopLossPrice) : undefined)
        };

        const result = await this._postAuthPair('open_position', params);

        if (!result || result.ok !== 'ok') {
            const err = new Error('Could not open position');
            err.data = result;
            throw err;
        }

        return parseObjectStrings(result.data);
    }
}

module.exports = CEXIO;

function maxDpStr(str = '', dp = 8) {
    const val = parseFloat(str);
    if (val !== val) { return str; } // NaN
    return sprintf(`%.${ dp }f`, val);
}

function parseObjectStrings(val) {
    if (_.isArray(val)) {
        return val.map(parseObjectStrings);
    } else if (_.isObject(val)) {
        return _.mapValues(val, parseObjectStrings);
    } else if (typeof val === 'string') {
        return transformString(val);
    }
    return val;
}

function transformString(val) {
    const floatVal = parseFloat(val);
    if (floatVal === floatVal) { // !NaN
        return floatVal;
    }
    return val;
}

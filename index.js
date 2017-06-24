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
        d(requestParams);

        return request(requestParams);
    }

    _getPair (url, qs, ccy1 = this.ccy1, ccy2 = this.ccy2) {
        return this._get([url, ccy1, ccy2].join('/'), qs);
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

        const res = result.data.map(pos =>
            _.mapValues(pos, val => {
                const floatVal = parseFloat(val);
                if (floatVal === floatVal) { // !NaN
                    return floatVal;
                }
                return val;
            })
        );

        return res;
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
            amount: max8dp(String(amount)),
            symbol,
            msymbol,
            ptype: ptype.toLowerCase(),
            anySlippage: anySlippage ? 'true' : 'false',
            leverage: String(leverage),
            eoprice: max8dp(String(eoprice)),
            stopLossPrice: max8dp(stopLossPrice ? String(stopLossPrice) : undefined)
        };

        const result = await this._postAuthPair('open_position', params);

        if (!result || result.ok !== 'ok') {
            const err = new Error('Could not open position');
            err.data = result;
            throw err;
        }

        const res = _.mapValues(result.data, val => {
            const floatVal = parseFloat(val);
            if (floatVal === floatVal) { // !NaN
                return floatVal;
            }
            return val;
        });

        return res;
    }
}

module.exports = CEXIO;

function max8dp(str) {
    if (str.indexOf('.') === -1) {
        return str;
    }
    const dp = str.length - str.indexOf('.') - 1;

    if (dp <= 8) {
        return str;
    }

    return str.slice(0, str.indexOf('.') + 9);
}

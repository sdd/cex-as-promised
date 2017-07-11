'use strict';
const _ = require('lodash');
const request = require('request-promise');
const retry = require('p-retry');
const crypto = require('crypto');
const debug = require('debug');
const d = debug('cexio');
const sprintf = require('qprintf').sprintf;
const querystring = require('querystring');

const defaultReqOptions = {
    baseUrl: 'https://cex.io/api/',
    headers: {
        'User-Agent': 'Mozilla/4.0 (Node.js CEXIO client)',
        'Content-Type': 'application/x-www-form-urlencoded'
    },
    json: true
};

const defaultRetryOptions = {
    retries: 10,
    factor: 2,
    minTimeout: 500,
    maxTimeout: 10000
};

class CEXIO {

    constructor({ ccy1, ccy2, clientId, key, secret, retryOptions = {} } = {}, req) {
        this.clientId = clientId || process.env.CEXIO_CLIENT_ID;
        this.key      = key      || process.env.CEXIO_KEY;
        this.secret   = secret   || process.env.CEXIO_SECRET;
        this.ccy1     = ccy1     || process.env.CEXIO_CCY_1;
        this.ccy2     = ccy2     || process.env.CEXIO_CCY_2;

        const retryParams = Object.assign({}, defaultRetryOptions, retryOptions);
        this.req = req || (params => retry(() => request(params), retryParams));
    }

    async _get (url, qs) {
        const requestParams = Object.assign({}, defaultReqOptions, { qs, url });
        d(requestParams);

        const res = await this.req(_.omitBy(requestParams, _.isUndefined));
        if (!res || (res.ok && res.ok !== 'ok')) { throw new Error('result not ok'); }
        return parseObjectStrings(res.data ? res.data : res);
    }

    _getPair (url, qs, ccy1 = this.ccy1, ccy2 = this.ccy2) {
        return this._get([url, ccy1, ccy2].join('/'), qs);
    }

    _post (url, body) {
        const requestParams = Object.assign({}, defaultReqOptions, { body, url, method: 'POST' });

        requestParams.headers = Object.assign({},
            requestParams.headers,
            { 'Content-Length': body.length }
        );

        d(requestParams);

        return this.req(_.omitBy(requestParams, _.isUndefined));
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

    async lastPrice() {
        const res = await this._getPair('last_price');
        if (!res || !res.lprice) {
            throw new Error('Unexpected response');
        }
        return parseFloat(res.lprice);
    }

    async convert(amnt, ccy1, ccy2) {
        const res = await this._postPair('convert', { amnt: maxDpStr(amnt) }, ccy1, ccy2);
        if (!res || !res.amnt) {
            throw new Error('Unexpected response');
        }
        return parseFloat(res.amnt);
    }

    async priceStats(lastHours = 24, maxItems = 200, ccy1, ccy2) {
        const result = await this._postPair('price_stats', { lastHours, maxRespArrSize: maxItems }, ccy1, ccy2);
        return parseObjectStrings(result);
    }

    async ohlcv(dateString, ccy1, ccy2) {
        const result = await this._getPair(`ohlcv/hd/${ dateString }`, ccy1, ccy2);

        if (!result) {
            const err = new Error('Could not get open orders');
            err.data = result;
            throw err;
        }

        return {
            time: result.time,
            data1m: JSON.parse(result.data1m)
        };
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

        params.signature = hmac.digest('hex').toUpperCase();
        return this._post(path, querystring.stringify(params));
    }

    _postAuthPair (path, params, ccy1 = this.ccy1, ccy2 = this.ccy2) {
        return this._postAuth([path, ccy1, ccy2].join('/'), params);
    }

    async balance() {
        const result = await this._postAuth('balance/');

        if (!result) {
            const err = new Error('Could not get open orders');
            err.data = result;
            throw err;
        }

        return parseObjectStrings(result);
    }

    async openOrders(ccy1, ccy2) {
        if (ccy1 && ccy2) {
            return this._postAuthPair('open_orders', undefined, ccy1, ccy2);
        }
        const result = await this._postAuth('open_orders');

        if (!result) {
            const err = new Error('Could not get open orders');
            err.data = result;
            throw err;
        }

        return parseObjectStrings(result);
    }

    async activeOrdersStatus(orderList) {
        const result = await this._postAuth('active_orders_status', { orders_list: orderList });

        if (!result || result.ok !== 'ok') {
            const err = new Error('Could not get active order statuses');
            err.data = result;
            throw err;
        }

        return parseObjectStrings(result.data);
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

    async closePosition(id, ccy1 = this.ccy1, ccy2 = this.ccy2) {
        const result = await this._postAuthPair('close_position', { id }, ccy1, ccy2);

        if (!result || result.ok !== 'ok') {
            const err = new Error('Could not close position');
            err.data = result;
            throw err;
        }

        return parseObjectStrings(result.data);
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

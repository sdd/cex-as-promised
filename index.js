'use strict';
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
        console.log(url);
        const requestParams = Object.assign({}, defaultOptions, {
            qs,
            url
        });
        return request(requestParams)
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
        requestParams.headers['Content-Length'] = body.length;

        d(requestParams);

        try {
            return request.post(requestParams);
        } catch(e) {
            console.error(e);
        }
    }

    _postPair (url, body, ccy1 = this.ccy1, ccy2 = this.cct2) {
        return this._post([url, ccy1, ccy2].join('/'), body);
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

    priceStats(hours = 24, maxItems = 200, ccy1, ccy2) {
        return this._postPair('price_stats', { hours, maxRespArrSize: maxItems }, ccy1, ccy2);
    }

    ohlcv(dateString, ccy1, ccy2) {
        return this._getPair(`ohlcv/hd/${ dateString }`, ccy1, ccy2);
    }

    orderBook(depth, ccy1, ccy2) {
        return this._getPair('order_book', { depth }, ccy1, ccy2);
    }

    // PRIVATE API
    _postAuth (path, params) {
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
            return this._postAuthPair('open_orders', ccy1, ccy2);
        }
        return this._postAuth('open_orders');
    }

    activeOrdersStatus(orderList) {
        return this._postAuth('active_orders_status', orderList);
    }

    openPositions(ccy1 = this.ccy1, ccy2 = this.ccy2) {
        return this._postAuthPair('open_positions', ccy1, ccy2);
    }

    closePosition(id, ccy1 = this.ccy1, ccy2 = this.ccy2) {
        return this._postAuthPair('close_position', { id }, ccy1, ccy2);
    }

    openPosition(args) {
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
            amount: String(amount),
            symbol,
            msymbol,
            ptype: ptype.toLowerCase(),
            anySlippage: anySlippage ? 'true' : 'false',
            leverage: String(leverage),
            eoprice: String(eoprice),
            stopLossPrice: stopLossPrice ? String(stopLossPrice) : undefined
        };

        return this._postAuthPair('open_position', params);
    }
}

module.exports = CEXIO;

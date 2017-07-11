import test from 'ava';
import nock from 'nock';
import crypto from 'crypto';

import CEXIO from './';

const reqHeaders = {
    "User-Agent": "Mozilla/4.0 (Node.js CEXIO client)",
    "Content-Type": "application/x-www-form-urlencoded"
};

const key = 'key';
const clientId = 'clientId';
const secret = 'intergalactic space badgers';

const defaultCreationArgs = {
    ccy1: 'BTC',
    ccy2: 'EUR',
    clientId,
    key,
    secret,
    retryOptions: {
        retries: 1
    }
};

function checkSignature(body) {
    const { nonce, key } = body;

    const message = nonce.toString() + clientId + key;
    const hmac = crypto.createHmac('sha256', new Buffer(secret));

    hmac.update(message);

    return hmac.digest('hex').toUpperCase();
}

test('currencyLimits() queries the correct URL and maps the response', async t => {

    nock('https://cex.io', reqHeaders)
        .get('/api/currency_limits')
        .reply(200, {
            'e': 'currency_limits',
            'data': {
                'pairs': [
                    {
                        'minPrice': '1',
                        'symbol2': 'USD',
                        'minLotSize': 0.01,
                        'minLotSizeS2': 2.5,
                        'maxPrice': '4096',
                        'symbol1': 'BTC'
                    }
                ]
            },
            'ok': 'ok'
        });

    const subject = new CEXIO(defaultCreationArgs);

    const res = await subject.currencyLimits();

    const expected = {
            'pairs': [
            {
                'minPrice': 1,
                'symbol2': 'USD',
                'minLotSize': 0.01,
                'minLotSizeS2': 2.5,
                'maxPrice': 4096,
                'symbol1': 'BTC'
            }
        ]
    };

    t.deepEqual(res, expected);
});

test('ticker() queries the correct URL and maps the response', async t => {

    nock('https://cex.io', reqHeaders)
    .get('/api/ticker/BTC/EUR')
    .reply(200, {
        timestamp: "1499370848",
        low: "2638.457",
        high: "2690",
        last: "2662.1244",
        volume: "261.09267202",
        volume30d: "26444.31661927",
        bid: 2662.1245,
        ask: 2662.9991
    });


    const subject = new CEXIO(defaultCreationArgs);

    const res = await subject.ticker();

    const expected = {
        timestamp: 1499370848,
        low: 2638.457,
        high: 2690,
        last: 2662.1244,
        volume: 261.09267202,
        volume30d: 26444.31661927,
        bid: 2662.1245,
        ask: 2662.9991
    };

    t.deepEqual(res, expected);
});

test('lastPrice() queries the correct URL', async t => {

    nock('https://cex.io', reqHeaders)
    .get('/api/last_price/BTC/EUR')
    .reply(200, {
        "curr1": "BTC",
        "curr2": "USD",
        "lprice": "400.00"
    });

    const subject = new CEXIO(defaultCreationArgs);

    const res = await subject.lastPrice();

    const expected = 400;

    t.deepEqual(res, expected);
});

test('convert() queries the correct URL', async t => {

    nock('https://cex.io', reqHeaders)
    .post('/api/convert/BTC/EUR', body => {
        t.deepEqual(body.signature, checkSignature(body));
        t.deepEqual(body.amnt, '2.50000000');
        return true;
    })
    .reply(200, {
        "amnt": "1000.00"
    });

    const subject = new CEXIO(defaultCreationArgs);

    const res = await subject.convert(2.5, 'BTC', 'EUR');

    const expected = 1000;

    t.deepEqual(res, expected);
});

test('priceStats() queries the correct URL', async t => {

    nock('https://cex.io', reqHeaders)
    .post('/api/price_stats/BTC/EUR', body => {
        t.deepEqual(body.signature, checkSignature(body));
        t.deepEqual(body.lastHours, '24');
        t.deepEqual(body.maxRespArrSize, '100');
        return true;
    })
    .reply(200, [
        {
            "tmsp": "1411985700",
            "price": "400.00"
        },
        {
            "tmsp": "1412072100",
            "price": "380.00"
        }
    ]);

    const subject = new CEXIO(defaultCreationArgs);

    const res = await subject.priceStats(24, 100, 'BTC', 'EUR');

    const expected = [
        {
            tmsp: 1411985700,
            price: 400
        },
        {
            tmsp: 1412072100,
            price: 380
        }
    ];

    t.deepEqual(res, expected);
});

test('ohlcv() queries the correct URL', async t => {

    nock('https://cex.io', reqHeaders)
    .get('/api/ohlcv/hd/20160228/BTC/EUR')
    .reply(200, {
        "time":20160228,
        "data1m":` [
            [1456617600, 434.3867, 434.3867, 433.781, 433.781, 4.15450000],
            [1456617660, 433.747, 433.747, 433.7306, 433.7306, 3.00010001],
            [1456617720, 433.7302, 433.7302, 433.73, 433.73, 0.46760000]
        ]`
    });

    const subject = new CEXIO(defaultCreationArgs);

    const res = await subject.ohlcv('20160228');

    const expected = {
        "time":20160228,
        "data1m": [
            [1456617600, 434.3867, 434.3867, 433.781, 433.781, 4.15450000],
            [1456617660, 433.747, 433.747, 433.7306, 433.7306, 3.00010001],
            [1456617720, 433.7302, 433.7302, 433.73, 433.73, 0.46760000]
        ]
    };

    t.deepEqual(res, expected);
});

test('orderBook() queries the correct URL', async t => {

    nock('https://cex.io', reqHeaders)
    .get('/api/order_book/BTC/EUR?depth=1')
    .reply(200, {
        "timestamp":1459161809,
        "bids":[[250.00,0.02000000]],
        "asks":[[280.00,20.51246433]],
        "pair":"BTC:USD",
        "id":66478,
        "sell_total":'707.40555590',
        "buy_total":'68788.80'
    });

    const subject = new CEXIO(defaultCreationArgs);

    const res = await subject.orderBook(1);

    const expected = {
        "timestamp":1459161809,
        "bids":[[250.00,0.02000000]],
        "asks":[[280.00,20.51246433]],
        "pair":"BTC:USD",
        "id":66478,
        "sell_total":707.40555590,
        "buy_total":68788.80
    };

    t.deepEqual(res, expected);
});


test('balance() queries the correct URL', async t => {

    nock('https://cex.io', reqHeaders)
    .post('/api/balance/', body => {
        t.deepEqual(body.signature, checkSignature(body));
        return true;
    })
    .reply(200, {
        ETH: {
            'available': '1412',
            'orders': '38.00',
            'bonus': '38.00'
        },
        USD: {
            'available': '141207',
            'orders': '380.00',
            'bonus': '380.00'
        },
    });

    const subject = new CEXIO(defaultCreationArgs);

    const res = await subject.balance();

    const expected = {
        ETH: {
            available: 1412,
            orders: 38.00,
            bonus: 38.00
        },
        USD: {
            available: 141207,
            orders: 380.00,
            bonus: 380.00
        },
    };

    t.deepEqual(res, expected);
});


test('openOrders() queries the correct URL', async t => {

    nock('https://cex.io', reqHeaders)
    .post('/api/open_orders', body => {
        t.deepEqual(body.signature, checkSignature(body));
        return true;
    })
    .reply(200, [
        {
            "id": "13837040",
            "time": "1460020144872",
            "type": "sell",
            "price": "411.626",
            "amount": "1.00000000",
            "pending": "1.00000000",
            "symbol1": "BTC",
            "symbol2": "EUR"
        },
        {
            "id": "16452929",
            "time": "1462355019816",
            "type": "buy",
            "price": "400",
            "amount": "1.00000000",
            "pending": "1.00000000",
            "symbol1": "BTC",
            "symbol2": "USD"
        }
    ]);

    const subject = new CEXIO(defaultCreationArgs);

    const res = await subject.openOrders();

    const expected = [
        {
            id: 13837040,
            time: 1460020144872,
            type: 'sell',
            price: 411.626,
            amount: 1.00000000,
            pending: 1.00000000,
            symbol1: 'BTC',
            symbol2: 'EUR'
        },
        {
            id: 16452929,
            time: 1462355019816,
            type: 'buy',
            price: 400,
            amount: 1.00000000,
            pending: 1.00000000,
            symbol1: 'BTC',
            symbol2: 'USD'
        }
    ];

    t.deepEqual(res, expected);
});


test('activeOrderStatus() queries the correct URL', async t => {

    nock('https://cex.io', reqHeaders)
    .post('/api/active_orders_status', body => {
        t.deepEqual(body.signature, checkSignature(body));
        t.deepEqual(body.orders_list, [
            '8550492',
            '8550495',
            '8550497'
        ]);
        return true;
    })
    .reply(200, {
        e: 'active_orders_status',
        ok: 'ok',
        data: [
            [ '8550408', '0', '0' ],
            [ '8550495', '0.02000000', '0.02000000' ],
            [ '8550497', '0.04000000', '0.02700000' ]
        ]
    });

    const subject = new CEXIO(defaultCreationArgs);

    const res = await subject.activeOrdersStatus([
        '8550492',
        '8550495',
        '8550497'
    ]);

    const expected = [
        [ 8550408, 0, 0 ],
        [ 8550495, 0.02000000, 0.02000000 ],
        [ 8550497, 0.04000000, 0.02700000 ]
    ];

    t.deepEqual(res, expected);
});


test('openPositions() queries the correct URL', async t => {

    nock('https://cex.io', reqHeaders)
    .post('/api/open_positions/BTC/EUR', body => {
        t.deepEqual(body.signature, checkSignature(body));
        return true;
    })
    .reply(200, {
        'e': 'open_positions',
        'ok': 'ok',
        'data': [
            {
                'user': 'ud100036721',
                'id': '104102',
                'otime': 1475602208467,
                'symbol': 'BTC',
                'amount': '1.00000000',
                'leverage': '2',
                'ptype': 'long',
                'psymbol': 'BTC',
                'msymbol': 'USD',
                'lsymbol': 'USD',
                'pair': 'BTC:USD',
                'oprice': '607.5000',
                'stopLossPrice': '520.3232',

                'ofee': '1',
                'pfee': '3',
                'cfee': '4',
                'tfeeAmount': '3.04',

                'pamount': '1.00000000',
                'omamount': '303.75',
                'lamount': '303.75',

                'oorder': '34106774',
                'rinterval': '14400000',

                'dfl': '520.32320000',
                'slamount': '520.33',
                'slremains': '520.33',
                'lremains': '303.75',
                'flPrice': '303.75000000',
                'a:BTC:c': '1.00000000',
                'a:BTC:s': '1.00000000',
                'a:USD:cds': '610.54',
            }
        ]
    });

    const subject = new CEXIO(defaultCreationArgs);

    const res = await subject.openPositions();

    const expected = [
        {
            'user': 'ud100036721',
            'id': 104102,
            'otime': 1475602208467,
            'symbol': 'BTC',
            'amount': 1.00000000,
            'leverage': 2,
            'ptype': 'long',
            'psymbol': 'BTC',
            'msymbol': 'USD',
            'lsymbol': 'USD',
            'pair': 'BTC:USD',
            'oprice': 607.5000,
            'stopLossPrice': 520.3232,

            'ofee': 1,
            'pfee': 3,
            'cfee': 4,
            'tfeeAmount': 3.04,

            'pamount': 1.00000000,
            'omamount': 303.75,
            'lamount': 303.75,

            'oorder': 34106774,
            'rinterval': 14400000,

            'dfl': 520.32320000,
            'slamount': 520.33,
            'slremains': 520.33,
            'lremains': 303.75,
            'flPrice': 303.75000000,
            'a:BTC:c': 1.00000000,
            'a:BTC:s': 1.00000000,
            'a:USD:cds': 610.54
        }
    ];

    t.deepEqual(res, expected);
});


test('closePosition() queries the correct URL', async t => {

    nock('https://cex.io', reqHeaders)
    .post('/api/close_position/BTC/EUR', body => {
        t.deepEqual(body.signature, checkSignature(body));
        t.deepEqual(body.id, '104034');
        return true;
    })
    .reply(200, {
        'e': 'close_position',
        'ok': 'ok',
        'data': {
            'id': 104034,
            'ctime': 1475484981063,
            'ptype': 'long',
            'msymbol': 'USD',
            'pair': {
                'symbol1': 'BTC',
                'symbol2': 'USD'
            },
            'price': '607.1700',
            'profit': '-12.48'
        }
    });

    const subject = new CEXIO(defaultCreationArgs);

    const res = await subject.closePosition(104034);

    const expected = {
        'id': 104034,
        'ctime': 1475484981063,
        'ptype': 'long',
        'msymbol': 'USD',
        'pair': {
            'symbol1': 'BTC',
            'symbol2': 'USD'
        },
        'price': 607.1700,
        'profit': -12.48
    };

    t.deepEqual(res, expected);
});


test('openPosition() queries the correct URL', async t => {

    nock('https://cex.io', reqHeaders)
    .post('/api/open_position/BTC/EUR', body => {
        t.deepEqual(body.signature, checkSignature(body));
        t.deepEqual(body.amount, '1.00000000');
        t.deepEqual(body.symbol, 'BTC');
        t.deepEqual(body.leverage, '2');
        t.deepEqual(body.ptype, 'long');
        t.deepEqual(body.anySlippage, 'true');
        t.deepEqual(body.eoprice, '650.32320000');
        t.deepEqual(body.stopLossPrice, '650.32320000');
        return true;
    })
    .reply(200, {
        'e': 'open_position',
        'ok': 'ok',
        'data': {
            'id': 104034,
            'otime': 1475484979608,

            'psymbol': 'BTC',
            'msymbol': 'USD',
            'lsymbol': 'USD',
            'pair': {
                'symbol1': 'BTC',
                'symbol2': 'USD',
            },
            'pamount': '1.00000000',
            'omamount': '303.99',
            'lamount': '303.99',
            'oprice': '607.9800',
            'ptype': 'long',
            'stopLossPrice': '520.3232',

            'pfee': '3',
            'cfee': '4',
            'tfeeAmount': '3.04'
        }
    });

    const subject = new CEXIO(defaultCreationArgs);

    const args = {
        amount: 1,
        ptype: 'long',
        leverage: 2,
        eoprice: 650.3232,
        stopLossPrice: 650.3232
    };

    const res = await subject.openPosition(args);

    const expected = {
        'id': 104034,
        'otime': 1475484979608,

        'psymbol': 'BTC',
        'msymbol': 'USD',
        'lsymbol': 'USD',
        'pair': {
            'symbol1': 'BTC',
            'symbol2': 'USD',
        },
        'pamount': 1,
        'omamount': 303.99,
        'lamount': 303.99,
        'oprice': 607.9800,
        'ptype': 'long',
        'stopLossPrice': 520.3232,

        'pfee': 3,
        'cfee': 4,
        'tfeeAmount': 3.04
    };

    t.deepEqual(res, expected);
});

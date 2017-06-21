# cex-as-promised

Promised-based CEX.io API client

Can be configured by environment vars as well as object passed to constructor


```javascript

const CEXIO = require('cex-as-promised');

const cexio = new CEXIO({
	clientId: 'cex client',
	key: 'Ive got the key',
	secret: 'Ive got the secret',
	ccy1: 'BTC',
	ccy2: 'EUR'
});

// or pass any combination of the fields above and the following env vars:


CEXIO_CLIENT_ID;
CEXIO_KEY;
CEXIO_SECRET;
CEXIO_CCY_1;
CEXIO_CCY_2;

```

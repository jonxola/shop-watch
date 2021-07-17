import EventEmitter from 'events';
import { setTimeout as sleep } from 'timers/promises';
import axios from 'axios';

export default class Monitor extends EventEmitter {
    constructor({ url, delay, timeout = 0, proxies = [] }) {
        super();
        this.url = new URL(url).origin;
        this.delay = delay;
        this.products = [];
        
        // configure request client
        this.client = axios.create({
            baseURL: this.url,
            timeout: timeout,
            headers: {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
                'accept-language': 'en-US,en;q=0.9',
                'cache-control': 'no-cache',
                'pragma': 'no-cache',
                'sec-fetch-dest': 'document',
                'sec-fetch-mode': 'navigate',
                'sec-fetch-site': 'none',
                'sec-fetch-user': '?1',
                'upgrade-insecure-requests': '1',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
            }
        });

        // attach a random proxy to requests
        this.client.interceptors.request.use(config => {
            if (proxies.length) {
                const proxy = proxies[Math.floor(Math.random() * proxies.length)];
                const [host, port] = proxy.split(':');
                if (host && port) {
                    config.proxy = { protocol: 'http', host, port };
                }
            }
            return config;
        }, null, { synchronous: true });
    }

    // fetch the most recently published products
    async getProducts() {
        const res = await this.client.get(`/products.json?limit=100`);
        return res.data.products;
    }

    async start() {
        try {
            console.log(`Starting monitor @ ${this.url} ...`);
            this.products = await this.getProducts();
            await sleep(this.delay);
            this.refresh();
        } catch (error) {
            console.error(`Monitor @ ${this.url} failed to start. | ${error.message} | Retrying...`);
            await sleep(this.delay);
            this.start();
        }
    }

    // update product list and find changes
    async refresh() {
        try {
            const newProducts = await this.getProducts();
            const newData = [...newProducts];

            for (const product of this.products) {
                // find matching product in the new data set
                const matchIndex = newData.findIndex(p => p.id === product.id);
                if (matchIndex != -1) {
                    const match = newData[matchIndex];
                    if (product.updated_at != match.updated_at) {
                        // something about the product is new
                        this.checkRestock(product, match);
                    }
                    // done with this product's data
                    newData.splice(matchIndex, 1);
                }
            }

            // any remaining data belongs to new products
            if (newData.length) {
                for (const product of newData) {
                    this.emit('new-product', product);
                }
            }

            // update the product list
            this.products = [...newProducts];
        } catch (error) {
            console.error(`Monitor @ ${this.url} failed to refresh. | ${error.message} | Retrying...`);
        }

        await sleep(this.delay);
        this.refresh();
    }

    checkRestock(oldProduct, newProduct) {
        for (const oldVariant of oldProduct.variants) {
            // find matching variants between old and new product data
            const newVariant = newProduct.variants.find(v => v.id == oldVariant.id);
            // if any variant was restocked, send a message
            if (!oldVariant.available && newVariant.available) {
                this.emit('restock', newProduct);
                break;
            }
        }
    }
}
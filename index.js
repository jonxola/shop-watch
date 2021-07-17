import fs from 'fs';
import stamp from 'console-stamp';
import toml from 'toml';
import axios from 'axios';

import Monitor from './Monitor.js';

stamp(console);
const settings = toml.parse(fs.readFileSync('settings.toml').toString());
const proxies = fs.readFileSync('proxies.txt').toString().split('\n').filter(p => p.trim() != '');

async function alert(description, color, site, product) {
    try {
        await axios.post(settings.webhook, {
            embeds: [{
                color: color,
                title: product.title,
                description: description,
                url: `${site}/products/${product.handle}`,
                author: {
                    name: site,
                    url: site,
                    icon_url: `${site}/favicon.ico`
                },
                thumbnail: {
                    url: product.images[0] ? product.images[0].src : 'https://i.imgur.com/8UdKNS4.jpeg'
                },
                fields: product.variants.map(variant => ({
                    inline: true,
                    name: variant.title,
                    value: variant.available ? 'In stock' : 'Out of stock'
                }))
            }]
        });
    } catch (error) {
        console.error(`Failed to post to webhook. | ${error}`);
    }
}

for (const url of settings.sites) {
    const monitor = new Monitor({
        url,
        proxies,
        delay: settings.delay,
        timeout: settings.timeout
    });

    monitor.on('new-product', product => {
        alert('New Product Available', settings.colors.new, monitor.url, product);
    });
    
    monitor.on('restock', product => {
        alert('Product Restocked', settings.colors.restock, monitor.url, product);
    });

    monitor.start();
}
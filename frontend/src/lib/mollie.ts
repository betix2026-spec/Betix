/**
 * BETIX — Mollie REST Client (native Node.js https)
 * Bypasses the @mollie/api-client SDK, whose global fetch gets intercepted by Turbopack.
 * Uses Node.js's https module, confirmed working in the local environment.
 */

import https from 'https';

const MOLLIE_BASE = 'api.mollie.com';
const API_KEY = process.env.MOLLIE_API_KEY;

if (!API_KEY) {
    throw new Error('[Mollie] Missing MOLLIE_API_KEY environment variable');
}

/** Effectue un appel REST Mollie via https natif de Node.js */
async function mollieRequest<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: Record<string, unknown>
): Promise<T> {
    return new Promise((resolve, reject) => {
        const bodyStr = body ? JSON.stringify(body) : '';

        // Sanitise path: trim whitespace/newlines that cause "unescaped characters" errors
        const safePath = `/v2${path}`.replace(/[\s\r\n]+/g, '');

        const options = {
            hostname: MOLLIE_BASE,
            port: 443,
            path: safePath,
            method,
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(bodyStr),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(`[Mollie ${res.statusCode}] ${parsed.detail || parsed.title || data}`));
                    } else {
                        resolve(parsed as T);
                    }
                } catch (e) {
                    reject(new Error(`[Mollie] Invalid JSON response: ${data}`));
                }
            });
        });

        req.on('error', (e) => reject(new Error(`[Mollie] Network error: ${e.message}`)));

        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

/** API Clients */
export const mollieClient = {
    customers: {
        create: (data: { name: string; email: string; metadata?: string }) =>
            mollieRequest<{ id: string }>('POST', '/customers', data),
    },
    payments: {
        create: (data: Record<string, unknown>) =>
            mollieRequest<{ id: string; _links: { checkout?: { href: string } } }>('POST', '/payments', data),
        get: (id: string) =>
            mollieRequest<{
                id: string;
                status: string;
                sequenceType: string;
                customerId: string;
                metadata: string;
            }>('GET', `/payments/${id}`),
    },
    customerSubscriptions: {
        create: (data: Record<string, unknown> & { customerId: string }) => {
            const { customerId, ...rest } = data;
            return mollieRequest<{ id: string }>('POST', `/customers/${customerId}/subscriptions`, rest);
        },
        get: (subscriptionId: string, opts: { customerId: string }) =>
            mollieRequest<{
                id: string;
                status: string;
                amount: { value: string; currency: string };
                interval: string;
                description: string;
                startDate: string;
                nextPaymentDate?: string;
                createdAt: string;
                canceledAt?: string;
            }>('GET', `/customers/${opts.customerId}/subscriptions/${subscriptionId}`),
        cancel: (subscriptionId: string, opts: { customerId: string }) =>
            mollieRequest('DELETE', `/customers/${opts.customerId}/subscriptions/${subscriptionId}`),
    },
};

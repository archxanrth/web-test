const express = require('express');
const path = require('path');
const fs = require('fs');
const database = require('./database');
const { pool } = require('./database');
const { promisify } = require('util');
require('dotenv').config();


const app = express();

app.use(express.json());

const stripe = require('stripe')(process.env.STRIPE_PRIVATE_KEY);

// In your route handler
app.get('/productstest', async (req, res) => {
    try {
     
        const productsList = await database.main();
       
        res.json(productsList);
    } catch (error) {
        console.error('Error fetching products list:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/create-checkout-session', async (req, res) => {
    try {
        const stockCheckResults = await checkStockAvailability(req.body.items);
        console.log('Stock Check Results:', stockCheckResults);
        
        if (stockCheckResults.every(result => result.available)) {
            const lineItems = req.body.items.map(item => {
                const storeItem = app.locals.productsList.find(p => p.id === item.id);

                // Convert price to cents
                const unitAmount = storeItem.price * 100;

                return {
                    price_data: {
                        currency: 'gbp',
                        product_data: {
                            name: storeItem.name,
                        },
                        unit_amount: unitAmount,
                    },
                    quantity: item.quantity,
                };
            });

            const successUrl = `${process.env.SERVER_URL}/success.html?items=${encodeURIComponent(JSON.stringify(req.body.items))}`;

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                mode: 'payment',
                line_items: lineItems,
                success_url: successUrl,
                cancel_url: `${process.env.SERVER_URL}/cart`,
            });

            res.json({ url: session.url });
        } else {
            // If stock is not available for some items, send an error response
            res.status(400).json({ error: 'Insufficient stock for some items' });
        }
    } catch (e) {
        console.error('Error in /create-checkout-session:', e);
        res.status(500).json({ error: e.message });
    }
});

// Function to check stock availability
async function checkStockAvailability(items) {
    const stockCheckResults = await Promise.all(items.map(async (item) => {
        const productId = item.id;
        const quantityRequested = item.quantity;

        const storeItem = app.locals.productsList.find(p => p.id === productId);

        if (!storeItem) {
            return { id: productId, available: false };
        }

        const availableStock = storeItem.quantity;

        return {
            id: productId,
            available: quantityRequested <= availableStock,
        };
    }));

    return stockCheckResults;
}
app.get('/success.html', async (req, res) => {
    try {
        const purchasedItems = JSON.parse(req.query.items);

        // Perform the database update logic for purchasedItems
        await Promise.all(purchasedItems.map(async (item) => {
            const productId = item.id;
            const quantityPurchased = item.quantity;

            const storeItem = app.locals.productsList.find(p => p.id === productId);

            if (!storeItem) {
                throw new Error(`Product with ID ${productId} not found.`);
            }

            if (quantityPurchased > storeItem.quantity) {
                throw new Error(`Insufficient stock for product: ${storeItem.name}`);
            }

            const updatedQuantity = storeItem.quantity - quantityPurchased;

            // Update the stock in the database using pool.query
            await promisify(pool.query).bind(pool)('UPDATE products SET quantity = ? WHERE id = ?', [updatedQuantity, productId])
                .then(results => {
                    console.log('Stock updated successfully');
                })
                .catch(err => {
                    console.error('Error updating stock:', err);
                    throw err;
                });
        }));

        res.render('success');  // or send a response indicating success
    } catch (error) {
        console.error('Error in /success.html:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});






const publicDirectory = path.join(__dirname, './public');
app.use(express.static(publicDirectory));

app.set('view engine', 'hbs');

app.get('/views/cart', (req, res) => {
    res.render('cart');
});

app.get('/views/index', (req, res) => {
    res.render('index');
});

app.set('views', path.join(__dirname, 'views'));


// Routes for your Node.js application
app.use('/', require('./routes/pages'));


app.use('/productstest', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});

// Instead of calling runMain immediately, we can use an async function to start the server
async function startServer() {
    try {
        console.log('Starting server...');
        const productsList = await database.main(); // Wait for the productsList to be populated
        app.locals.productsList = productsList; // Set productsList in app.locals
        const PORT = process.env.PORT || 5000;
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Error starting server:', error);
    }
}

// Call the startServer function to start the server
startServer();

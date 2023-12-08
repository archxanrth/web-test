const mysql = require('mysql');
const { promisify } = require('util');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
});

const query = promisify(pool.query).bind(pool);

async function getProducts() {
    try {
        const rows = await query("SELECT * FROM products");
        return rows;
    } catch (error) {
        console.error('Error executing query:', error);
        throw error;
    }
}

async function main() {
    const result = await getProducts();
    const productsList = result.map(row => ({
        name: row.name,
        description: row.description,
        tag: row.tag,
        id: row.id,
        price: row.price,
        inCart: row.inCart,
        quantity: row.quantity,
        image: row.image,
        link: row.link
    }));

    return productsList; // Return the updated array
}

module.exports = {
    pool, // Export the pool object
    getProducts,
    main, // Export the main function
};
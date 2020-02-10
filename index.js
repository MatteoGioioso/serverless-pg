const { Pool, Client } = require("pg");

const client = new Client({
  user: process.env.DB_USER,
  host: "localhost",
  database: process.env.DB_NAME,
  password: "",
  port: process.env.DB_PORT
});

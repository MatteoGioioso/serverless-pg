const http = require('http');
const ServerlessClient = require("../../src");

const hostname = '127.0.0.1';
const port = 3000;

const server = http.createServer(async (req, res) => {
  try {
    const client = new ServerlessClient({
      user: process.env.DB_USER,
      host: "localhost",
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT
    });

    await client.sconnect();
    await client.query(`SELECT NOW()`);
    console.log("connection ok");
    await client.clean();
    res.statusCode = 200;
    res.end()
  } catch (e) {
    console.log(e.message);
  }
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});



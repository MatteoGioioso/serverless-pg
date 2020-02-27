const ServerlessClient = require("./src");

const sleep = delay =>
  new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, delay);
  });

const connect = async event => {
  const client = new ServerlessClient({
    user: process.env.DB_USER,
    host: "localhost",
    database: process.env.DB_NAME,
    password: "",
    port: process.env.DB_PORT
  });

  await client.connect();
  await client.end();
  return "connection ok";
};

(async function () {
  for (let i = 0; i < 150; i++) {
    console.log(i);
    await connect();
  }
})();

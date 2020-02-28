const ServerlessClient = require("./src");

const connect = async i => {
  const client = new ServerlessClient({
    user: process.env.DB_USER,
    host: "localhost",
    database: process.env.DB_NAME,
    password: "",
    port: process.env.DB_PORT
  });
  await client._sleep(Math.random()*10000);
  console.log(i);
  await client.sconnect();
  await client.end();
  return "connection ok";
};

(async function () {
  const promiseArray = [];
  for (let i = 0; i < 200; i++) {
    // console.log(i);
    promiseArray.push(connect(i))
  }

  await Promise.all(promiseArray)
})();

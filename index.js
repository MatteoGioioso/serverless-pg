const ServerlessClient = require("./src");

const _sleep = delay =>
  new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, delay);
  });

const execute = async i => {
  await _sleep(Math.random()*60*250);

  (async () => {
    const client = new ServerlessClient({
      user: process.env.DB_USER,
      host: "localhost",
      database: process.env.DB_NAME,
      password: "",
      port: process.env.DB_PORT
    });

    await client.sconnect();
    const result = await client.query(`SELECT NOW()`);
    console.log(result.rows[0].now, i);
    await client.end();
    return "connection ok";
  })()
};

(async function () {
  const promiseArray = [];
  for (let i = 0; i < 1000; i++) {
    promiseArray.push(execute(i))
  }

  await Promise.all(promiseArray)
})();

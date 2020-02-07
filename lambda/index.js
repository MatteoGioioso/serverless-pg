const { Pool, Client } = require("pg");

const showProcessList = async client => {
  return client.query(
    "SELECT pid,usename,backend_start,state,client_addr FROM pg_stat_activity WHERE datname='postgres' ;"
  );
};

const killProcess = async (client, processId) => {
  return client.query(
    `SELECT pg_terminate_backend(${processId}) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND datname = '${process.env.DB_NAME}';`
  );
};

const connect = async event => {
  const client = new Client({
    user: process.env.DB_USER,
    host: "localhost",
    database: process.env.DB_NAME,
    password: "",
    port: process.env.DB_PORT
  });

  try {
    await client.connect();
    return "connection ok"
  } catch (e) {
    // if (e.message === "sorry, too many clients already") {
    //   const response = await showProcessList(client);
    //   return response.rows
    // }

    return e.message
  }
};

for (let i = 0; i < 105; i++) {
  connect()
    .then(data => {
      console.log(data)
    })
}

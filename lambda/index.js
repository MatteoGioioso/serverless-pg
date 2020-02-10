const { Pool, Client } = require("pg");

const showProcessList = async client => {
  return client.query(
    "SELECT pid,usename,backend_start,state,client_addr FROM pg_stat_activity WHERE datname='postgres' ;"
  );
};

const killProcess = async (client, processId) => {
  return client.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid = '${processId}' AND datname = '${process.env.DB_NAME}';`
  );
};

const sleep = delay =>
  new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, delay);
  });

const getFirstIdleConnectionPid = processesList => {
  const proc = processesList.find(proc => proc.state === "idle");
  return proc.pid;
};

const end = async client => {
  const processesList = (await showProcessList(client)).rows.map(row => {
    const epoch = new Date(row.backend_start).getTime();
    return {
      timeElapsed: Date.now() - epoch,
      pid: row.pid,
      state: row.state
    };
  });

  if (processesList.length === 90) {
    const pid = getFirstIdleConnectionPid(processesList);
    await killProcess(client, pid);
  }
};

const connect = async event => {
  const client = new Client({
    user: process.env.DB_USER,
    host: "localhost",
    database: process.env.DB_NAME,
    password: "",
    port: process.env.DB_PORT
  });

  // We need to swallow these errors as they will terminate the process
  client.on("error", err => {
    if (
      err.message === "terminating connection due to administrator command" ||
      err.message === "Connection terminated unexpectedly"
    ) {
      console.info(err.message);
    } else {
      throw err;
    }
  });

  await client.connect();
  await end(client);
  return "connection ok";
};

(async function() {
  for (let i = 0; i < 150; i++) {
    console.log(i);
    await connect();
  }
})();

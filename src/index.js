const { Client } = require("pg");

function ServerlessClient(config) {
  Client.call(this, config);

  this._config = config;
  this._maxRetries = 10;
  this._retries = 1;

  // pg throws an error if we terminate the connection, therefore we need to swallow these errors
  // and throw the rest
  this.on("error", err => {
    if (
      err.message === "terminating connection due to administrator command" ||
      err.message === "Connection terminated unexpectedly"
    ) {
      // Swallow the error
    } else if (err.message === "sorry, too many clients already") {
      throw err;
    } else {
      throw err;
    }
  });
}

ServerlessClient.prototype = new Client();
ServerlessClient.prototype.constructor = ServerlessClient;
ServerlessClient.prototype._sleep = delay =>
  new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, delay);
  });

ServerlessClient.prototype._getIdleProcessesListOrderByDate = async function() {
  return this.query(
    "SELECT pid,backend_start,state FROM pg_stat_activity WHERE datname='postgres' AND state='idle' ORDER BY backend_start DESC LIMIT 10;"
  );
};

ServerlessClient.prototype._getProcessesCount = async function() {
  const result = await this.query(
    "SELECT COUNT(pid) FROM pg_stat_activity WHERE datname='postgres' AND state='idle';"
  );

  return result.rows[0].count;
};

ServerlessClient.prototype._killProcesses = async function(processesList) {
  let queries = [];
  for (const proc of processesList.rows) {
    queries.push(
      await this.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid = '${proc.pid}' AND datname = '${this._config.database}';`
      )
    );
  }

  return await Promise.all(queries);
};

ServerlessClient.prototype.clean = async function() {
  const processCount = await this._getProcessesCount();

  if (processCount > 50) {
    const processesList = await this._getIdleProcessesListOrderByDate();
    await this._killProcesses(processesList);
  }
};

ServerlessClient.prototype.sconnect = async function() {
  try {
    await this.connect();
  } catch (e) {
    if (e.message === "sorry, too many clients already") {
      const backoff = async delay => {
        if (this._maxRetries > 0) {
          console.log(this._maxRetries, " trying to reconnect... ");
          await this._sleep(delay);
          this._maxRetries--;
          await this.sconnect();
          console.log("Re-connection successful!");
        }
      };

      this._retries++;
      let delay = 1000 * this._retries;
      await backoff(delay);
    } else {
      throw e;
    }
  }
};

module.exports = { ServerlessClient };

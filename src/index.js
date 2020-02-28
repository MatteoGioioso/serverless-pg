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
      // console.info(err.message);
    } else if (err.message === "sorry, too many clients already") {
      // console.log("here ===========================")
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

ServerlessClient.prototype._showProcessList = async function() {
  return this.query(
    "SELECT pid,usename,backend_start,state,client_addr FROM pg_stat_activity WHERE datname='postgres' ;"
  );
};

ServerlessClient.prototype._killProcess = async function(processId) {
  return this.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid = '${processId}' AND datname = '${this._config.database}';`
  );
};

ServerlessClient.prototype._getFirstIdleConnectionPid = function(
  processesList
) {
  const proc = processesList.find(proc => proc.state === "idle");
  return proc.pid;
};

ServerlessClient.prototype.end = async function() {
  const processesList = (await this._showProcessList()).rows.map(row => {
    const epoch = new Date(row.backend_start).getTime();
    return {
      timeElapsed: Date.now() - epoch,
      pid: row.pid,
      state: row.state
    };
  });

  if (processesList.length === 90) {
    const pid = this._getFirstIdleConnectionPid(processesList);
    await this._killProcess(pid);
  }
};

ServerlessClient.prototype.sconnect = async function() {
  try {
    await this.connect();
  } catch (e) {
    if (e.message === "sorry, too many clients already") {
      const backoff = async (delay) => {
        if (this._maxRetries > 0) {
          console.log(this._maxRetries, " trying to reconnect...");
          await this._sleep(delay);
          this._maxRetries--;
          await this.sconnect();
        }
      };

      this._retries++;
      let delay = 1000 * this._retries;
      await backoff(delay)
    } else {
      throw e;
    }
  }
};

module.exports = ServerlessClient;

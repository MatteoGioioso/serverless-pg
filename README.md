[![Serverless-postgres](logo.png)](https://github.com/MatteoGioioso/serverless-pg/)

[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/MatteoGioioso/serverless-pg)
[![npm version](https://badge.fury.io/js/serverless-postgres.svg)](https://badge.fury.io/js/serverless-postgres)
![GitHub](https://img.shields.io/github/license/MatteoGioioso/serverless-pg)\
[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/matteogioioso)

---

### Slow query? Check [Pgex, PostgreSQL query explainer](https://www.pgex.matteogioioso.com/)
[![Slow Query? Use postgres explain](./docs/postgres-explain.png)](https://www.pgex.matteogioioso.com/)

---

## What is serverless-pg?

Serverless-postgres is a wrapper for **[node-pg](https://github.com/brianc/node-postgres)** Node.js module.
It is heavily inspired by Jeremy Daly's **[serverless-mysql](https://github.com/jeremydaly/serverless-mysql)** package.

### Why I need this module?

In a serverless application a function can scale almost "infinitely" by creating separate container instances
for each concurrent user.
Each container can correspond to a database connection which, for performance purposes, is left opened for further
re-utilization. If we have a sudden spike of concurrent traffic, the available connections can be quickly maxed out
by other competing functions.
If we reach the max connections limit, Postgres will automatically reject any frontend trying to connect to its backend.
This can cause heavy disruption in your application.

### What does it do?

Serverless-postgres adds a connection management component specifically for FaaS based applications.
By calling the method `.clean()` at the end of your functions, the module will constantly monitor the status of all
the processes running in the PostgreSQL backend and then, based on the configuration provided,
will garbage collect the "zombie" connections.
If the client fails to connect with `"sorry, too many clients already"` error, the module will retry
using trusted backoff algorithms.

> **NOTE:** This module *should* work with any PostgreSQL server.
> It has been tested with AWS's RDS Postgres, Aurora Postgres, and Aurora Serverless.

Feel free to request additional features and contribute =)

## Install

```bash
npm i serverless-postgres
```

## Usage

Declare the ServerlessClient outside the lambda handler

```javascript
const ServerlessClient = require('serverless-postgres')

const client = new ServerlessClient({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  debug: true,
  delayMs: 3000,
});

const handler = async (event, context) => {
  await client.connect();
  const result = await client.query(`SELECT 1+1 AS result`);
  await client.clean();
  return {
    body: JSON.stringify({ message: result.rows[0] }),
    statusCode: 200
  }
}

```

You can set the configuration dynamically if your secret is stored in a vault

```javascript
const ServerlessClient = require('serverless-postgres')

const client = new ServerlessClient({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
});

const handler = async (event, context) => {
  const { user, password } = await getCredentials('my-secret')
  client.setConfig({
    user, password
  })
  await client.connect();
  // ...rest of the code
}

```

## Connections filtering (>= v2)

This feature leverage postgres `application_name` to differentiate
clients created by this library and others, this will avoid terminating connections belonging to long-running
processes, batch jobs, ect...
By default, we set the same `application_name` parameter for all the serverless clients, if you wish you can change it
by just specifying it in the client config:

```javascript
const client = new ServerlessClient({
  application_name: 'my_client',
});
```

## Plugins (>= v2)

Serverless-postgres is extensible and could be used for any wire compatible postgres engines such as Redshift, Google
Cloud Spanner, CockroachDB, YugabyteDB, etc...
If needed you can write your own plugin implementing the following interface:

```typescript
interface Plugin {
  getIdleProcessesListByMinimumTimeout(self: ServerlessClient): Promise<NodePgClientResponse<ProcessList>>;

  getIdleProcessesListOrderByDate(self: ServerlessClient): Promise<NodePgClientResponse<ProcessList>>;

  processCount(self: ServerlessClient): Promise<NodePgClientResponse<Count>>;

  killProcesses(self: ServerlessClient, pids: string[]): Promise<NodePgClientResponse<any>>;

  showMaxConnections(self: ServerlessClient): Promise<NodePgClientResponse<MaxConnections>>;
}

```

Every function supply as argument the serverless client itself so you can access any configuration parameter such
as `database`, `user`, `applicationName`, `ect...`;
if your changes are minimal you can inherit the main Postgres plugin class:

```javascript
class MyPlugin extends Postgres {
  constructor() {
    super();
  }
  // ...
}
```

You can then use your plugin like this:

```javascript
 const client = new ServerlessClient({
  plugin: new MyServerlessPGPlugin(someObject)
});
```

## Configuration Options

| Property                 | Type                | Description                                                                                                                                                | Default             | Version |
|--------------------------|---------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------|---------|
| config                   | `Object`            | A `node-pg` configuration object as defined [here](https://node-postgres.com/api/client)                                                                   | `{}`                |         |
| maxConnsFreqMs           | `Integer`           | The number of milliseconds to cache lookups of max_connections.                                                                                            | `60000`             |         |
| manualMaxConnections     | `Boolean`           | if this parameters is set to true it will query to get the maxConnections values, to maximize performance you should set the `maxConnections` yourself     | `false`             |         |
| maxConnections           | `Integer`           | Max connections of your PostgreSQL, it should be set equal to `max_connections` in your cluster. I highly suggest to set this yourself                     | `100`               |         |
| strategy                 | `String`            | Name of your chosen strategy for cleaning up "zombie" connections, allowed values `minimum_idle_time` or `ranked`                                          | `minimum_idle_time` |         |
| minConnectionIdleTimeSec | `Integer`           | The minimum number of seconds that a connection must be idle before the module will recycle it.                                                            | `0.5`               |         |
| maxIdleConnectionsToKill | `Integer` or `null` | The amount of max connection that will get killed. Default is `ALL`                                                                                        | `null`              |         |
| connUtilization          | `Number`            | The percentage of total connections to use when connecting to your PostgreSQL server. A value of `0.80` would use 80% of your total available connections. | `0.8`               |         |
| debug                    | `Boolean`           | Enable/disable debugging logs.                                                                                                                             | `false`             |         |
| capMs                    | `Integer`           | Maximum number of milliseconds between connection retries.                                                                                                 | `1000`              |         |
| baseMs                   | `Integer`           | Number of milliseconds added to random backoff values.                                                                                                     | `2`                 |         |
| delayMs                  | `Integer`           | Additional delay to add to the exponential backoff.                                                                                                        | `1000`              |         |
| maxRetries               | `Integer`           | Maximum number of times to retry a connection before throwing an error.                                                                                    | `3`                 |         |
| processCountCacheEnabled | `Boolean`           | Enable caching for get process count.                                                                                                                      | `False`             |         |
| processCountFreqMs       | `Integer`           | The number of milliseconds to cache lookups of process count.                                                                                              | `6000`              |         |
| allowCredentialsDiffing  | `Boolean`           | If you are using dynamic credentials, such as IAM, you can set this parameter to `true` and the client will be refreshed                                   | `false`             |         |
| library                  | `Function`          | Custom postgres library                                                                                                                                    | `require('pg')`     |         |
| application_name         | `String`            | This is postgres specific configuration; serverless-pg uses it to avoid closing other applications connections.                                            | `serverless_client` | `>= v2` |
| plugin                   | `Object`            | This is where you need to initialize your plugin class                                                                                                     | `Postgres`          | `>= v2` |

## Note

- `Serverless-postgres` depends on `pg` package and usually you **do not need to install it on your own**.
  As some users have observed, if you have installed it on your own, and it is a different version,
  this package might misbehave.

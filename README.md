[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/MatteoGioioso/serverless-pg)
[![npm version](https://badge.fury.io/js/serverless-postgres.svg)](https://badge.fury.io/js/serverless-postgres)
![GitHub](https://img.shields.io/github/license/MatteoGioioso/serverless-pg)

# Serverless-postgres

Serverless-postgres is a wrapper for **[node-pg](https://github.com/brianc/node-postgres)** Node.js module.

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
It has been tested with AWS's RDS Postgres, Aurora Postgres, and Aurora Serverless.

Feel free to request additional features and contribute =)

## Install

```bash
npm i serverless-postgres
```

## Usage

Declare the ServerlessClient outside the lambda handler

```js
const client = new ServerlessClient({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    debug: true,
    delayMs: 3000,
});

const handler = async(event, context) => {
    await client.sconnect();
    const result = await client.query(`SELECT NOW()`);
    await client.clean();
    return {
      body: JSON.stringify({message: result}),
      statusCode: 200
    }
}


```


## Configuration Options

| Property | Type | Description | Default |
| -------- | ---- | ----------- | ------- |
| maxRetries | `Integer` | Maximum number of times to retry a connection before throwing an error. | `3` |
| delayMs | `Integer` | Additional delay to add to the exponential backoff. | `1000` |
| baseMs | `Integer` | Number of milliseconds added to random backoff values. | `2` |
| capMs | `Integer` | Maximum number of milliseconds between connection retries. | `100` |
| config | `Object` | A `node-pg` configuration object as defined [here](https://node-postgres.com/api/client) | `{}` |
| connUtilization | `Number` | The percentage of total connections to use when connecting to your PostgreSQL server. A value of `0.80` would use 80% of your total available connections. | `0.8` |
| maxConnections | `Integer` | Max connections of your PostgreSQL. | `100` |
| maxConnsFreqMs | `Integer` | The number of milliseconds to cache lookups of max_connections. | `60000` |
| automaticMaxConnections | `Boolean` | if this parameters is set to true it will query to get the maxConnections values, to maximize performance you should set the `maxConnections` yourself | `false` |
| debug | `Boolean` | Enable/disable debugging logs | `false` |

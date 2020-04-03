[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/MatteoGioioso/serverless-pg)

## Serverless-pg

Manage PostgreSQL connection inside a serverless function.


### Usage

Declare the ServerlessClient outside the lambda handler

```js
const client = new ServerlessClient({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
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

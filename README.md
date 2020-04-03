## Serverless-pg

Manage PostgreSQL connection inside a serverless function.


### Usage

Declare the ServerlessClient outside the lambda handler

```js
const client = new ServerlessClient({
    user: process.env.DB_USER,
    host: "localhost",
    database: process.env.DB_NAME,
    password: "",
    port: process.env.DB_PORT
});

const handler = async(event, context) => {
    await client.sconnect();
    const result = await client.query(`SELECT NOW()`);
    await client.end();
    return {
      body: JSON.stringify({message: result}),
      statusCode: 200
    }
}


```

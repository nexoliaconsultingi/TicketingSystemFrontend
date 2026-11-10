const next = require('next');
const http = require('http');

const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = http.createServer((req, res) => handle(req, res));
  server.listen(process.env.PORT || 3000, () => {
    console.log('> Ready on http://localhost:' + (process.env.PORT || 3000));
  });
});

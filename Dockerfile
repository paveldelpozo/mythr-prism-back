FROM node:20-alpine

WORKDIR /app

ENV PORT=3000

COPY mythr-prism-back/package.json ./package.json

EXPOSE 3000

CMD ["node", "-e", "const http = require('http'); const port = Number(process.env.PORT || 3000); http.createServer((_req, res) => { res.writeHead(501, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ service: 'mythr-prism-back', status: 'not-implemented', message: 'Backend scaffold listo para futura implementacion.' })); }).listen(port, '0.0.0.0', () => console.log('mythr-prism-back placeholder on :' + port));"]

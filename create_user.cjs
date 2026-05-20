const https = require('https');
const data = JSON.stringify({ email: 'admin@segurabot.com.br', password: 'password123', returnSecureToken: true });
const options = {
  hostname: 'identitytoolkit.googleapis.com',
  path: '/v1/accounts:signUp?key=AIzaSyDwHT9cQ2VP9zQFtHUw7J2Z8hVVA8-n_Ro',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
};
const req = https.request(options, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log(body));
});
req.on('error', console.error);
req.write(data);
req.end();

const https = require('https');

const {parse} = JSON;

/** Make a request to a JSON API over HTTPS

  {
    headers: <Request Headers Object>
    timeout: <Timeout Milliseconds Number>
    url: <URL String>
  }

  @returns via cbk
  <Response Object>
  <Response Body Object>
*/
module.exports = ({headers, timeout, url}, cbk) => {
  const state = {is_done: false};

  // Only the first outcome of the request is passed back
  const done = (err, response, body) => {
    if (state.is_done) {
      return;
    }

    state.is_done = true;

    return cbk(err, response, body);
  };

  const req = https.get(url, {headers, timeout}, res => {
    const chunks = [];

    // A response that closes before it is complete was cut off
    res.on('close', () => {
      if (!res.complete) {
        return done(new Error('ResponseClosedBeforeItsEnd'));
      }
    });

    res.on('data', chunk => chunks.push(chunk));

    res.on('end', () => {
      // A body that is not JSON is passed on as no body
      const body = (() => {
        try {
          return parse(Buffer.concat(chunks));
        } catch (err) {
          return undefined;
        }
      })();

      return done(null, {statusCode: res.statusCode}, body);
    });

    res.on('error', err => done(err));
  });

  req.on('timeout', () => req.destroy(new Error('RequestTimedOut')));

  req.on('error', err => done(err));
};

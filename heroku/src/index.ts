import * as express from "express";
import * as bodyParser from "body-parser";
import * as path from "path";
import {createHmac} from "crypto";
// import * as https from "https";
import fetch from "node-fetch";
// import * as http2 from "http2";

const PORT = process.env.PORT || 5000;


const validateSignature = (signature: string | undefined, body: string, loggingId: string): boolean => {
  const alwaysSkipValidation: boolean = process.env.PATREON_VALIDATE_SIGNATURE === "false";

  const patreonWebhookSecret: string | undefined = process.env.PATREON_WEBHOOK_SECRET;
  if (patreonWebhookSecret === undefined) {
    console.log(`[${loggingId}] no shared patreon webhook secret in environment, skipping message signature validation`);
    return true;
  }

  const expectedSignature: string = createHmac("md5", patreonWebhookSecret).update(body ?? "").digest("hex");

  if (alwaysSkipValidation) {
    console.log(`[${loggingId}] skipping (shadow-checking) signature validation due to config`);
    const shadowCheckMessage: string = expectedSignature === signature ? "success" : `failed: got ${signature}, expected ${expectedSignature}`;
    console.log(`[${loggingId}] signature shadow-check ${shadowCheckMessage}`);
    return true;
  }

  if (signature === undefined) {
    console.log(`[${loggingId}] no signature provided in request, exiting`);
    return false;
  }

  if (expectedSignature !== signature) {
    console.log(`[${loggingId}] wrong signature, got ${signature}, expected ${expectedSignature}, exiting`);
    return false;
  }

  return true;
};


// const fetchHttp2 = async (url: string, loggingId: string): Promise<string> => {
//   // create a promise so this function can be called with async/await
//   return new Promise<string>((resolve, reject) => {
//     // parse the url
//     const parsedUrl = new URL(url);

//     // open a http2 connection
//     const session = http2.connect(`https://${parsedUrl.hostname}`);

//     // If there is any error in connecting, log it to the console
//     session.on("error", (err) => {
//       console.log(err);
//       reject(err);
//     });

//     const requestPath: string = parsedUrl.pathname + parsedUrl.search;

//     console.log(`[${loggingId}] http2 fetching path ${requestPath}`);

//     // create the request
//     const req = session.request({
//       ":path": requestPath,
//       ":method": "GET",
//       "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/101.0.4951.58 Mobile/15E148 Safari/604.1",
//       "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
//       "accept-language": "de-DE,de;q=0.9",
//       "accept-encoding": "gzip, deflate, br",
//     });
//     // send the request
//     req.end();

//     // This callback is fired once we receive a response from the server
//     req.on("response", (headers) => {
//       // we can log each response header here
//       console.log(`[${loggingId}] http2 response headers: ${JSON.stringify(headers)}`);
//     });

//     // To fetch the response body, we set the encoding we want and initialize an empty data string
//     req.setEncoding("utf8");
//     let data = "";

//     // append response data to the data string every time we receive new data chunks in the response
//     req.on("data", (chunk) => {
//       data += chunk;
//     });

//     // Once the response is finished, log the entire data that we received
//     req.on("end", () => {
//       // console.log(`${loggingId}]\n${data}`);
//       // In this case, we don't want to make any more requests, so we can close the session
//       session.close();

//       // resolve the promise
//       resolve(data);
//     });
//   });
// };


const scrapeFirstName = async (patreonPatronUid: string, loggingId: string): Promise<string> => {
  const fallbackName = "Anonymous";

  const patreonPatronScrapeUrl = `https://www.patreon.com/user?u=${patreonPatronUid}`;
  console.log(`[${loggingId}] fetching ${patreonPatronScrapeUrl} to scrape`);

  const response = await fetch(patreonPatronScrapeUrl);
  const responseText: string = await response.text();

  // extracting the relevant embedded json data
  const startIdx: number = responseText.indexOf("pageUser");
  const endToken = `https://www.patreon.com/api/user/${patreonPatronScrapeUrl}`;
  const endIdx: number = responseText.indexOf(endToken);

  // ensure scraping worked
  if (startIdx === -1 || endIdx === -1) {
    console.log(`[${loggingId}] unable to scrape response:\n${responseText}`);
    return fallbackName;
  }

  // scrape the response text
  const scrapedText: string = "{\"" + responseText.substring(startIdx, endIdx + endToken.length) + "\"}}}";
  console.log(`[${loggingId}] extracted raw payload: ${scrapedText}`);

  // parse the scraped text
  const scrapedJSON = JSON.parse(scrapedText);

  // try to use the provided firstName
  let firstName: string | undefined = scrapedJSON?.["pageUser"]?.["data"]?.["attributes"]?.["first_name"];

  // extract firstName from fullName instead
  if (!firstName) {
    const fullName: string | undefined = scrapedJSON?.["pageUser"]?.["data"]?.["attributes"]?.["full_name"];
    const idx: number | undefined = fullName?.indexOf(" ");
    if (idx !== undefined && idx !== -1) {
      firstName = fullName?.substring(idx);
    }
  }

  console.log(`[${loggingId}] scraped firstName: ${firstName}`);

  return firstName ?? fallbackName;
};


const getFirstName = async (jsonBody: any, loggingId: string): Promise<string> => {
  // extract patron api url from "data" > "relationships" > "patron" > "links" > "related"
  const patreonPatronUrl: string | undefined = jsonBody["data"]?.["relationships"]?.["patron"]?.["links"]?.["related"];
  console.log(`[${loggingId}] fetching ${patreonPatronUrl}`);

  // extract patron uid from "data" > "relationships" > "patron" > "data" > "id"
  const patreonPatronUid: string | undefined = jsonBody["data"]?.["relationships"]?.["patron"]?.["data"]?.["id"];
  console.log(`[${loggingId}] patron uid ${patreonPatronUid}`);

  if (patreonPatronUid) {
    // fetch via scraping
    const scrapeResult: string = await scrapeFirstName(patreonPatronUid, loggingId);
    console.log(`[${loggingId}] scraping firstName returned: ${scrapeResult}`);
  }

  // fetch that url, extract first name from "data" > "attributes" > "first_name"
  let patreonPatronData: any = undefined;
  if (patreonPatronUrl) {
    // fetch via http2
    // const http2Result = await fetchHttp2(patreonPatronUrl, loggingId);
    // console.log(`[${loggingId}] got http2 fetch result: ${http2Result}`);

    const response = await fetch(patreonPatronUrl);
    const responseText: string = await response.text();
    console.log(`[${loggingId}] fetching first_name got response body: ${responseText}`);

    patreonPatronData = await response.json();
  }

  // logging patreonPatronData
  console.log(`[${loggingId}] patreonPatronData: ${patreonPatronData ? JSON.stringify(patreonPatronData) : "undefined"}`);

  return patreonPatronData?.["data"]?.["attributes"]?.["first_name"] ?? "Anonymous";
};


const patreonWebhookHandler = async (request: express.Request, response: express.Response) => {
  // we expect a Patreon webhook to always be a POST-request
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST").sendStatus(405);
    return;
  }

  const loggingId: string = Date.now().toString();
  console.log(`starting request ${loggingId}`);

  // log request headers
  console.log(request.headers);
  console.log(`[${loggingId}] got header: ${request.header("X-Patreon-Event")}`);

  // log request body
  console.log(`[${loggingId}] raw body: ${request.body}`);

  // validate trigger header
  // we only care about new Patreon supporters
  if (request.header("X-Patreon-Event") !== "pledges:create" && request.header("X-Patreon-Event") !== "members:pledge:create") {
    console.log(`[${loggingId}] wrong header, got: ${request.header("X-Patreon-Event")}, exiting`);
    response.sendStatus(400);
    return;
  }

  // validate signature header
  if (!validateSignature(request.header("X-Patreon-Signature"), request.body, loggingId)) {
    console.log(`[${loggingId}] signature validation failed, exiting`);
    response.sendStatus(401);
    return;
  }

  // digest the message body
  const jsonBody = JSON.parse(request.body ?? "{}");
  console.log(`[${loggingId}] json body: ${JSON.stringify(jsonBody)}`);

  const firstName: string = await getFirstName(jsonBody, loggingId);

  console.log(`[${loggingId}] retrieved first name, ${firstName}`);


  // send an event to StreamElements
  /*
PUT: https://kvstore.streamelements.com/v2/channel/ACCOUNTID/
HEADER: authorization: Bearer TOKEN
BODY: {key: KEYNAME, value: OBJECT}
*/
  /*
    const body = {
      key: "customWidget.patreon.sub",
      value: {
        "timestamp": Date.now(),
        "firstName": firstName,
      },
    };
    const options = {
      host: "kvstore.streamelements.com",
      path: `/v2/channel/${process.env.SE_ACCOUNT_ID}`,
      method: "PUT",
      headers: {
        "authorization": `Bearer ${process.env.SE_AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
    };
    const req = https.request(options, function (res) {
      console.log(`[${loggingId}] STATUS: ` + res.statusCode);
      console.log(`[${loggingId}] HEADERS: ` + JSON.stringify(res.headers));
      res.setEncoding("utf8");
      res.on("data", function (chunk) {
        console.log(`[${loggingId}] BODY: ` + chunk);
      });
    });

    req.on("error", function (e) {
      console.log(`[${loggingId}] problem with request: ` + e.message);
    });

    req.write(JSON.stringify(body));
    req.end();
    */

  response.sendStatus(200);
};


express()
    .use(bodyParser.text({type: ["application/json", "text/*"]})) // necessary to get access to the body
    .use(express.static(path.join(__dirname, "..", "public")))
    .post("/patreonWebhook", patreonWebhookHandler)
    .listen(PORT, () => console.log(`Listening on ${PORT}`));

import * as express from "express";
import * as bodyParser from "body-parser";
import * as path from "path";
import {createHmac} from "crypto";
import * as https from "https";
import fetch from "node-fetch";

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


const getFirstName = async (jsonBody: any): Promise<string> => {
  // extract patron api url from "data" > "relationships" > "patron" > "links" > "related"
  const patreonPatronUrl: string | undefined = jsonBody["data"]?.["relationships"]?.["patron"]?.["links"]?.["related"];
  // fetch that url, extract first name from "data" > "attributes" > "first_name"
  const patreonPatronData: any = patreonPatronUrl ? await fetch(patreonPatronUrl, {
    method: "GET",
  }).then((res) => res.json()) : undefined;
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

  // log complete request
  console.log(request);

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

  const firstName: string = await getFirstName(jsonBody);

  console.log(`[${loggingId}] retrieved first name, ${firstName}`);


  // send an event to StreamElements
  /*
PUT: https://kvstore.streamelements.com/v2/channel/ACCOUNTID/
HEADER: authorization: Bearer TOKEN
BODY: {key: KEYNAME, value: OBJECT}
*/
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
  const req = https.request(options, function(res) {
    console.log(`[${loggingId}] STATUS: ` + res.statusCode);
    console.log(`[${loggingId}] HEADERS: ` + JSON.stringify(res.headers));
    res.setEncoding("utf8");
    res.on("data", function(chunk) {
      console.log(`[${loggingId}] BODY: ` + chunk);
    });
  });

  req.on("error", function(e) {
    console.log(`[${loggingId}] problem with request: ` + e.message);
  });

  req.write(JSON.stringify(body));
  req.end();

  response.sendStatus(200);
};


express()
    .use(bodyParser.text({type: ["application/json", "text/*"]})) // necessary to get access to the body
    .use(express.static(path.join(__dirname, "..", "public")))
    .post("/patreonWebhook", patreonWebhookHandler)
    .listen(PORT, () => console.log(`Listening on ${PORT}`));

import * as functions from "firebase-functions";
import {createHmac} from "crypto";
import * as https from "https";
import fetch from "node-fetch";

export const patreonWebhook = functions
    .runWith({secrets: ["PATREON_WEBHOOK_SECRET", "SE_ACCOUNT_ID", "SE_AUTH_TOKEN"]})
    .https.onRequest(async (request, response) => {
    // we expect a Patreon webhook to always be a POST-request
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST").sendStatus(405);
        return;
      }

      // validate trigger header
      // we only care about new Patreon supporters
      if (request.header("X-Patreon-Event") !== "pledge:create") {
        response.sendStatus(400);
        return;
      }

      // validate signature header
      const patreonWebhookSecret: string | undefined = process.env.PATREON_WEBHOOK_SECRET;
      const rawBody: Buffer | undefined = request.rawBody;
      if (patreonWebhookSecret !== undefined) {
        if (rawBody !== undefined) {
          const expectedSignature: string = createHmac("md5", patreonWebhookSecret).update(request.rawBody).digest("hex");
          if (expectedSignature !== request.header("X-Patreon-Signature")) {
            response.sendStatus(401);
            return;
          }
        } else {
          response.sendStatus(401);
          return;
        }
      } else {
        console.warn("no shared patreon webhook secret in environment, skipping message signature validation.");
      }

      // digest the message body
      const jsonBody = JSON.parse(rawBody.toString("utf8"));
      // extract patron api url from "data" > "relationships" > "patron" > "links" > "related"
      const patreonPatronUrl: string = jsonBody["data"]["relationships"]["patron"]["links"]["related"];
      // fetch that url, extract first name from "data" > "attributes" > "first_name"
      const patreonPatronData: any = await fetch(patreonPatronUrl, {
        method: "GET",
      }).then((res) => res.json());
      const firstName: string = patreonPatronData["data"]["attributes"]["first_name"];


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
        console.log("STATUS: " + res.statusCode);
        console.log("HEADERS: " + JSON.stringify(res.headers));
        res.setEncoding("utf8");
        res.on("data", function(chunk) {
          console.log("BODY: " + chunk);
        });
      });

      req.on("error", function(e) {
        console.log("problem with request: " + e.message);
      });

      req.write(JSON.stringify(body));
      req.end();

      response.sendStatus(200);
    });

import { createHmac } from "crypto";
import * as https from "https";
import fetch from "node-fetch";
import type { VercelRequest, VercelResponse } from '@vercel/node';


const validateSignature = (signature: string | string[] | undefined, body: string, loggingId: string): boolean => {
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


const scrapeFirstName = async (patreonPatronUid: string, fallbackName: string, loggingId: string): Promise<string> => {
    const patreonPatronScrapeUrl = `https://www.patreon.com/user?u=${patreonPatronUid}`;
    console.log(`[${loggingId}] fetching ${patreonPatronScrapeUrl} to scrape`);

    const response = await fetch(patreonPatronScrapeUrl);
    const responseText: string = await response.text();

    // extracting the relevant embedded json data
    const startIdx: number = responseText.indexOf("pageUser");
    const endToken = `https://www.patreon.com/api/user/${patreonPatronUid}`;
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
    // extract patron api url from "data" > "relationships" > "user" > "links" > "related"
    const patreonUserUrl: string | undefined = jsonBody["data"]?.["relationships"]?.["user"]?.["links"]?.["related"];
    console.log(`[${loggingId}] fetching ${patreonUserUrl}`);

    // extract patron uid from "data" > "relationships" > "user" > "data" > "id"
    const patreonUserUid: string | undefined = jsonBody["data"]?.["relationships"]?.["user"]?.["data"]?.["id"];
    console.log(`[${loggingId}] user uid ${patreonUserUid}`);

    const fallbackName = "Anonymous";

    if (patreonUserUid) {
        // fetch via scraping
        const scrapeResult: string = await scrapeFirstName(patreonUserUid, fallbackName, loggingId);
        console.log(`[${loggingId}] scraping firstName returned: ${scrapeResult}`);

        return scrapeResult;
    }

    return fallbackName;
};


export default async (request: VercelRequest, response: VercelResponse) => {
    // a GET-request indicates someone accessing the webhook url directly. Send them to Twitch.
    if (request.method === "GET") {
        const location = `https://${request.headers.host ?? "majijej-toolbox.vercel.app"}/`;
        response.status(302).setHeader("Location", location).send(`Redirecting to <a href="${location}">${location}</a>`);
        return;
    }

    // we expect a Patreon webhook to always be a POST-request
    if (request.method !== "POST") {
        response.setHeader("Allow", "POST").status(405).send("Method Not Allowed");
        return;
    }

    const loggingId: string = Date.now().toString();
    console.log(`starting request ${loggingId}`);

    // log request headers
    console.log(request.headers);
    console.log(`[${loggingId}] got header: ${request.headers["x-patreon-event"]}`);

    // log request body
    console.log(`[${loggingId}] raw body: ${JSON.stringify(request.body)}`);

    // validate trigger header
    // we only care about new Patreon supporters
    if (request.headers["x-patreon-event"] !== "pledges:create" && request.headers["x-patreon-event"] !== "members:pledge:create") {
        console.log(`[${loggingId}] wrong header, got: ${request.headers["x-patreon-event"]}, exiting`);
        response.status(400).send("Bad Request");
        return;
    }

    // validate signature header
    let validateSignatureResult: boolean = false;
    try {
        validateSignatureResult = validateSignature(request.headers["x-patreon-signature"], request.body, loggingId)
    } catch (e: unknown) {
        console.log(`[${loggingId}] signature validation error, ${e}`);
    }
    if (!validateSignatureResult) {
        console.log(`[${loggingId}] signature validation failed, exiting`);
        response.status(401).send("Unauthorized");
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
        response.status(200).send("OK");
    });

    req.on("error", function (e) {
        console.log(`[${loggingId}] problem with request: ` + e.message);
        response.status(500).send("Internal Server Error");
    });

    req.write(JSON.stringify(body));
    req.end();
    console.log(`[${loggingId}] sending put-request to se with body: ${JSON.stringify(body)}`);
};

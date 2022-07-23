const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');
const aliases = require("./aliases");

require("dotenv").config();

// If modifying these scopes, delete token.json.
const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = "token.json";

const ignorePatterns = ["<>", "/", "1", "Happy", "|"];

const creds = require("./credentials");
authorize(creds, listEvents);

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getAccessToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  console.log("Authorize this app by visiting this url:", authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question("Enter the code from that page here: ", (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error("Error retrieving access token", err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log("Token stored to", TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

/**
 * Lists the next 10 events on the user's primary calendar.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function listEvents(auth) {
  const calendar = google.calendar({ version: "v3", auth });
  calendar.events.list(
    {
      calendarId: "primary",
      timeMax: new Date().toISOString(),
      timeMin: new Date(process.env.START_DATE).toISOString(),
      maxResults: 2500,
      singleEvents: true,
      orderBy: "startTime",
    },
    (err, res) => {
      if (err) return console.log("The API returned an error: " + err);
      const events = res.data.items;

      const detailedCSV = events.reduce((acc, event) => {
        const start = event.start.dateTime || event.start.date;
        const summary = event.summary ? event.summary : "";
        const from = new Date(start);
        const formattedFrom = `${from.getFullYear()}-${
          from.getMonth() + 1
        }-${from.getDate()}`;
        const eventCSV = `${summary};${formattedFrom}`;
        if (
          !event.attendees ||
          event.attendees.length < 3 ||
          ignorePatterns.some((pattern) => summary.includes(pattern))
        ) {
          return acc;
        }
        return acc + "\n" + eventCSV;
      }, "Event name;Date");

      fs.writeFile("detailed.csv", detailedCSV, () => {});

      const result = events.reduce((acc, event) => {
        const summary = event.summary?.trim();
        const title =
          aliases[summary] !== undefined ? aliases[summary] : summary;

        if (title) {
          if (!acc[title]) {
            acc[title] = {
              hours: 0,
              count: 0,
            };
          }

          acc[title].count += 1;
          acc[title].hours +=
            (new Date(event.end.dateTime).getTime() -
              new Date(event.start.dateTime).getTime()) /
              1000 /
              60 /
              60 || 0;
        }

        return acc;
      }, {});

      fs.writeFile(
        "result.json",
        JSON.stringify(result, undefined, 2),
        () => {}
      );
    }
  );
}
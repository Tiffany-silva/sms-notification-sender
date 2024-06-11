const express = require('express');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

app.use(bodyParser.json());

// Hardcoded mobile number for POC
const mobileNumber = '94764533127';

// Google API setup
const oAuth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

oAuth2Client.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });
const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

async function getEmailInfo() {
    console.log("retrieving emails");
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread AND subject:"Payment Received: Chai \'n Me"'
  });

  if (!response.data.messages || response.data.messages.length === 0) {
    console.log('No new emails found');
    return null;
  }
  console.log(response.data.messages.length);

  const messageId = response.data.messages[0].id;

  // Mark messages as read
  const markReadResponse = await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      removeLabelIds: ['UNREAD'] // Mark as read
    }
  });
  console.log('Emails marked as read with the response: ' + markReadResponse + "for msgid:" + messageId);

  const message = await gmail.users.messages.get({
    userId: 'me',
    id: messageId
  });
  console.log(message);

  const encodedbody = message.data.payload.parts[0].body.data;

  const decodedBody = Buffer.from(encodedbody, 'base64').toString('utf-8');

  const emailData = decodedBody;
  const paymentReceived = emailData.includes('Payment Received for Chai \'n Me Account') ? 'Yes': 'No';
  const amount =  emailData.match(/Amount Paid: (LKR\s[0-9,]+(\.\d{2})?)/)[1];
  const description = emailData.match(/Description:\s*(.*)/i)[1];
  const timestamp = emailData.match(/Timestamp: ([A-Za-z]+ \d{1,2}, \d{4}, \d{1,2}:\d{2} AM|PM)/i)[1];

  return { paymentReceived, amount, description, timestamp };
}

// Send message to mobile number using vonage.
const postRequest = async (message, number) => {
    const url = 'https://rest.nexmo.com/sms/json';
    const from = 'CHAI \'N ME MERCHANT';

    const params = {
        api_key: process.env.VONAGE_API_KEY,
        api_secret: process.env.VONAGE_API_SECRET,
        to: number,
        from: from,
        text: message
      };
  
      try {
        const response = await axios.post(url, null, { params });
        console.log('Response data:', response.data);
      } catch (error) {
        console.error('Error sending SMS:', error.response ? error.response.data : error.message);
      }
  };

// Invoke sms sending function.
async function sendSmsToNumbers(number, emailInfo) {
    const { paymentReceived, amount, description, timestamp } = emailInfo;
    const message = `Payment received: ${paymentReceived}\nDescription:${description}\n${amount} received on ${timestamp}\n`;
   
    await postRequest(message, number);
}

async function checkEmailsAndSendSms() {
  try {
    console.log("========checking emails=======\n");
    const emailInfo = await getEmailInfo();
    if (emailInfo && emailInfo.paymentReceived) {
        console.log(emailInfo);
        await sendSmsToNumbers(mobileNumber, emailInfo);
    }
  } catch (error) {
    console.error('Error processing emails', error);
  }
}

// Poll for new emails every 30seconds
setInterval(checkEmailsAndSendSms, 30000);

// Root route handler
app.get('/', (req, res) => {
    res.send('Server is running');
});
  

app.listen(port, (error) => {
    if(!error) {
        console.log("Server is Successfully Running, and App is listening on port "+ port);
    } else {
        console.log("Error occurred, server can't start", error);
     }
  console.log(`Server running on port ${port}`);
});

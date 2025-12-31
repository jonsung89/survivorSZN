const SMS_MODE = process.env.SMS_MODE || 'mock';

let twilioClient = null;

if (SMS_MODE === 'twilio') {
  const twilio = require('twilio');
  twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
}

const generateCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendSMS = async (phone, message) => {
  if (SMS_MODE === 'mock') {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📱 MOCK SMS to ${phone}:`);
    console.log(`   ${message}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return { success: true, mock: true };
  }

  try {
    const result = await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });
    return { success: true, sid: result.sid };
  } catch (error) {
    console.error('Twilio error:', error);
    throw new Error('Failed to send SMS');
  }
};

const sendVerificationCode = async (phone, code) => {
  const message = `🏈 NFL Survivor Pool: Your verification code is ${code}. It expires in 10 minutes.`;
  return sendSMS(phone, message);
};

const sendPickReminder = async (phone, leagueName, week) => {
  const message = `🏈 NFL Survivor Pool Reminder: You haven't made your Week ${week} pick for "${leagueName}" yet! Don't forget to pick before games start.`;
  return sendSMS(phone, message);
};

module.exports = {
  generateCode,
  sendVerificationCode,
  sendPickReminder,
  SMS_MODE
};

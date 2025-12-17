const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || '*', // Use env var or allow all if not set
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from the parent directory (frontend)
app.use(express.static(path.join(__dirname, '../')));

// 1. Endpoint to get Paystack Public Key
app.get('/api/config', (req, res) => {
    res.json({
        key: process.env.PAYSTACK_PUBLIC_KEY
    });
});

// 2. Endpoint to verify payment and send Telegram notification
app.post('/api/verify', async (req, res) => {
    const { reference, email, name, amount } = req.body;

    if (!reference || !email) {
        return res.status(400).json({ status: false, message: 'Missing transaction reference or email' });
    }

    try {
        // Verify transaction with Paystack
        const paystackResponse = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
            headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
            }
        });

        const data = paystackResponse.data;

        if (data.status && data.data.status === 'success') {
            // Payment verified successfully
            const verifiedAmount = data.data.amount / 100; // Paystack returns amount in kobo

            // Send Telegram Notification
            const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
            const chatId = process.env.TELEGRAM_CHAT_ID;
            const identifier = process.env.NOTIFICATION_IDENTIFIER || 'PAYMENT_RECEIVED';

            const message = `
✅ *NEW PAYMENT RECEIVED*

🆔 *Identifier:* ${identifier}
👤 *Name:* ${name || 'N/A'}
📧 *Email:* ${email}
💰 *Amount:* ₦${verifiedAmount}
REF: \`${reference}\`

_Please check your dashboard._
            `.trim();

            try {
                await axios.post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'Markdown'
                });
                console.log('Telegram notification sent successfully');
            } catch (tgError) {
                console.error('Telegram notification failed:', tgError.response ? tgError.response.data : tgError.message);
                // We still treat the payment as success even if notification fails, checking the logs is enough
            }

            return res.json({ status: true, message: 'Payment verified and notification sent' });

        } else {
            return res.status(400).json({ status: false, message: 'Payment verification failed at gateway' });
        }

    } catch (error) {
        console.error('Verification error:', error.response ? error.response.data : error.message);
        return res.status(500).json({ status: false, message: 'Internal server error during verification' });
    }
});

// 3. Endpoint for Contact Form
app.post('/api/contact', async (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ status: false, message: 'All fields are required' });
    }

    // Send Telegram Notification
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    // Construct the message
    const tgMessage = `
📩 *NEW CONTACT INQUIRY*

👤 *Name:* ${name}
📧 *Email:* ${email}

📝 *Message:*
${message}
    `.trim();

    try {
        await axios.post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
            chat_id: chatId,
            text: tgMessage,
            parse_mode: 'Markdown'
        });
        console.log('Contact form notification sent to Telegram');
        return res.json({ status: true, message: 'Message sent successfully' });
    } catch (tgError) {
        console.error('Telegram notification failed:', tgError.response ? tgError.response.data : tgError.message);
        return res.status(500).json({ status: false, message: 'Failed to send message. Please try again later.' });
    }
});

// 3. Fallback route for index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

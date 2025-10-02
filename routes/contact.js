import express from 'express';
import dotenv from 'dotenv';
import Contact from '../models/Contact.js';
dotenv.config();

const contactRouter = express.Router();

contactRouter.post('/form-submit', async (req, res, next) => {
    const { fullName, email, subject, message, recaptchaToken } = req.body;

    if (!recaptchaToken) {
        const err = new Error('Missing reCAPTCHA token');
        err.status = 400;
        return next(err);
    }

    try {
        // Verify reCAPTCHA token
        const verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
        const params = new URLSearchParams();
        params.append('secret', process.env.RECAPTCHA_SECRET_KEY);
        params.append('response', recaptchaToken);

        const verifyRes = await fetch(verifyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });

        const verifyData = await verifyRes.json();

        if (!verifyData.success || verifyData.score < 0.5) {
            const err = new Error('Failed reCAPTCHA validation or low score');
            err.status = 400;
            return next(err);
        }

        // ✅ reCAPTCHA passed — process form (e.g., save to DB)
        let contact = await Contact.findOne({ email });

        if (contact) {
            // Add new user message with subject
            contact.messages.push({
                sender: "user",
                message,
                subject,       // store subject per message
                read: false,   // mark as unread by default
            });
            await contact.save();
        } else {
            // Create new thread with first message
            contact = await Contact.create({
                fullName,
                email,
                messages: [{
                    sender: "user",
                    message,
                    subject,     // store subject per message
                    read: false, // unread by default
                }],
            });
        }


        res.status(200).json({ success: true });

        // You can save this data in MongoDB or send an email
        return res.status(200).json({ success: true });

    } catch (err) {
        return next(err);
    }
});

export default contactRouter;

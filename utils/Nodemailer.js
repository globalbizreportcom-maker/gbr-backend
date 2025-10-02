import nodemailer from "nodemailer";


// Nodemailer Transporter (Brevo SMTP)
const transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    auth: {
        user: '9707b5001@smtp-brevo.com', // your Brevo SMTP login
        pass: 'YhJNOvL1wsjfEk8n', // your Brevo SMTP password
    },
});

export default transporter;

import express from 'express';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import cors from 'cors'
import contactRouter from './routes/contact.js';
import helmet from 'helmet';
import http from "http";

dotenv.config();

const app = express();
const server = http.createServer(app);

const PORT = 5000;


// Always use basic Helmet protections
app.use(helmet());

// Advanced headers — only in PRODUCTION
if (process.env.NODE_ENV === "production") {
    // Content Security Policy (CSP)
    app.use(
        helmet.contentSecurityPolicy({
            directives: {
                defaultSrc: ["'self'"],
                imgSrc: ["'self'", "data:", "https:"],
                scriptSrc: ["'self'"], // allow inline if needed, not recommended
                styleSrc: ["'self'", "'unsafe-inline'"], // allow inline styles if required
                connectSrc: ["'self'"],
                fontSrc: ["'self'", "https:", "data:"],
                objectSrc: ["'none'"],
                upgradeInsecureRequests: [],
            },
        })
    );

    // Strict Transport Security (HSTS) - enforce HTTPS
    app.use((req, res, next) => {
        res.setHeader(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains"
        );
        next();
    });

    // Referrer Policy
    app.use(
        helmet.referrerPolicy({
            policy: "no-referrer",
        })
    );

    // Permissions Policy - restrict APIs
    app.use(
        helmet.permissionsPolicy({
            features: {
                geolocation: ["'none'"],
                microphone: ["'none'"],
                camera: ["'none'"],
            },
        })
    );
}

// Disable x-powered-by always
app.disable("x-powered-by");


// Middleware
app.use(express.json());
app.use(cors());



app.use('/contact', contactRouter);


// Connect to DB then start server
const startServer = async () => {
    await connectDB();
    server.listen(PORT, () =>
        console.log(`Server running at http://localhost:${PORT}`)
    );
};

startServer();


// Global error handler middleware
app.use((err, req, res, next) => {
    console.error('Global error handler:', err.message);
    res.status(err.status || 500).json({
        error: 'Internal Server Error'
    });
});

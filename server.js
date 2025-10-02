import express from 'express';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import cors from 'cors'
import contactRouter from './routes/contact.js';
import helmet from 'helmet';
import http from "http";
import adminRouter from './routes/admin/AdminRouter.js';
import Admin from './models/Admin.js';
import cookieParser from 'cookie-parser';
import { Company } from './models/company.js';
import axios from 'axios';
import registrationRouter from './routes/registration.js';
import loginRouter from './routes/login.js';
import userRouter from './routes/User.js';
import { capturePaypalPayment, createOrder, createPaypalOrder, verifyPayment } from './controllers/paymentController.js';
import { checkOrCreateUser } from './controllers/userController.js';

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
    // app.use(
    //     helmet.permissionsPolicy({
    //         features: {
    //             geolocation: ["'none'"],
    //             microphone: ["'none'"],
    //             camera: ["'none'"],
    //         },
    //     })
    // );
}

// Disable x-powered-by always
app.disable("x-powered-by");

// Middleware
const allowedOrigins = ["http://localhost:3000", "https://globalbizreport.com", "https://www.globalbizreport.com", 'https://backend.globalbizreport.com'];
app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error("Not allowed by CORS"));
            }
        },
        credentials: true,
    })
);
app.use(express.json());
app.use(cookieParser());


// routes
app.use("/user", userRouter);
app.use('/register', registrationRouter);
app.use('/login', loginRouter);
app.use('/contact', contactRouter);
app.use("/admin", adminRouter);
// Razorpay
app.post("/api/payment/create-order", createOrder);
app.post("/api/payment/verify", verifyPayment);
// PayPal
app.post("/api/payment/create-paypal-order", createPaypalOrder);
app.post("/api/payment/capture-paypal", capturePaypalPayment);

app.post("/api/users/check-or-create", checkOrCreateUser);

// base api 
app.get("/", (req, res) => {
    res.json({ message: "Backend connected successfully" });
});


// create admin users
const createSuperAdmin = async () => {
    try {
        const existing = await Admin.findOne({ userName: "gbr001" });
        if (existing) {
            console.log("Superadmin already exists");
            process.exit(0);
        }

        const admin = new Admin({
            userName: "gbr001",
            password: "gbr@123",
            role: "superadmin",
        });

        await admin.save();
        console.log("Superadmin created successfully");
        process.exit(0);
    } catch (err) {
        console.error("Error creating superadmin:", err);
        process.exit(1);
    }
};

async function fetchAllData() {
    const apiKey = "579b464db66ec23bdd000001fb32a8e4a50f47956e1cb75ccdabfa2e";
    const resourceId = "4dbe5667-7b6b-41d7-82af-211562424d9a"; // dataset id
    const limit = 100;
    let offset = 0;
    let totalFetched = 0;

    while (true) {
        try {
            const res = await axios.get(
                `https://api.data.gov.in/resource/${resourceId}`,
                {
                    params: {
                        "api-key": apiKey,
                        format: "json",
                        limit,
                        offset,
                    },
                }
            );

            const records = res.data.records || [];
            if (records.length === 0) break; // stop when no data left

            console.log(`Fetched ${records.length} records at offset ${offset}`);

            // Insert into MongoDB
            await Company.insertMany(records, { ordered: false });

            totalFetched += records.length;
            offset += limit;
        } catch (err) {
            console.error("❌ Error fetching data:", err.message);
            break;
        }
    }

    console.log(`✅ Finished. Total records fetched: ${totalFetched}`);
}


// fetchAllData()



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
    console.log('Global error handler:', err.message);
    res.status(err.status || 500).json({
        error: 'Internal Server Error'
    });
});

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
import axios from 'axios';
import registrationRouter from './routes/registration.js';
import loginRouter from './routes/login.js';
import userRouter from './routes/User.js';
import { capturePaypalPayment, createOrder, createPaypalOrder, handlePaymentCancelled, sendPaymentCancelledEmail, verifyPayment } from './controllers/paymentController.js';
import { checkOrCreateUser } from './controllers/userController.js';
import multer from 'multer';
import visitorsRouter from './routes/visitor.js';
import fs from "fs";
import rateLimit from 'express-rate-limit';
import { CronJob } from "cron";
import { Buffer } from 'buffer';
import User from './models/User.js';
import ReportRequest from './models/ReportRequest.js';

import pkg from "pg";
const { Pool } = pkg;


const app = express();

app.set("trust proxy", 1);

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
const allowedOrigins = [
    // "http://localhost:3000",// --dev
    /\.globalbizreport\.com$/,
    "https://globalbizreport.com",
    "https://www.globalbizreport.com",
    'https://backend.globalbizreport.com'
];

app.use(
    cors({
        origin: (origin, callback) => {
            // if (!origin || allowedOrigins.includes(origin)) {
            //     callback(null, true);
            // } else {
            //     callback(new Error("Not allowed by CORS"));
            // }
            if (!origin || allowedOrigins.some(o =>
                (typeof o === "string" && o === origin) ||
                (o instanceof RegExp && o.test(origin))
            )) {
                callback(null, true);
            } else {
                console.warn("CORS blocked origin:", origin);
                callback(new Error("Not allowed by CORS"));
            }

        },
        credentials: true,
    })
);

// 🔹 meta limiter — all routes
const metaLimiter = rateLimit({
    windowMs: 60 * 1000,
    message: { error: "Too many requests, please try again later." },
    max: 100, // 100 requests per minute
});

// ✅ Optional limiter (protect this endpoint from abuse)
const companiesLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // max 50 requests per IP per minute
    message: { error: "Too many requests. Please try again later." },
});

// Optional rate limiter
const fastLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 min
    max: 30,
    message: "Too many requests, slow down!"
});

app.use(express.json());
app.use(cookieParser());


// routes
app.use("/user", userRouter);
app.use('/register', registrationRouter);
app.use('/login', loginRouter);
app.use('/contact', contactRouter);
app.use("/admin", adminRouter);
app.use("/visitors", visitorsRouter);

// Razorpay
app.post("/api/payment/create-order", createOrder);
app.post("/api/payment/verify", verifyPayment);
// PayPal
app.post("/api/payment/create-paypal-order", createPaypalOrder);
app.post("/api/payment/capture-paypal", capturePaypalPayment);
// failed orders
app.post("/api/payment/cancellation", handlePaymentCancelled);

app.post("/api/users/check-or-create", checkOrCreateUser);

// Folder to store uploaded files temporarily
const upload = multer({ dest: "uploads/" });




// PostgreSQL client setup
const pool = new Pool({
    host: process.env.PG_HOST_REMOTE || "195.35.23.249",
    port: Number(process.env.PG_PORT) || 5432,
    database: process.env.PG_DATABASE || "gbr",
    user: process.env.PG_USER || "gbr_user",
    password: process.env.PG_PASSWORD || "6!qZe@8.gwZ,F?Y",
    idleTimeoutMillis: 0, // close idle clients after 30s
    connectionTimeoutMillis: 0, // wait max 5s to connect
});

// Connect once when the server starts
(async () => {
    try {
        await pool.connect();
        console.log("Connected to PostgreSQL!");
    } catch (err) {
        console.log("Connection failed:");
        console.log(err);
    }
})();







// base api  
app.get("/", (req, res) => {
    res.json({ message: "Backend connected successfully ___" });
});

app.get('/api/companies/search', async (req, res) => {
    const { q } = req.query; // search term

    if (!q || q.trim() === '') {
        return res.json({ companies: [] });
    }

    try {
        const result = await pool.query(
            `SELECT cin, companyname
             FROM companies
             WHERE companyname LIKE $1
             LIMIT 20;`,
            [`%${q}%`]
        );

        // map over rows to return only company names
        res.json({ companies: result.rows.map(r => r.companyname) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch companies' });
    }
});















// PostgreSQL version of /companies-meta
app.get("/companies-meta", metaLimiter, async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) AS total FROM companies");
        const total = Number(result.rows[0].total);

        res.setHeader("Cache-Control", "public, max-age=86400");
        res.json({ total });
    } catch (error) {
        console.log("Error fetching meta:", error);
        res.status(500).json({ total: 0, error: "meta fetch failed" });
    }
});

// PostgreSQL version of /companies-directory
app.get("/companies-directory", companiesLimiter, async (req, res) => {
    try {
        const { lastId = 0, perPage = 10000 } = req.query;

        const query = `
        SELECT id, cin, companyname, companystatecode
        FROM companies
        WHERE id > $1
        ORDER BY id ASC
        LIMIT $2
      `;

        const result = await pool.query(query, [Number(lastId), Number(perPage)]);
        res.json({ success: true, rows: result.rows });
    } catch (err) {
        console.error("Error in /companies-directory:", err);
        res.status(500).json({ error: "Server error." });
    }
});

// PostgreSQL company details page
app.get("/api/company-details", metaLimiter, async (req, res) => {
    const { cin } = req.query;

    if (!cin) {
        return res.status(400).json({ error: "CIN is required" });
    }

    try {
        const result = await pool.query(
            `SELECT * FROM companies WHERE cin = $1`,
            [cin]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Company not found" });
        }

        res.status(200).send(result.rows[0]); // return single object, since CIN is unique
    } catch (err) {
        console.error("Error fetching company by CIN:", err);
        res.status(500).json({ error: "Database error" });
    }
});

app.get("/search-companies", companiesLimiter, async (req, res) => {
    try {
        let { company = "", country = "", state = "", page = 1, perPage = 20 } = req.query;

        page = Number(page);
        perPage = Number(perPage);
        const offset = (page - 1) * perPage;

        const normalizedCountry = country.trim().toLowerCase();
        const normalizedState = state.trim().toLowerCase();
        const hasCompany = company.trim().length > 0;
        const hasState = normalizedCountry === "india" && normalizedState.length > 0;

        let rows = [];
        let totalRows = 0;

        const useFTS = hasCompany && company.trim().length >= 3; // FTS only for >=3 chars

        if (useFTS) {
            // ✅ 1. Clean up the query safely
            const cleanFTSQuery = (str) =>
                str
                    .replace(/[^\w\s]/g, " ") // remove punctuation
                    .replace(/\s+/g, " ")     // collapse multiple spaces
                    .trim()
                    .toLowerCase();

            const cleanedCompany = cleanFTSQuery(company);

            if (!cleanedCompany) {
                res.json({ totalRows: 0, totalPages: 0, page, perPage, rows: [] });
                return;
            }

            // ✅ 2. Build FTS query for PostgreSQL
            // Convert to tsquery: split words and join with & for AND search
            const ftsKeyword = cleanedCompany
                .split(/\s+/)
                .map(k => `${k}:*`) // prefix match
                .join(" & ");

            const whereParts = [`to_tsvector('english', "companyname") @@ to_tsquery('english', $1)`];
            const values = [ftsKeyword];

            if (hasState) {
                values.push(normalizedState);
                whereParts.push(`LOWER(TRIM("CompanyStateCode")) = $2`);
            }

            const whereClause = whereParts.join(" AND ");

            // ✅ 3. Total count
            const totalResult = await pool.query(
                `SELECT COUNT(*) AS total
                 FROM companies
                 WHERE ${whereClause}`,
                values
            );
            totalRows = parseInt(totalResult.rows[0].total);

            // ✅ 4. Fetch rows
            const rowsResult = await pool.query(
                `SELECT *
                 FROM companies
                 WHERE ${whereClause}
                 ORDER BY "companyname" ASC
                 LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
                [...values, perPage, offset]
            );
            rows = rowsResult.rows;

            // ✅ 5. Fallback to LIKE if no results
            if (rows.length === 0) {
                const likeValues = [`${company}%`];
                let likeClause = `"companyname" ILIKE $1`;
                if (hasState) {
                    likeValues.push(normalizedState);
                    likeClause += ` AND LOWER(TRIM("CompanyStateCode")) = $2`;
                }

                const totalLikeResult = await pool.query(
                    `SELECT COUNT(*) AS total
                     FROM companies
                     WHERE ${likeClause}`,
                    likeValues
                );
                totalRows = parseInt(totalLikeResult.rows[0].total);

                const rowsLikeResult = await pool.query(
                    `SELECT *
                     FROM companies
                     WHERE ${likeClause}
                     ORDER BY "companyname" ASC
                     LIMIT $${likeValues.length + 1} OFFSET $${likeValues.length + 2}`,
                    [...likeValues, perPage, offset]
                );
                rows = rowsLikeResult.rows;
            }
        } else {
            // LIKE search for short queries
            const likeValues = [`${company}%`];
            let likeClause = `"companyname" ILIKE $1`;
            if (hasState) {
                likeValues.push(normalizedState);
                likeClause += ` AND LOWER(TRIM("companystatecode")) = $2`;
            }

            const totalLikeResult = await pool.query(
                `SELECT COUNT(*) AS total
                 FROM companies
                 WHERE ${likeClause}`,
                likeValues
            );
            totalRows = parseInt(totalLikeResult.rows[0].total);

            const rowsLikeResult = await pool.query(
                `SELECT *
                 FROM companies
                 WHERE ${likeClause}
                 ORDER BY "companyname" ASC
                 LIMIT $${likeValues.length + 1} OFFSET $${likeValues.length + 2}`,
                [...likeValues, perPage, offset]
            );
            rows = rowsLikeResult.rows;
        }

        const totalPages = Math.ceil(totalRows / perPage);
        res.json({ totalRows, totalPages, page, perPage, rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

// user side companies-dir
app.get("/user/companies-dir", fastLimiter, async (req, res) => {
    try {
        const { page = 1, company = "", alphabet, state, industry, companyType, status } = req.query;

        const stateNormalized = state?.trim().toLowerCase();

        const perPage = 20;
        const offset = (page - 1) * perPage;

        const filters = [];
        const params = [];

        // --- Dynamic filters ---
        if (company) {
            filters.push(`"companyname" ILIKE $${params.length + 1}`); // case-insensitive
            params.push(`${company}%`);
        }
        if (alphabet) {
            filters.push(`"companyname" ILIKE $${params.length + 1}`);
            params.push(`${alphabet}%`);
        }
        if (stateNormalized) {
            filters.push(`LOWER("companystatecode") = $${params.length + 1}`);
            params.push(stateNormalized.trim().toLowerCase());
        }
        if (industry) {
            filters.push(`"companyindustrialclassification" = $${params.length + 1}`);
            params.push(industry);
        }
        if (companyType) {
            filters.push(`"companyclass" = $${params.length + 1}`);
            params.push(companyType);
        }
        if (status) {
            filters.push(`"companystatus" = $${params.length + 1}`);
            params.push(status);
        }

        const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

        // --- Total count ---
        const totalResult = await pool.query(`SELECT COUNT(*) AS total FROM companies ${whereClause}`, params);
        const total = Number(totalResult.rows[0].total);
        const totalPages = Math.ceil(total / perPage);

        // --- Paginated rows ---
        const rows = await pool.query(`
            SELECT cin, companyname, companystatecode, companyclass,companystatus,registered_office_address
            FROM companies
            ${whereClause}
            ORDER BY "companystatecode" ASC, "companyname" ASC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `, [...params, perPage, offset]);

        res.json({
            rows: rows.rows,
            totalPages,
            totalResults: total,
            page: Number(page),
            perPage
        });

    } catch (err) {
        console.error("Companies Fast Error:", err);
        res.status(500).json({
            rows: [],
            totalPages: 0,
            totalResults: 0,
            error: "Fetch failed"
        });
    }
});


const createAdminManually = async () => {
    try {


        const userName = "gbr002";
        const password = "gbrvb@3112";
        // const userName = "gbr003";
        // const password = "gbr@rishikesh";
        const role = "superadmin";

        // Check if admin already exists
        const existing = await Admin.findOne({ userName });
        if (existing) {
            console.log(" Admin already exists:", userName);
            return;
        }

        // Create admin
        const newAdmin = new Admin({ userName, password, role });
        await newAdmin.save();

    } catch (err) {
        console.log("❌ Error creating admin:", err.message);
    }
};

// ✅ Call the function directly
// createAdminManually();


// 1️⃣ Get access token
async function getAccessToken() {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const res = await fetch("https://api.paypal.com/v1/oauth2/token", {
        method: "POST",
        headers: {
            "Authorization": `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
    });

    const data = await res.json();
    return data.access_token;
}

// // 2️⃣ Create order
// app.post("/create-order", async (req, res) => {
//     try {
//         const { amount } = req.body;
//         const accessToken = await getAccessToken();

//         const orderRes = await fetch("https://api.paypal.com/v2/checkout/orders", {
//             method: "POST",
//             headers: {
//                 "Authorization": `Bearer ${accessToken}`,
//                 "Content-Type": "application/json",
//             },
//             body: JSON.stringify({
//                 intent: "CAPTURE",
//                 purchase_units: [{ amount: { currency_code: "USD", value: amount } }],
//             }),
//         });

//         const orderData = await orderRes.json();
//         res.json(orderData);
//         return;

//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ error: "Something went wrong" });
//     }
// });

// // 3️⃣ Capture payment
// app.post("/capture-order", async (req, res) => {
//     try {
//         const { orderId } = req.body;
//         const accessToken = await getAccessToken();

//         const captureRes = await fetch(`https://api.paypal.com/v2/checkout/orders/${orderId}/capture`, {
//             method: "POST",
//             headers: {
//                 "Authorization": `Bearer ${accessToken}`,
//                 "Content-Type": "application/json",
//             },
//         });

//         const captureData = await captureRes.json();
//         res.json(captureData);
//         return;

//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ error: "Something went wrong" });
//         return;

//     }
// });






// const listUniqueCompanyPayments = async () => {
//     const results = await ReportRequest.aggregate([
//         // 1. Join Payment records
//         {
//             $lookup: {
//                 from: "payments",
//                 localField: "_id",
//                 foreignField: "reportRequest",
//                 as: "payments"
//             }
//         },

//         // 2. Add paid flag
//         {
//             $addFields: {
//                 paid: {
//                     $in: ["paid", "$payments.status"]
//                 }
//             }
//         },

//         // 3. Group by (user + companyName)
//         {
//             $group: {
//                 _id: {
//                     user: "$requester",
//                     companyName: "$targetCompany.name"
//                 },
//                 paid: { $max: "$paid" },  // if any is paid → paid = true
//                 paymentIds: { $addToSet: "$payments._id" },  // collect all payment IDs
//                 reportRequestIds: { $addToSet: "$_id" }      // collect all related reportRequest IDs
//             }
//         },

//         // 4. Lookup user data
//         {
//             $lookup: {
//                 from: "users",
//                 localField: "_id.user",
//                 foreignField: "_id",
//                 as: "userInfo"
//             }
//         },

//         // 5. Flatten user
//         {
//             $unwind: "$userInfo"
//         },

//         // 6. Final clean output
//         {
//             $project: {
//                 _id: 0,
//                 userId: "$_id.user",
//                 email: "$userInfo.email",
//                 companyName: "$_id.companyName",
//                 paid: 1,
//                 reportRequestIds: 1,
//                 paymentIds: {
//                     // flatten nested arrays inside arrays
//                     $reduce: {
//                         input: "$paymentIds",
//                         initialValue: [],
//                         in: { $concatArrays: ["$$value", "$$this"] }
//                     }
//                 }
//             }
//         }
//     ]);
//     console.log(results);
//     return results;
// };


const listUniqueCompanyPayments = async () => {
    const results = await ReportRequest.aggregate([

        // 1. Join payments
        {
            $lookup: {
                from: "payments",
                localField: "_id",
                foreignField: "reportRequest",
                as: "payments"
            }
        },

        // 2. Add paid flag
        {
            $addFields: {
                paid: { $in: ["paid", "$payments.status"] }
            }
        },

        // 3. Group unique (user + companyName)
        //    AND sort inside group to extract latest record
        {
            $group: {
                _id: {
                    user: "$requester",
                    companyName: "$targetCompany.name"
                },

                paid: { $max: "$paid" },

                // store all reportRequests, but sorted by createdAt DESC
                reportRequests: {
                    $push: {
                        createdAt: "$createdAt",
                        doc: "$$ROOT"
                    }
                },

                // store all payments (flatten), sorted by createdAt DESC
                paymentArrays: {
                    $push: {
                        createdAt: { $ifNull: [{ $arrayElemAt: ["$payments.createdAt", 0] }, null] },
                        payment: { $arrayElemAt: ["$payments", 0] }
                    }
                }
            }
        },

        // 4. Lookup user data
        {
            $lookup: {
                from: "users",
                localField: "_id.user",
                foreignField: "_id",
                as: "userInfo"
            }
        },
        { $unwind: "$userInfo" },

        // 5. Extract LATEST items
        {
            $project: {
                _id: 0,

                userId: "$_id.user",
                email: "$userInfo.email",
                companyName: "$_id.companyName",
                paid: 1,

                // sort reportRequests DESC → take latest
                latestReportRequest: {
                    $arrayElemAt: [
                        {
                            $sortArray: {
                                input: "$reportRequests",
                                sortBy: { createdAt: -1 }
                            }
                        },
                        0
                    ]
                },

                // sort payments DESC → take latest
                latestPayment: {
                    $arrayElemAt: [
                        {
                            $sortArray: {
                                input: "$paymentArrays",
                                sortBy: { createdAt: -1 }
                            }
                        },
                        0
                    ]
                }
            }
        },

        // 6. Final projection
        {
            $project: {
                userId: 1,
                email: 1,
                companyName: 1,
                paid: 1,

                reportRequestId: "$latestReportRequest.doc._id",

                paymentId: "$latestPayment.payment._id",

                // company
                address: "$latestReportRequest.doc.targetCompany.address",
                city: "$latestReportRequest.doc.targetCompany.city",
                state: "$latestReportRequest.doc.targetCompany.state",
                country: "$latestReportRequest.doc.targetCompany.country",
                postalCode: "$latestReportRequest.doc.targetCompany.postalCode",
                telephone: "$latestReportRequest.doc.targetCompany.phone",
                website: "$latestReportRequest.doc.targetCompany.website",

                // requester
                contactName: "$latestReportRequest.doc.requesterInfo.name",
                contactEmail: "$latestReportRequest.doc.requesterInfo.email",
                contactCountry: "$latestReportRequest.doc.requesterInfo.country",
                contactState: "$latestReportRequest.doc.requesterInfo.state",
                companyGst: "$latestReportRequest.doc.requesterInfo.gst",
                contactPhone: "$latestReportRequest.doc.requesterInfo.phone",
                contactCompany: "$latestReportRequest.doc.requesterInfo.company",
                optionalEmail: "$latestReportRequest.doc.requesterInfo.optionalEmail",

                // payment info (latest)
                paymentAmount: "$latestPayment.payment.amount",
                paymentCreatedAt: "$latestPayment.payment.createdAt",
                currency: "$latestPayment.payment.currency"
            }
        }
    ]);

    return results;
};


export const processAbandonedPayments = async () => {
    const items = await listUniqueCompanyPayments();
    const now = new Date();

    for (const item of items) {
        // skip paid items
        if (item.paid === true) continue;

        // safety check
        if (!item.paymentCreatedAt) continue;

        const paymentDate = new Date(item.paymentCreatedAt);
        const diffDays = Math.floor((now - paymentDate) / (1000 * 60 * 60 * 24));


        // ----------------------------------
        // 🔥 3-Day Reminder Email
        // ----------------------------------
        if (diffDays === 3) {

            const emailData = {
                // basic
                userId: item.userId,
                email: item.email,
                companyName: item.companyName,
                paid: item.paid,

                // ids
                reportRequestId: item.reportRequestId,
                paymentId: item.paymentId,

                // company details
                address: item.address,
                city: item.city,
                state: item.state,
                country: item.country,
                postalCode: item.postalCode,
                telephone: item.telephone,
                website: item.website,

                // requester details
                contactName: item.contactName,
                contactEmail: item.contactEmail,
                contactCountry: item.contactCountry,
                contactState: item.contactState,
                companyGst: item.companyGst,
                contactPhone: item.contactPhone,
                contactCompany: item.contactCompany,
                optionalEmail: item.optionalEmail,

                // payment details
                paymentAmount: item.paymentAmount,
                paymentCreatedAt: item.paymentCreatedAt,
                currency: item.currency,

                // what type of email is this?
                type: '3-day-reminder' // "3-day-reminder" or "10-day-final"
            };


            await sendPaymentCancelledEmail(item.userId, emailData);
        }

        // ----------------------------------
        // 🔥 10-Day Final Abandoned Email
        // ----------------------------------
        if (diffDays === 10) {

            const emailData = {
                // basic
                userId: item.userId,
                email: item.email,
                companyName: item.companyName,
                paid: item.paid,

                // ids
                reportRequestId: item.reportRequestId,
                paymentId: item.paymentId,

                // company details
                address: item.address,
                city: item.city,
                state: item.state,
                country: item.country,
                postalCode: item.postalCode,
                telephone: item.telephone,
                website: item.website,

                // requester details
                contactName: item.contactName,
                contactEmail: item.contactEmail,
                contactCountry: item.contactCountry,
                contactState: item.contactState,
                companyGst: item.companyGst,
                contactPhone: item.contactPhone,
                contactCompany: item.contactCompany,
                optionalEmail: item.optionalEmail,

                // payment details
                paymentAmount: item.paymentAmount,
                paymentCreatedAt: item.paymentCreatedAt,
                currency: item.currency,

                // what type of email is this?
                type: "10-day-final" // "3-day-reminder" or "10-day-final"
            };


            await sendPaymentCancelledEmail(item.userId, emailData);
        }
    }
};


// const job = new CronJob(
//     '0 9 * * *', // 9 AM every day
//     async () => {
//         console.log("Running job at 9 AM US Eastern");
//         try {
//             await processAbandonedPayments();
//         } catch (err) {
//             console.error("Error in abandoned payments cron:", err);
//         }
//     },
//     null, // onComplete
//     true, // start immediately
//     "America/New_York" // timezone
// );





// Connect to DB then start server



const startServer = async () => {
    await connectDB();
    server.listen(PORT, () =>
        console.log(`Server running at port ${PORT}`)
    );
};

startServer();


// Global error handler middleware
// app.use((err, req, res, next) => {
//     console.log('Global error handler:', err.message);
//     res.status(err.status || 500).json({
//         error: 'Internal Server Error'
//     });
// });

app.use((err, req, res, next) => {
    console.log('Global error handler:', err.message);
    if (res.headersSent) {
        return next(err); // already sent, delegate to default handler
    }
    res.status(err.status || 500).json({ error: 'Internal Server Error' });
});

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
import Database from 'better-sqlite3';
import { Buffer } from 'buffer';
import User from './models/User.js';
import ReportRequest from './models/ReportRequest.js';

const db = new Database("./sqldb/companies.db");


dotenv.config();

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


// base api  
app.get("/", (req, res) => {
    res.json({ message: "Backend connected successfully ***" });
});

app.get("/companies-meta", metaLimiter, (req, res) => {
    try {
        // ✅ Fastest query possible — just one COUNT(*)
        const total = db.prepare("SELECT COUNT(*) AS total FROM companies").get().total;

        // Assuming perPage = 20 like your main route
        const totalPages = Math.ceil(total / 20);

        // ✅ Cache headers for 24 hours (Google doesn’t need live data)
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.json({ totalPages });
    } catch (error) {
        console.error("Error fetching meta:", error);
        res.status(500).json({ totalPages: 0, error: "meta fetch failed" });
    }
});

app.get("/api/company-details", metaLimiter, (req, res) => {
    const { query = "", state = "", cin = "" } = req.query;

    try {
        const cleanedQuery = query
            .toLowerCase()
            .replace(/[^\w\s]/g, " ") // remove special chars
            .trim();

        // ✅ If CIN is provided, directly fetch that record
        if (cin) {
            const cinRow = db.prepare(`SELECT * FROM companies WHERE CIN = ?`).get(cin);
            if (cinRow) return res.json([cinRow]);
        }

        // ✅ No CIN? then search by name/state
        if (!cleanedQuery && !state) {
            return res.json([]);
        }

        const ftsKeyword = `%${cleanedQuery}%`;
        let ftsSql = `SELECT rowid, CompanyName, CompanyStateCode FROM companies_fts WHERE 1=1`;
        const ftsParams = [];

        if (cleanedQuery) {
            // normalize DB side too
            ftsSql += ` AND LOWER(REPLACE(CompanyName, '-', ' ')) LIKE ?`;
            ftsParams.push(ftsKeyword);
        }

        if (state) {
            ftsSql += ` AND LOWER(CompanyStateCode) = ?`;
            ftsParams.push(state.toLowerCase());
        }

        const ftsRows = db.prepare(ftsSql).all(ftsParams);
        if (!ftsRows.length) return res.json([]);

        const rowIds = ftsRows.map(r => r.rowid);
        const mainSql = `SELECT * FROM companies WHERE rowid IN (${rowIds.map(() => "?").join(",")})`;
        const rows = db.prepare(mainSql).all(rowIds);

        res.json(rows);
        return;

    } catch (err) {

        res.status(500).json({ error: "Database error" });
        return;

    }
});

app.get("/api/companies", (req, res) => {
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

        // if (useFTS) {
        //     const ftsKeyword = company.trim().split(/\s+/).map(k => `${k}*`).join(" ");
        //     const ftsParams = { keyword: ftsKeyword };
        //     if (hasState) ftsParams.state = normalizedState;

        //     const whereParts = ["fts.CompanyName MATCH @keyword"];
        //     if (hasState) whereParts.push("LOWER(TRIM(c.CompanyStateCode)) = @state");
        //     const whereClause = whereParts.join(" AND ");

        //     totalRows = db.prepare(`
        //   SELECT COUNT(*) AS total
        //   FROM companies c
        //   JOIN companies_fts fts ON c.rowid = fts.rowid
        //   WHERE ${whereClause}
        // `).get(ftsParams).total;

        //     rows = db.prepare(`
        //   SELECT c.*
        //   FROM companies c
        //   JOIN companies_fts fts ON c.rowid = fts.rowid
        //   WHERE ${whereClause}
        //   LIMIT @perPage OFFSET @offset
        // `).all({ ...ftsParams, perPage, offset });

        //     // fallback to LIKE if FTS returns 0
        //     if (rows.length === 0) {
        //         const likeParams = { keyword: `${company}%` };
        //         if (hasState) likeParams.state = normalizedState;

        //         totalRows = db.prepare(`
        //     SELECT COUNT(*) AS total
        //     FROM companies
        //     WHERE CompanyName LIKE @keyword
        //     ${hasState ? "AND LOWER(TRIM(CompanyStateCode)) = @state" : ""}
        //   `).get(likeParams).total;

        //         rows = db.prepare(`
        //     SELECT *
        //     FROM companies
        //     WHERE CompanyName LIKE @keyword
        //     ${hasState ? "AND LOWER(TRIM(CompanyStateCode)) = @state" : ""}
        //     LIMIT @perPage OFFSET @offset
        //   `).all({ ...likeParams, perPage, offset });
        //     }

        // } 
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

            // ✅ 2. Build FTS keyword using wildcards (*)
            const ftsKeyword = cleanedCompany
                .split(/\s+/)
                .map(k => `${k}*`)
                .join(" ");

            const ftsParams = { keyword: ftsKeyword };
            if (hasState) ftsParams.state = normalizedState;

            // ✅ 3. Build WHERE clause properly (fts.CompanyName MATCH ...)
            const whereParts = ["fts.CompanyName MATCH @keyword"];
            if (hasState) whereParts.push("LOWER(TRIM(c.CompanyStateCode)) = @state");
            const whereClause = whereParts.join(" AND ");

            // ✅ 4. Perform FTS query first
            totalRows = db.prepare(`
                SELECT COUNT(*) AS total
                FROM companies c
                JOIN companies_fts fts ON c.rowid = fts.rowid
                WHERE ${whereClause}
            `).get(ftsParams).total;

            rows = db.prepare(`
                SELECT c.*
                FROM companies c
                JOIN companies_fts fts ON c.rowid = fts.rowid
                WHERE ${whereClause}
                LIMIT @perPage OFFSET @offset
            `).all({ ...ftsParams, perPage, offset });

            // ✅ 5. If no results, gracefully fallback to LIKE
            if (rows.length === 0) {
                const likeParams = { keyword: `${company}%` };
                if (hasState) likeParams.state = normalizedState;

                totalRows = db.prepare(`
                    SELECT COUNT(*) AS total
                    FROM companies
                    WHERE CompanyName LIKE @keyword
                    ${hasState ? "AND LOWER(TRIM(CompanyStateCode)) = @state" : ""}
                `).get(likeParams).total;

                rows = db.prepare(`
                    SELECT *
                    FROM companies
                    WHERE CompanyName LIKE @keyword
                    ${hasState ? "AND LOWER(TRIM(CompanyStateCode)) = @state" : ""}
                    LIMIT @perPage OFFSET @offset
                `).all({ ...likeParams, perPage, offset });
            }
        }

        else {
            // LIKE search for short queries
            const likeParams = { keyword: `${company}%` };
            if (hasState) likeParams.state = normalizedState;

            totalRows = db.prepare(`
          SELECT COUNT(*) AS total
          FROM companies
          WHERE CompanyName LIKE @keyword
          ${hasState ? "AND LOWER(TRIM(CompanyStateCode)) = @state" : ""}
        `).get(likeParams).total;

            rows = db.prepare(`
          SELECT *
          FROM companies
          WHERE CompanyName LIKE @keyword
          ${hasState ? "AND LOWER(TRIM(CompanyStateCode)) = @state" : ""}
          LIMIT @perPage OFFSET @offset
        `).all({ ...likeParams, perPage, offset });
        }

        const totalPages = Math.ceil(totalRows / perPage);
        res.json({ totalRows, totalPages, page, perPage, rows });
        return;


    } catch (err) {
        res.status(500).json({ error: "Server error" });
        return;

    }
});


// Optional rate limiter
const fastLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 min
    max: 30,
    message: "Too many requests, slow down!"
});

// GET /companies-fast
app.get("/companies-fast", fastLimiter, (req, res) => {
    try {
        const { page = 1, company = "", alphabet, state, industry, companyType, status } = req.query;

        const perPage = 20;
        const offset = (page - 1) * perPage;

        // Build filters dynamically
        const filters = [];
        const params = [];

        if (company) {
            filters.push("LOWER(CompanyName) LIKE ?");
            params.push(`%${company.toLowerCase()}%`);
        }
        if (alphabet) {
            filters.push("LOWER(CompanyName) LIKE ?");
            params.push(`${alphabet.toLowerCase()}%`);
        }
        if (state) {
            filters.push("LOWER(CompanyStateCode) = ?");
            params.push(state.toLowerCase());
        }
        if (industry) {
            filters.push("LOWER(CompanyIndustrialClassification) = ?");
            params.push(industry.toLowerCase());
        }
        if (companyType) {
            filters.push("LOWER(CompanyClass) = ?");
            params.push(companyType.toLowerCase());
        }
        if (status) {
            filters.push("LOWER(CompanyStatus) = ?");
            params.push(status.toLowerCase());
        }

        const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

        // ✅ Total count for pagination
        const total = db.prepare(`SELECT COUNT(*) AS total FROM companies ${whereClause}`).get(...params).total;

        // ✅ Paginated data with ordering by state then name
        const rows = db.prepare(`
            SELECT * FROM companies
            ${whereClause}
            ORDER BY LOWER(CompanyStateCode) ASC, LOWER(CompanyName) ASC
            LIMIT ? OFFSET ?
        `).all(...params, perPage, offset);


        const totalPages = Math.ceil(total / perPage);

        res.json({
            rows,
            totalPages,
            totalResults: total,
            page: Number(page),
            perPage
        });

    } catch (err) {
        res.status(500).json({ rows: [], totalPages: 0, totalResults: 0, error: "Fetch failed" });
    }
});



// GET /companies-fast
// app.get("/companies-fast", fastLimiter, (req, res) => {
//     try {
//         const {
//             page = 1,
//             company = "",
//             alphabet,
//             state,
//             industry,
//             companyType,
//             status,
//             orderByState = false // optional flag to order by state
//         } = req.query;

//         const perPage = 20;
//         const offset = (page - 1) * perPage;

//         // Build filters dynamically
//         const filters = [];
//         const params = [];

//         if (company) {
//             filters.push("CompanyName LIKE ?");
//             params.push(`%${company}%`);
//         }
//         if (alphabet) {
//             filters.push("CompanyName LIKE ?");
//             params.push(`${alphabet}%`);
//         }
//         if (state) {
//             filters.push("CompanyStateCode = ?");
//             params.push(state);
//         }
//         if (industry) {
//             filters.push("Industry = ?");
//             params.push(industry);
//         }
//         if (companyType) {
//             filters.push("CompanyType = ?");
//             params.push(companyType);
//         }
//         if (status) {
//             filters.push("CompanyStatus = ?");
//             params.push(status);
//         }

//         const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

//         // Total count for pagination
//         const total = db.prepare(`SELECT COUNT(*) AS total FROM companies ${whereClause}`).get(...params).total;

//         // Build ORDER BY
//         let orderBy = "";
//         if (filters.length === 0) {
//             // No filters → order alphabetically A-Z first, then numbers/symbols
//             orderBy = `
//                 ORDER BY 
//                 CASE 
//                     WHEN CompanyName GLOB '[A-Za-z]*' THEN 0
//                     ELSE 1
//                 END,
//                 CompanyName ASC
//             `;
//             if (orderByState) {
//                 orderBy = `ORDER BY CompanyStateCode ASC, ` + orderBy.replace("ORDER BY", "");
//             }
//         } else {
//             // If filters exist → default order by CompanyName
//             orderBy = "ORDER BY CompanyName ASC";
//         }

//         // Fetch paginated rows
//         const rows = db.prepare(`SELECT * FROM companies ${whereClause} ${orderBy} LIMIT ? OFFSET ?`)
//             .all(...params, perPage, offset);

//         const totalPages = Math.ceil(total / perPage);

//         res.json({
//             rows,
//             totalPages,
//             totalResults: total,
//             page: Number(page),
//             perPage
//         });
//     } catch (err) {
//         console.error("Error fetching fast companies:", err);
//         res.status(500).json({ rows: [], totalPages: 0, totalResults: 0, error: "Fetch failed" });
//     }
// });



// ✅ Optional limiter (protect this endpoint from abuse)
const companiesLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // max 50 requests per IP per minute
    message: { error: "Too many requests. Please try again later." },
});

// ✅ Optimized & safe route handler using old working column names
app.get("/companies-directory", companiesLimiter, (req, res) => {
    try {
        let {
            perPage = 20,
            offset = 0
        } = req.query;

        perPage = Math.min(100, parseInt(perPage) || 20);
        offset = parseInt(offset) || 0;

        // ✅ Select only essential columns
        const dataStmt = db.prepare(`
            SELECT CIN, CompanyName, CompanyStateCode
            FROM companies
            ORDER BY rowid ASC
            LIMIT @perPage OFFSET @offset
        `);

        const rows = dataStmt.all({ perPage, offset });

        res.status(200).json({
            success: true,
            perPage,
            offset,
            rows,
            total: db.prepare("SELECT COUNT(*) as count FROM companies").get().count
        });

    } catch (err) {
        console.log("Error in /companies-directory:", err);
        res.status(500).json({ error: "Server error. Please try again later." });
    }
});





// app.get("/companies-directory", (req, res) => {
//     try {
//         let {
//             company = "",
//             country = "",
//             state = "",
//             industry = "",
//             companyType = "",
//             status = "",
//             alphabet = "",
//             page = 1,
//             perPage = 20
//         } = req.query;

//         page = Number(page) || 1;
//         perPage = Number(perPage) || 20;
//         const offset = (page - 1) * perPage;

//         company = (company || "").trim();
//         country = (country || "").trim().toLowerCase();
//         state = (state || "").trim().toLowerCase();
//         industry = (industry || "").trim();
//         companyType = (companyType || "").trim();
//         status = (status || "").trim();
//         alphabet = (alphabet || "").trim();

//         const whereClauses = [];
//         const params = {};

//         if (company) {
//             whereClauses.push("CompanyName LIKE @company");
//             params.company = `%${company}%`;
//         }

//         if (alphabet) {
//             whereClauses.push("CompanyName LIKE @alphabet");
//             params.alphabet = `${alphabet}%`;
//         }

//         if (country) {
//             whereClauses.push("LOWER(TRIM(Country)) = @country");
//             params.country = country;
//         }

//         if (state) {
//             whereClauses.push("LOWER(TRIM(CompanyStateCode)) = @state");
//             params.state = state;
//         }

//         if (industry) {
//             // Correct column name (change "Industry" if your DB uses another name)
//             whereClauses.push("CompanyIndustrialClassification = @industry");
//             params.industry = industry;
//         }

//         if (companyType) {
//             whereClauses.push("CompanyClass = @companyType");
//             params.companyType = companyType;
//         }

//         if (status) {
//             whereClauses.push("CompanyStatus = @status");
//             params.status = status;
//         }

//         const whereSQL = whereClauses.length ? "WHERE " + whereClauses.join(" AND ") : "";

//         const totalRows = db.prepare(`
//             SELECT COUNT(*) AS total
//             FROM companies
//             ${whereSQL}
//         `).get(params).total;

//         const totalPages = Math.ceil(totalRows / perPage);

//         const rows = db.prepare(`
//             SELECT *
//             FROM companies
//             ${whereSQL}
//             LIMIT @perPage OFFSET @offset
//         `).all({ ...params, perPage, offset });
//         res.json({ totalRows, totalPages, page, perPage, rows });
//         return;

//     } catch (err) {
//         res.status(500).json({ error: "Server error" });
//         return;

//     }
// });

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

    console.log(results);
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


const job = new CronJob(
    '0 9 * * *', // 9 AM every day
    async () => {
        console.log("Running job at 9 AM US Eastern");
        try {
            await processAbandonedPayments();
        } catch (err) {
            console.error("Error in abandoned payments cron:", err);
        }
    },
    null, // onComplete
    true, // start immediately
    "America/New_York" // timezone
);





























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

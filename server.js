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
import { capturePaypalPayment, createOrder, createPaypalOrder, handlePaymentCancelled, verifyPayment } from './controllers/paymentController.js';
import { checkOrCreateUser } from './controllers/userController.js';
import { getFuseForState } from './search/fuseSetup.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs'
import csv from "csv-parser";
import { loadAllJsonsToSQLite } from './utils/loadAllJsonsToSQLite.js';


import Database from 'better-sqlite3';

const db = new Database("./sqldb/companies.db");


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
const allowedOrigins = [
    // "http://localhost:3000", --dev
    "https://globalbizreport.com",
    "https://www.globalbizreport.com",
    'https://backend.globalbizreport.com'
];

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
// failed orders
app.post("/api/payment/cancellation", handlePaymentCancelled);


app.post("/api/users/check-or-create", checkOrCreateUser);

// base api 
app.get("/", (req, res) => {
    res.json({ message: "Backend connected successfully" });
});

// Folder to store uploaded files temporarily
const upload = multer({ dest: "uploads/" });


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

// app.get("/api/company-details", (req, res) => {
//     const { query = "", state = "", cin = "" } = req.query;

//     try {
//         let sql = `SELECT * FROM companies WHERE 1=1`;
//         const params = [];

//         if (query) {
//             sql += ` AND CompanyName LIKE ?`;
//             params.push(`%${query}%`);
//         }
//         if (state) {
//             sql += ` AND CompanyStateCode LIKE ?`;
//             params.push(`%${state}%`);
//         }
//         if (cin) {
//             sql += ` AND CIN = ?`;
//             params.push(cin);
//         }

//         const rows = db.prepare(sql).all(params); // ✅ synchronous
//         console.log(rows);
//         res.json(rows);
//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ error: "Database error" });
//     }
// });


app.get("/api/company-details", (req, res) => {
    const { query = "", state = "", cin = "" } = req.query;

    try {
        // Step 1: Clean query for FTS search
        const cleanedQuery = query
            .toLowerCase()
            .replace(/[^\w\s]/g, " ") // remove special chars
            .trim();

        if (!cleanedQuery && !state && !cin) {
            return res.json([]); // no filters, return empty
        }

        // Wrap with % for partial match
        const ftsKeyword = `%${cleanedQuery}%`;

        // Step 2: Search in FTS table
        let ftsSql = `SELECT rowid, CompanyName, CompanyStateCode FROM companies_fts WHERE 1=1`;
        const ftsParams = [];

        if (cleanedQuery) {
            ftsSql += ` AND LOWER(CompanyName) LIKE ?`;
            ftsParams.push(ftsKeyword);
        }

        if (state) {
            ftsSql += ` AND LOWER(CompanyStateCode) = ?`;
            ftsParams.push(state.toLowerCase());
        }

        const ftsRows = db.prepare(ftsSql).all(ftsParams);

        if (!ftsRows.length) return res.json([]); // No matches

        const rowIds = ftsRows.map(r => r.rowid);
        console.log(rowIds);
        // Step 3: Fetch full company details from main table
        let mainSql = `SELECT * FROM companies WHERE rowid IN (${rowIds.map(() => "?").join(",")})`;
        const mainParams = [...rowIds];

        if (cin) {
            mainSql += ` AND CIN = ?`;
            mainParams.push(cin);
        }

        const rows = db.prepare(mainSql).all(mainParams);

        res.json(rows);
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).json({ error: "Database error" });
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

        if (useFTS) {
            const ftsKeyword = company.trim().split(/\s+/).map(k => `${k}*`).join(" ");
            const ftsParams = { keyword: ftsKeyword };
            if (hasState) ftsParams.state = normalizedState;

            const whereParts = ["fts.CompanyName MATCH @keyword"];
            if (hasState) whereParts.push("LOWER(TRIM(c.CompanyStateCode)) = @state");
            const whereClause = whereParts.join(" AND ");

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

            // fallback to LIKE if FTS returns 0
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

        } else {
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

    } catch (err) {
        console.error("❌ Server error:", err);
        res.status(500).json({ error: "Server error" });
    }
});





function searchCompanyFTS(query, state = "") {
    if (!query) return [];

    // Clean query
    const cleanedQuery = query
        .toLowerCase()
        .replace(/[^\w\s]/g, " ") // remove special chars
        .trim();

    // Wrap with % for partial match
    const keyword = `%${cleanedQuery}%`;

    let sql = `SELECT * FROM companies_fts WHERE LOWER(CompanyName) LIKE ?`;
    const params = [keyword];

    if (state) {
        sql += " AND LOWER(CompanyStateCode) = ?";
        params.push(state.toLowerCase());
    }

    console.log("SQL:", sql, "Params:", params);

    const rows = db.prepare(sql).all(params);
    return rows;
}

// ---------------- Example usage ----------------
// const results = searchCompanyFTS("sun", "assam");
// console.log("Results:", results);







function getCounts(dbPath = "./sqldb/companies.db") {
    const db = new Database(dbPath, { readonly: true });

    const totalCompanies = db.prepare(`SELECT COUNT(*) AS count FROM companies`).get().count;
    const totalCompaniesFTS = db.prepare(`SELECT COUNT(*) AS count FROM companies_fts`).get().count;

    db.close();
    return { totalCompanies, totalCompaniesFTS };
}

// const counts = getCounts();
// console.log(counts);

function fetchCompaniesStartingWithInState(keyword = "sun", state = "", limit = 10, dbPath = "./sqldb/companies.db") {
    const db = new Database(dbPath, { readonly: true });

    let query = `SELECT * FROM companies WHERE CompanyName LIKE @keyword`;
    const params = { keyword: `${keyword}%`, limit };

    if (state) {
        // Just lowercase and trim, no space removal
        query += ` AND LOWER(TRIM(CompanyStateCode)) = @state`;
        params.state = state.trim().toLowerCase();
    }

    query += ` LIMIT @limit`;

    const rows = db.prepare(query).all(params);
    db.close();
    return rows;
}

// Example usage: first 10 companies starting with "sun" in Tamil Nadu
// const sunCompaniesTN = fetchCompaniesStartingWithInState("sun", "", 2);
// console.log(sunCompaniesTN);



























// db.prepare(`DROP TABLE IF EXISTS companies`).run();
// db.prepare(`DROP TABLE IF EXISTS companies_fts`).run();

// Run
// loadAllJsonsToSQLite("./data", "./sqldb/companies.db");









































// Connect to DB then start server
const startServer = async () => {
    await connectDB();
    server.listen(PORT, () =>
        console.log(`Server running at port ${PORT}`)
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

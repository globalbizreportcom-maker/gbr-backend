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
import multer from 'multer';
import visitorsRouter from './routes/visitor.js';
import fs from "fs";


import Database from 'better-sqlite3';
import { Buffer } from 'buffer';
import User from './models/User.js';

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
    "http://localhost:3000",// --dev
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
    res.json({ message: "Backend connected successfully *_*" });
});



app.get("/api/company-details", (req, res) => {
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
    } catch (err) {

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
                return res.json({ totalRows: 0, totalPages: 0, page, perPage, rows: [] });
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

    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

app.get("/companies-directory", (req, res) => {
    try {
        let {
            company = "",
            country = "",
            state = "",
            industry = "",
            companyType = "",
            status = "",
            alphabet = "",
            page = 1,
            perPage = 20
        } = req.query;

        page = Number(page) || 1;
        perPage = Number(perPage) || 20;
        const offset = (page - 1) * perPage;

        company = (company || "").trim();
        country = (country || "").trim().toLowerCase();
        state = (state || "").trim().toLowerCase();
        industry = (industry || "").trim();
        companyType = (companyType || "").trim();
        status = (status || "").trim();
        alphabet = (alphabet || "").trim();

        const whereClauses = [];
        const params = {};

        if (company) {
            whereClauses.push("CompanyName LIKE @company");
            params.company = `%${company}%`;
        }

        if (alphabet) {
            whereClauses.push("CompanyName LIKE @alphabet");
            params.alphabet = `${alphabet}%`;
        }

        if (country) {
            whereClauses.push("LOWER(TRIM(Country)) = @country");
            params.country = country;
        }

        if (state) {
            whereClauses.push("LOWER(TRIM(CompanyStateCode)) = @state");
            params.state = state;
        }

        if (industry) {
            // Correct column name (change "Industry" if your DB uses another name)
            whereClauses.push("CompanyIndustrialClassification = @industry");
            params.industry = industry;
        }

        if (companyType) {
            whereClauses.push("CompanyClass = @companyType");
            params.companyType = companyType;
        }

        if (status) {
            whereClauses.push("CompanyStatus = @status");
            params.status = status;
        }

        const whereSQL = whereClauses.length ? "WHERE " + whereClauses.join(" AND ") : "";

        const totalRows = db.prepare(`
            SELECT COUNT(*) AS total
            FROM companies
            ${whereSQL}
        `).get(params).total;

        const totalPages = Math.ceil(totalRows / perPage);

        const rows = db.prepare(`
            SELECT *
            FROM companies
            ${whereSQL}
            LIMIT @perPage OFFSET @offset
        `).all({ ...params, perPage, offset });
        res.json({ totalRows, totalPages, page, perPage, rows });
    } catch (err) {
        res.status(500).json({ error: "Server error" });
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

// 2️⃣ Create order
app.post("/create-order", async (req, res) => {
    try {
        const { amount } = req.body;
        const accessToken = await getAccessToken();

        const orderRes = await fetch("https://api.paypal.com/v2/checkout/orders", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                intent: "CAPTURE",
                purchase_units: [{ amount: { currency_code: "USD", value: amount } }],
            }),
        });

        const orderData = await orderRes.json();
        res.json(orderData);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Something went wrong" });
    }
});

// 3️⃣ Capture payment
app.post("/capture-order", async (req, res) => {
    try {
        const { orderId } = req.body;
        const accessToken = await getAccessToken();

        const captureRes = await fetch(`https://api.paypal.com/v2/checkout/orders/${orderId}/capture`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });

        const captureData = await captureRes.json();
        res.json(captureData);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Something went wrong" });
    }
});


// Main import function
async function importUsers() {
    try {

        // 2. Read JSON file
        const data = JSON.parse(fs.readFileSync("./data/gbr_customers.json", "utf-8"));

        // 3. Map JSON to Mongoose model fields
        const users = data.map((item) => ({
            name: item.name || "",
            email: item.email?.toLowerCase() || "",
            phone: item.telephone || "",
            country: item.country || "",
            password: "", // optional
            company: item.company_name || "",
            gstin: item.gstin || "",
            createdAt: item.dor ? new Date(item.dor) : new Date(), // ✅ Use 'dor' for createdAt
        }));

        // 4. Insert while avoiding duplicates
        for (const user of users) {
            if (!user.email) continue; // skip if no email
            const exists = await User.findOne({ email: user.email });
            if (exists) {
                console.log(`⚠️ Skipped duplicate: ${user.email}`);
                continue;
            }
            await User.create(user);
            console.log(`✅ Inserted: ${user.email}`);
        }

        console.log("🎉 Import complete!");
    } catch (error) {
        console.log("❌ Error importing users:", error);
    } finally {
        console.log("🔌 MongoDB connection closed.");
    }
}

// importUsers();




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
